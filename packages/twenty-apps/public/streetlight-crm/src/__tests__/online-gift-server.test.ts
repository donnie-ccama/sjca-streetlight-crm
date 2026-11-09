import { beforeEach, describe, expect, it, vi } from 'vitest';

type StoredRecord = Record<string, unknown> & { id: string };

type Store = {
  landingPages: StoredRecord[];
  landingPageInvites: StoredRecord[];
  socialPosts: StoredRecord[];
  pledges: StoredRecord[];
  people: StoredRecord[];
  donations: StoredRecord[];
  donationCredits: StoredRecord[];
  responses: StoredRecord[];
};

const { store } = vi.hoisted(() => ({
  store: {
    landingPages: [],
    landingPageInvites: [],
    socialPosts: [],
    pledges: [],
    people: [],
    donations: [],
    donationCredits: [],
    responses: [],
  } as Store,
}));

type Filter = Record<string, Record<string, unknown> | undefined>;

vi.mock('src/logic-functions/workspace-gql', () => {
  const matches = (record: StoredRecord, filter: Filter): boolean =>
    Object.entries(filter).every(([field, condition]) => {
      if (condition === undefined) return true;

      if (field === 'emails') {
        const expected = (condition.primaryEmail as { eq: string }).eq;

        return (
          (record.emails as { primaryEmail: string }).primaryEmail === expected
        );
      }

      return record[field] === condition.eq;
    });

  const rawQuery = vi.fn(async (selection: Record<string, unknown>) => {
    const rootName = Object.keys(selection)[0] as keyof Store;
    const root = selection[rootName] as { __args: { filter: Filter } };

    if (rootName === 'donations') {
      const ids = (root.__args.filter.onlineTransactionId as { in: string[] })
        .in;
      const rows = store.donations.filter((donation) =>
        ids.includes(donation.onlineTransactionId as string),
      );

      return {
        donations: {
          edges: rows.map((donation) => ({
            node: {
              ...donation,
              donationCredits: {
                edges: store.donationCredits
                  .filter((credit) => credit.donationId === donation.id)
                  .map((node) => ({ node })),
              },
              responses: {
                edges: store.responses
                  .filter((response) => response.donationId === donation.id)
                  .map((node) => ({ node })),
              },
            },
          })),
        },
      };
    }

    const rows = store[rootName].filter((record) =>
      matches(record, root.__args.filter),
    );

    return { [rootName]: { edges: rows.map((node) => ({ node })) } };
  });

  const collectionByType: Record<string, keyof Store> = {
    Person: 'people',
    Donation: 'donations',
    DonationCredit: 'donationCredits',
    Response: 'responses',
  };

  const gql = vi.fn(
    async (query: string, variables: Record<string, unknown> = {}) => {
      const data = variables.data as Record<string, unknown>;
      const create = /create(\w+)\(/.exec(query);

      if (create !== null) {
        const collection = collectionByType[create[1]];
        const id = `${collection}-${store[collection].length + 1}`;

        store[collection].push({ ...data, id });

        return { [`create${create[1]}`]: { id } };
      }

      const update = /update(\w+)\(/.exec(query);

      if (update !== null) {
        const collection = store[collectionByType[update[1]]];

        Object.assign(
          collection.find((record) => record.id === variables.id) ?? {},
          data,
        );

        return { [`update${update[1]}`]: { id: variables.id } };
      }

      throw new Error(`Unexpected query: ${query}`);
    },
  );

  return {
    gql,
    rawQuery,
    rawMutation: vi.fn(),
    gqlEnum: (value: string) => ({ __gqlEnum: value }),
  };
});

vi.mock('twenty-sdk/logic-function', () => ({
  kv: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
}));

import {
  applyOnlineGift,
  createGiftContext,
  markGiftRefundedByPaymentIntent,
} from 'src/logic-functions/online-gift.server';
import type { OnlineGift } from 'src/shared/marketing/online-gift-import';

const GIFT: OnlineGift = {
  id: 'pi_1',
  status: 'succeeded',
  amountCents: 5000,
  currency: 'usd',
  paidAt: '2026-11-01T15:00:00.000Z',
  paymentMethodType: 'card',
  feeCents: 175,
  utm: {},
  landingPageSlug: 'spring',
  inviteCode: null,
  subscriptionId: null,
  supporter: {
    email: 'sam@example.com',
    firstName: 'Sam',
    lastName: 'Giver',
    phone: null,
  },
};

const apply = (gift: OnlineGift = GIFT) =>
  applyOnlineGift({
    gift,
    timeZone: 'UTC',
    context: createGiftContext(),
  });

beforeEach(() => {
  for (const collection of Object.values(store)) collection.length = 0;

  store.landingPages.push({
    id: 'page-1',
    slug: 'spring',
    fund: { id: 'fund-1' },
    fundraisingCampaign: { id: 'campaign-1' },
  });
});

describe('applyOnlineGift', () => {
  it('creates a gift with fund and campaign from the page', async () => {
    expect(await apply()).toBe('created');

    expect(store.donations).toHaveLength(1);
    expect(store.donations[0]).toMatchObject({
      onlineTransactionId: 'pi_1',
      landingPageId: 'page-1',
      fundId: 'fund-1',
      fundraisingCampaignId: 'campaign-1',
    });
    expect(store.donationCredits).toHaveLength(1);
    expect(store.donationCredits[0]).toMatchObject({
      donationId: store.donations[0].id,
      personId: store.people[0].id,
    });
    expect(store.responses).toHaveLength(1);
    expect(store.responses[0]).toMatchObject({
      responseType: 'GIFT',
      landingPageId: 'page-1',
      donationId: store.donations[0].id,
    });
    expect(store.people[0]).toMatchObject({
      acquisitionSource: 'spring',
    });
  });

  it('takes page, fund, and campaign from lp_slug and the id from the post', async () => {
    store.landingPages.push({
      id: 'page-2',
      slug: 'other',
      fund: { id: 'fund-2' },
    });
    store.socialPosts.push({
      id: 'post-1',
      slug: 'post-slug',
      landingPage: { id: 'page-2', slug: 'other', fund: { id: 'fund-2' } },
    });

    await apply({ ...GIFT, utm: { utm_campaign: 'post-slug' } });

    expect(store.donations[0]).toMatchObject({
      landingPageId: 'page-1',
      fundId: 'fund-1',
      fundraisingCampaignId: 'campaign-1',
      socialPostId: 'post-1',
    });
  });

  it('keeps the lp_slug page when the post has no page', async () => {
    store.socialPosts.push({
      id: 'post-1',
      slug: 'post-slug',
      landingPage: null,
    });

    await apply({ ...GIFT, utm: { utm_campaign: 'post-slug' } });

    expect(store.donations[0]).toMatchObject({
      landingPageId: 'page-1',
      fundId: 'fund-1',
      socialPostId: 'post-1',
    });
  });

  it('keeps the post id when lp_slug matches no page', async () => {
    store.socialPosts.push({
      id: 'post-1',
      slug: 'post-slug',
      landingPage: null,
    });

    await apply({
      ...GIFT,
      landingPageSlug: 'unknown',
      utm: { utm_campaign: 'post-slug' },
    });

    expect(store.donations[0]).toMatchObject({ socialPostId: 'post-1' });
    expect(store.donations[0]).not.toHaveProperty('landingPageId');
  });

  it('uses the post page when lp_slug is null', async () => {
    store.socialPosts.push({
      id: 'post-1',
      slug: 'post-slug',
      landingPage: {
        id: 'page-1',
        slug: 'spring',
        fund: { id: 'fund-1' },
        fundraisingCampaign: { id: 'campaign-1' },
      },
    });

    await apply({
      ...GIFT,
      landingPageSlug: null,
      utm: { utm_campaign: 'post-slug' },
    });

    expect(store.donations[0]).toMatchObject({
      landingPageId: 'page-1',
      fundId: 'fund-1',
      fundraisingCampaignId: 'campaign-1',
      socialPostId: 'post-1',
    });
  });

  it('fails a subscription gift until its Pledge exists', async () => {
    const gift = { ...GIFT, subscriptionId: 'sub_1' };

    expect(await apply(gift)).toBe('failed');
    expect(store.donations).toHaveLength(0);
    expect(store.people).toHaveLength(0);

    store.pledges.push({ id: 'pledge-1', stripeSubscriptionId: 'sub_1' });

    expect(await apply(gift)).toBe('created');
    expect(store.donations[0]).toMatchObject({ pledgeId: 'pledge-1' });
  });

  it('links the gift to the Pledge', async () => {
    store.pledges.push({ id: 'pledge-1', stripeSubscriptionId: 'sub_1' });

    await apply({ ...GIFT, subscriptionId: 'sub_1' });

    expect(store.donations[0]).toMatchObject({ pledgeId: 'pledge-1' });
  });

  it('creates a gift with no page', async () => {
    expect(await apply({ ...GIFT, landingPageSlug: null })).toBe('created');

    expect(store.donations[0]).not.toHaveProperty('landingPageId');
    expect(store.donations[0]).not.toHaveProperty('fundId');
    expect(store.donations[0]).not.toHaveProperty('fundraisingCampaignId');
    expect(store.people[0]).toMatchObject({ acquisitionSource: 'stripe' });
    expect(store.responses[0].inviteId ?? null).toBeNull();
    expect(store.responses[0].landingPageId).toBeNull();
  });

  it('links the invite', async () => {
    store.landingPageInvites.push({
      id: 'invite-1',
      code: 'Ab3dE5gH9k',
      landingPageId: 'page-1',
    });

    await apply({ ...GIFT, inviteCode: 'Ab3dE5gH9k' });

    expect(store.responses[0]).toMatchObject({ inviteId: 'invite-1' });
  });

  it('does not create a second gift', async () => {
    await apply();

    expect(await apply()).toBe('unchanged');
    expect(store.donations).toHaveLength(1);
    expect(store.donationCredits).toHaveLength(1);
    expect(store.responses).toHaveLength(1);
  });

  it('marks an existing gift refunded', async () => {
    await apply();

    expect(await apply({ ...GIFT, status: 'refunded' })).toBe('refunded');
    expect(store.donations[0].giftStatus).toBe('REFUNDED');
  });

  it('returns failed when a write throws', async () => {
    const { gql } = await import('src/logic-functions/workspace-gql');

    vi.mocked(gql).mockRejectedValueOnce(new Error('boom'));

    expect(await apply()).toBe('failed');
  });
});

describe('markGiftRefundedByPaymentIntent', () => {
  it('sets REFUNDED', async () => {
    await apply();

    expect(await markGiftRefundedByPaymentIntent('pi_1')).toBe(true);
    expect(store.donations[0].giftStatus).toBe('REFUNDED');
  });

  it('gives false when the gift is unknown', async () => {
    expect(await markGiftRefundedByPaymentIntent('pi_missing')).toBe(false);
  });
});
