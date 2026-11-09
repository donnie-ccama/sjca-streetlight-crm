import { describe, expect, it } from 'vitest';

import {
  mapPaymentMethod,
  planOnlineGiftImport,
  type ExistingDonation,
  type OnlineGift,
} from 'src/shared/marketing/online-gift-import';

const existingDonation = (
  overrides: Partial<ExistingDonation> = {},
): ExistingDonation => ({
  id: 'donation-1',
  isDeleted: false,
  giftStatus: 'PAID',
  hasHardCredit: true,
  hasGiftResponse: true,
  ...overrides,
});

const gift = (overrides: Partial<OnlineGift> = {}): OnlineGift => ({
  id: 'pi_test_1',
  status: 'succeeded',
  amountCents: 9999,
  currency: 'usd',
  paidAt: '2026-11-04T18:00:05.000Z',
  paymentMethodType: 'card',
  feeCents: 320,
  utm: {},
  landingPageSlug: null,
  inviteCode: null,
  subscriptionId: null,
  supporter: {
    email: 'Ada@Example.org',
    firstName: 'Ada',
    lastName: 'Lovelace',
    phone: null,
  },
  ...overrides,
});

describe('planOnlineGiftImport', () => {
  it('creates a PENDING-acknowledgment Donation and a full HARD credit for a new gift', () => {
    const action = planOnlineGiftImport({ gift: gift(), existing: null });

    expect(action.kind).toBe('create');

    if (action.kind !== 'create') return;

    expect(action.donation).toMatchObject({
      onlineTransactionId: 'pi_test_1',
      acknowledgmentStatus: 'PENDING',
      giftStatus: 'PAID',
      giftDate: '2026-11-04',
      paymentMethod: 'CREDIT_CARD',
      amount: { amountMicros: '99990000', currencyCode: 'USD' },
      processingFee: { amountMicros: '3200000', currencyCode: 'USD' },
    });
    expect(action.credit).toMatchObject({
      creditType: 'HARD',
      creditRole: 'DONOR',
      creditAmount: { amountMicros: '99990000', currencyCode: 'USD' },
    });
    expect(action.credit).not.toHaveProperty('donationId');
  });

  it('create action sets acknowledgmentStatus PENDING for a monthly charge', () => {
    const action = planOnlineGiftImport({
      gift: gift({ subscriptionId: 'sub_test_1' }),
      existing: null,
    });

    expect(action.kind).toBe('create');

    if (action.kind !== 'create') return;

    expect(action.donation.acknowledgmentStatus).toBe('PENDING');
  });

  it('uses the stripe: entry key prefix', () => {
    const action = planOnlineGiftImport({ gift: gift(), existing: null });

    expect(
      action.kind === 'create' ? JSON.stringify(action.donation) : '',
    ).toContain('stripe:pi_test_1');
  });

  it('omits the processing fee when it is unknown', () => {
    const action = planOnlineGiftImport({
      gift: gift({ feeCents: null }),
      existing: null,
    });

    expect(action.kind).toBe('create');

    if (action.kind !== 'create') return;

    expect(action.donation).not.toHaveProperty('processingFee');
  });

  it('skips a gift that already has a Donation (X6)', () => {
    const action = planOnlineGiftImport({
      gift: gift(),
      existing: existingDonation(),
    });

    expect(action.kind).toBe('skip');
  });

  it('marks a PAID Donation refunded when the gift is refunded', () => {
    const action = planOnlineGiftImport({
      gift: gift({ status: 'refunded' }),
      existing: existingDonation(),
    });

    expect(action).toEqual({ kind: 'markRefunded', donationId: 'donation-1' });
  });

  it('skips a refunded gift whose Donation is already REFUNDED', () => {
    const action = planOnlineGiftImport({
      gift: gift({ status: 'refunded' }),
      existing: existingDonation({ giftStatus: 'REFUNDED' }),
    });

    expect(action.kind).toBe('skip');
  });

  it('carries the utm_campaign slug into the attribution', () => {
    const action = planOnlineGiftImport({
      gift: gift({
        utm: {
          utm_source: 'instagram',
          utm_medium: 'social',
          utm_campaign: 'spring-post',
        },
      }),
      existing: null,
    });

    expect(action.kind).toBe('create');

    if (action.kind !== 'create') return;

    expect(action.attribution.socialPostSlug).toBe('spring-post');
    expect(action.attribution.network).toBe('INSTAGRAM');
    expect(action.donation.utmRaw).toEqual({
      utm_source: 'instagram',
      utm_medium: 'social',
      utm_campaign: 'spring-post',
    });
  });

  it('does not import a refunded gift that has no Donation', () => {
    expect(
      planOnlineGiftImport({
        gift: gift({ status: 'refunded' }),
        existing: null,
      }),
    ).toEqual({ kind: 'skip', reason: 'status-refunded' });
  });

  it('repairs a missing HARD credit on a current Donation', () => {
    const action = planOnlineGiftImport({
      gift: gift(),
      existing: existingDonation({ hasHardCredit: false }),
    });

    expect(action).toMatchObject({
      kind: 'repair',
      donationId: 'donation-1',
      createResponse: false,
      credit: {
        creditType: 'HARD',
        creditAmount: { amountMicros: '99990000', currencyCode: 'USD' },
      },
    });
  });

  it('repairs a missing GIFT Response when the credit exists', () => {
    const action = planOnlineGiftImport({
      gift: gift(),
      existing: existingDonation({ hasGiftResponse: false }),
    });

    expect(action).toMatchObject({
      kind: 'repair',
      credit: null,
      createResponse: true,
    });
  });

  it('does not repair a credit for a gift with no donor email', () => {
    const action = planOnlineGiftImport({
      gift: gift({
        supporter: {
          email: null,
          firstName: null,
          lastName: null,
          phone: null,
        },
      }),
      existing: existingDonation({ hasHardCredit: false }),
    });

    expect(action).toEqual({ kind: 'skip', reason: 'already-imported' });
  });

  it.each(['succeeded', 'refunded'] as const)(
    'skips a %s gift whose Donation was deleted in the CRM',
    (status) => {
      expect(
        planOnlineGiftImport({
          gift: gift({ status }),
          existing: existingDonation({ isDeleted: true, hasHardCredit: false }),
        }),
      ).toEqual({ kind: 'skip', reason: 'deleted-in-crm' });
    },
  );

  it('dates the gift in the given time zone', () => {
    const plan = (paidAt: string, timeZone: string) => {
      const action = planOnlineGiftImport({
        gift: gift({ paidAt }),
        existing: null,
        timeZone,
      });

      return action.kind === 'create' ? action.donation.giftDate : null;
    };

    expect(plan('2026-12-31T23:30:00Z', 'America/New_York')).toBe('2026-12-31');
    expect(plan('2027-01-01T01:00:00Z', 'America/New_York')).toBe('2026-12-31');
    expect(plan('2026-12-31T23:30:00Z', 'UTC')).toBe('2026-12-31');
    expect(plan('2027-01-01T01:00:00Z', 'UTC')).toBe('2027-01-01');
  });

  it('skips a non-USD gift (R23)', () => {
    expect(
      planOnlineGiftImport({ gift: gift({ currency: 'eur' }), existing: null }),
    ).toEqual({ kind: 'skip', reason: 'non-usd-currency' });
  });

  it.each([0, -5, 12.5])(
    'skips a gift whose amount of %s cents cannot be imported',
    (amountCents) => {
      expect(
        planOnlineGiftImport({ gift: gift({ amountCents }), existing: null }),
      ).toEqual({ kind: 'skip', reason: 'invalid-amount' });
    },
  );
});

describe('mapPaymentMethod', () => {
  it.each([
    ['card', 'CREDIT_CARD'],
    ['us_bank_account', 'ACH'],
    ['link', 'CREDIT_CARD'],
    ['paypal', 'PAYPAL'],
    ['venmo', 'VENMO'],
    ['crypto', 'CRYPTOCURRENCY'],
    ['cashapp', 'OTHER'],
    ['unknown-type', 'OTHER'],
  ])('maps Stripe type %s to %s', (type, expected) => {
    expect(mapPaymentMethod(type)).toBe(expected);
  });
});
