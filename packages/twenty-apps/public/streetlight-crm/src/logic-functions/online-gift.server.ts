import { findInviteIdByCode } from 'src/logic-functions/landing-page-invite.server';
import {
  createResponse,
  upsertPerson,
} from 'src/logic-functions/landing-page.server';
import { gql, gqlEnum, rawQuery } from 'src/logic-functions/workspace-gql';
import type { Attribution } from 'src/shared/marketing/attribution';
import {
  buildGiftDonorForm,
  planOnlineGiftImport,
  type ExistingDonation,
  type ImportAction,
  type OnlineGift,
} from 'src/shared/marketing/online-gift-import';

const DEFAULT_ACQUISITION_SOURCE = 'stripe';
const ROUTINE_SKIP_REASONS = new Set(['already-imported']);

export type GiftOutcome =
  | 'created'
  | 'refunded'
  | 'repaired'
  | 'unchanged'
  | 'failed';

type GiftLink = {
  socialPostId: string | null;
  landingPageId: string | null;
  landingPageSlug: string | null;
  fundId: string | null;
  fundraisingCampaignId: string | null;
};

export type GiftContext = {
  postCache: Map<string, GiftLink | null>;
  landingPageCache: Map<string, GiftLink | null>;
  // Subscriptions whose Pledge was upserted in this run.
  pledgeSubscriptionIds?: Set<string>;
};

export const createGiftContext = (): GiftContext => ({
  postCache: new Map(),
  landingPageCache: new Map(),
  pledgeSubscriptionIds: new Set(),
});

const findExistingDonations = async (
  transactionIds: string[],
): Promise<Map<string, ExistingDonation>> => {
  const data = await rawQuery({
    donations: {
      __args: {
        // Naming deletedAt makes the server include soft-deleted rows.
        filter: {
          onlineTransactionId: { in: transactionIds },
          or: [
            { deletedAt: { is: gqlEnum('NULL') } },
            { deletedAt: { is: gqlEnum('NOT_NULL') } },
          ],
        },
        first: 100,
      },
      edges: {
        node: {
          id: true,
          deletedAt: true,
          onlineTransactionId: true,
          giftStatus: true,
          donationCredits: {
            __args: {
              filter: { creditType: { eq: gqlEnum('HARD') } },
              first: 1,
            },
            edges: { node: { id: true } },
          },
          responses: {
            __args: {
              filter: { responseType: { eq: gqlEnum('GIFT') } },
              first: 1,
            },
            edges: { node: { id: true } },
          },
        },
      },
    },
  });
  const existing = new Map<string, ExistingDonation>();

  for (const edge of data.donations?.edges ?? []) {
    const node = edge?.node;

    if (typeof node?.onlineTransactionId === 'string') {
      existing.set(node.onlineTransactionId, {
        id: node.id,
        isDeleted: (node.deletedAt ?? null) !== null,
        giftStatus: node.giftStatus ?? '',
        hasHardCredit: (node.donationCredits?.edges ?? []).length > 0,
        hasGiftResponse: (node.responses?.edges ?? []).length > 0,
      });
    }
  }

  return existing;
};

const PAGE_SELECTION = {
  id: true,
  slug: true,
  fund: { id: true },
  fundraisingCampaign: { id: true },
};

const toPageLink = (
  page: Record<string, any>,
  socialPostId: string | null,
  fallbackSlug: string | null,
): GiftLink => ({
  socialPostId,
  landingPageId: page.id ?? null,
  landingPageSlug: page.slug ?? fallbackSlug,
  fundId: page.fund?.id ?? null,
  fundraisingCampaignId: page.fundraisingCampaign?.id ?? null,
});

const findPostLink = async (
  slug: string | null,
  context: GiftContext,
): Promise<GiftLink | null> => {
  if (slug === null) return null;

  if (context.postCache.has(slug)) return context.postCache.get(slug) ?? null;

  const data = await rawQuery({
    socialPosts: {
      __args: { filter: { slug: { eq: slug } }, first: 1 },
      edges: { node: { id: true, landingPage: PAGE_SELECTION } },
    },
  });
  const node = data.socialPosts?.edges?.[0]?.node;
  const link: GiftLink | null = node
    ? toPageLink(node.landingPage ?? {}, node.id, null)
    : null;

  context.postCache.set(slug, link);

  return link;
};

export const findLandingPageLink = async (
  slug: string,
  context: GiftContext,
): Promise<GiftLink | null> => {
  if (context.landingPageCache.has(slug)) {
    return context.landingPageCache.get(slug) ?? null;
  }

  const data = await rawQuery({
    landingPages: {
      __args: { filter: { slug: { eq: slug } }, first: 1 },
      edges: { node: PAGE_SELECTION },
    },
  });
  const node = data.landingPages?.edges?.[0]?.node;
  const link: GiftLink | null = node ? toPageLink(node, null, slug) : null;

  context.landingPageCache.set(slug, link);

  return link;
};

// The lp_slug page wins. The post's page is the fallback.
const findGiftLink = async (
  gift: OnlineGift,
  attribution: Attribution,
  context: GiftContext,
): Promise<GiftLink | null> => {
  const page =
    gift.landingPageSlug === null
      ? null
      : await findLandingPageLink(gift.landingPageSlug, context);
  const post = await findPostLink(attribution.socialPostSlug, context);

  if (page !== null) {
    return { ...page, socialPostId: post?.socialPostId ?? null };
  }

  return post;
};

const findPledgeId = async (
  subscriptionId: string | null,
): Promise<string | null> => {
  if (subscriptionId === null) return null;

  const data = await rawQuery({
    pledges: {
      __args: {
        filter: { stripeSubscriptionId: { eq: subscriptionId } },
        first: 1,
      },
      edges: { node: { id: true } },
    },
  });

  return data.pledges?.edges?.[0]?.node?.id ?? null;
};

const upsertGiftDonor = async (
  gift: OnlineGift,
  attribution: Attribution,
  link: GiftLink | null,
) => {
  const form = buildGiftDonorForm(gift);

  if (form === null) return { form, person: null };

  const person = await upsertPerson({
    form,
    attribution,
    landingPageSlug: link?.landingPageSlug ?? DEFAULT_ACQUISITION_SOURCE,
    matchByPhone: false,
  });

  return { form, person };
};

const createHardCredit = async (
  credit: Record<string, unknown>,
  donationId: string,
  personId: string,
) => {
  await gql(
    `mutation ($data: DonationCreditCreateInput!) {
      createDonationCredit(data: $data) { id }
    }`,
    { data: { ...credit, donationId, personId } },
  );
};

const createGiftResponse = async (input: {
  gift: OnlineGift;
  attribution: Attribution;
  link: GiftLink | null;
  donor: Awaited<ReturnType<typeof upsertGiftDonor>>;
  donationId: string;
}) => {
  const { gift, attribution, link, donor, donationId } = input;
  const inviteId =
    link?.landingPageId == null
      ? null
      : await findInviteIdByCode(
          gift.inviteCode ?? undefined,
          link.landingPageId,
        );

  await createResponse({
    name: `GIFT · ${gift.id}`,
    responseType: 'GIFT',
    personId: donor.person?.personId ?? null,
    landingPageId: link?.landingPageId ?? null,
    socialPostId: link?.socialPostId ?? null,
    network: attribution.network,
    isNewPerson: donor.person?.isNewPerson ?? false,
    gaveEmail: donor.form !== null,
    gavePhone: donor.form?.phone != null,
    gaveSmsConsent: false,
    utmRaw: attribution.utmRaw,
    visitorKey: null,
    ipHash: null,
    donationId,
    inviteId,
  });
};

const createGift = async (
  gift: OnlineGift,
  action: Extract<ImportAction, { kind: 'create' }>,
  context: GiftContext,
): Promise<GiftOutcome> => {
  // Re-check just before writing, so an overlapping run cannot make a second Donation (X6).
  const recheck = await findExistingDonations([gift.id]);

  if (recheck.size > 0) return 'unchanged';

  const pledgeId = await findPledgeId(gift.subscriptionId);

  // An unlinked gift is never repaired. Failing makes the webhook retry.
  if (gift.subscriptionId !== null && pledgeId === null) {
    throw new Error('Pledge for the subscription is not created yet');
  }

  const link = await findGiftLink(gift, action.attribution, context);
  const donor = await upsertGiftDonor(gift, action.attribution, link);
  const donationData: Record<string, unknown> = { ...action.donation };

  if (link !== null) {
    if (link.socialPostId !== null)
      donationData.socialPostId = link.socialPostId;

    if (link.landingPageId !== null)
      donationData.landingPageId = link.landingPageId;

    if (link.fundId !== null) donationData.fundId = link.fundId;

    if (link.fundraisingCampaignId !== null) {
      donationData.fundraisingCampaignId = link.fundraisingCampaignId;
    }
  }

  if (pledgeId !== null) donationData.pledgeId = pledgeId;

  const created = await gql(
    `mutation ($data: DonationCreateInput!) {
      createDonation(data: $data) { id }
    }`,
    { data: donationData },
  );
  const donationId: string | undefined = created.createDonation?.id;

  if (!donationId) throw new Error('createDonation returned no id');

  // Matches hand entry: only a Person gets a HARD credit, and its created event refreshes giving totals.
  if (donor.person !== null) {
    await createHardCredit(action.credit, donationId, donor.person.personId);
  }

  await createGiftResponse({
    gift,
    attribution: action.attribution,
    link,
    donor,
    donationId,
  });

  return 'created';
};

const repairGift = async (
  gift: OnlineGift,
  action: Extract<ImportAction, { kind: 'repair' }>,
  context: GiftContext,
): Promise<GiftOutcome> => {
  const link = await findGiftLink(gift, action.attribution, context);
  const donor = await upsertGiftDonor(gift, action.attribution, link);

  if (action.credit !== null && donor.person !== null) {
    await createHardCredit(
      action.credit,
      action.donationId,
      donor.person.personId,
    );
  }

  if (action.createResponse) {
    await createGiftResponse({
      gift,
      attribution: action.attribution,
      link,
      donor,
      donationId: action.donationId,
    });
  }

  return 'repaired';
};

const markRefunded = async (donationId: string): Promise<GiftOutcome> => {
  await gql(
    `mutation ($id: UUID!, $data: DonationUpdateInput!) {
      updateDonation(id: $id, data: $data) { id }
    }`,
    { id: donationId, data: { giftStatus: 'REFUNDED' } },
  );

  return 'refunded';
};

export const applyOnlineGift = async (input: {
  gift: OnlineGift;
  timeZone: string;
  context: GiftContext;
}): Promise<GiftOutcome> => {
  const { gift, timeZone, context } = input;

  try {
    const existing = await findExistingDonations([gift.id]);
    const action = planOnlineGiftImport({
      gift,
      existing: existing.get(gift.id) ?? null,
      timeZone,
    });

    if (action.kind === 'create')
      return await createGift(gift, action, context);

    if (action.kind === 'repair')
      return await repairGift(gift, action, context);

    if (action.kind === 'markRefunded')
      return await markRefunded(action.donationId);

    if (
      !ROUTINE_SKIP_REASONS.has(action.reason) &&
      !action.reason.startsWith('status-')
    ) {
      console.log(`Online gift ${gift.id} skipped: ${action.reason}`);
    }

    return 'unchanged';
  } catch {
    // The error text can echo donor values, so only the id is logged.
    console.error(`Online gift ${gift.id} failed to import`);

    return 'failed';
  }
};

// True once the gift is REFUNDED. False when it is unknown or deleted, so the caller can retry later.
export const markGiftRefundedByPaymentIntent = async (
  paymentIntentId: string,
): Promise<boolean> => {
  const donation = (await findExistingDonations([paymentIntentId])).get(
    paymentIntentId,
  );

  if (donation === undefined || donation.isDeleted) return false;

  if (donation.giftStatus !== 'REFUNDED') await markRefunded(donation.id);

  return true;
};
