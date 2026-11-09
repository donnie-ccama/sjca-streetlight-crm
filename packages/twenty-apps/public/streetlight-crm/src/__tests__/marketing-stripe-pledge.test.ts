import { describe, expect, it } from 'vitest';

import {
  nextDonorType,
  pledgeFieldsFromSubscription,
  pledgeStatusFromSubscription,
  type StripeSubscription,
} from 'src/shared/marketing/stripe-pledge';

describe('pledgeStatusFromSubscription', () => {
  it.each([
    ['active', 'ACTIVE'],
    ['trialing', 'ACTIVE'],
    ['past_due', 'DELINQUENT'],
    ['unpaid', 'DELINQUENT'],
    ['canceled', 'CANCELLED'],
    ['incomplete_expired', 'CANCELLED'],
    ['paused', 'PAUSED'],
    ['incomplete', null],
    ['something_new', null],
  ])('maps %s to %s', (status, expected) => {
    expect(pledgeStatusFromSubscription(status)).toBe(expected);
  });
});

describe('nextDonorType', () => {
  it.each([
    [null, 'MONTHLY'],
    ['PROSPECT', 'MONTHLY'],
    ['ANNUAL', 'MONTHLY'],
    ['LAPSED', 'MONTHLY'],
    ['MONTHLY', 'MONTHLY'],
    ['MAJOR', 'MAJOR'],
    ['BOARD', 'BOARD'],
  ])('maps %s to %s', (current, expected) => {
    expect(nextDonorType(current)).toBe(expected);
  });
});

const SUBSCRIPTION: StripeSubscription = {
  id: 'sub_1',
  status: 'active',
  customer: 'cus_1',
  start_date: 1793899900,
  canceled_at: null,
  ended_at: null,
  metadata: { lp_slug: 'give', invite_code: 'abc', utm_source: 'facebook' },
  items: {
    data: [
      {
        current_period_end: 1796491900,
        price: { unit_amount: 2500, currency: 'usd' },
      },
    ],
  },
};

describe('pledgeFieldsFromSubscription', () => {
  it('maps a live plan', () => {
    expect(pledgeFieldsFromSubscription(SUBSCRIPTION, 'ACTIVE')).toEqual({
      stripeSubscriptionId: 'sub_1',
      commitmentType: 'RECURRING',
      frequency: 'MONTHLY',
      status: 'ACTIVE',
      installmentAmount: { amountMicros: '25000000', currencyCode: 'USD' },
      startDate: '2026-11-05',
      nextPaymentDate: '2026-12-05',
      endDate: null,
      landingPageSlug: 'give',
      madeMonthlyFromOneTime: false,
    });
  });

  it('marks a plan made monthly from a one-time gift', () => {
    const fields = (made_monthly_from: string) =>
      pledgeFieldsFromSubscription(
        { ...SUBSCRIPTION, metadata: { made_monthly_from } },
        'ACTIVE',
      );

    expect(fields('pi_1').madeMonthlyFromOneTime).toBe(true);
    expect(fields('  ').madeMonthlyFromOneTime).toBe(false);
  });

  it('sets the end date and no next payment on a cancel', () => {
    const fields = pledgeFieldsFromSubscription(
      { ...SUBSCRIPTION, status: 'canceled', ended_at: 1793900000 },
      'CANCELLED',
    );

    expect(fields.status).toBe('CANCELLED');
    expect(fields.nextPaymentDate).toBeNull();
    expect(fields.endDate).toBe('2026-11-05');
  });

  it('gives no next payment when delinquent', () => {
    expect(
      pledgeFieldsFromSubscription(
        { ...SUBSCRIPTION, status: 'past_due' },
        'DELINQUENT',
      ).nextPaymentDate,
    ).toBeNull();
  });

  it('gives a null amount for a plan with no price', () => {
    expect(
      pledgeFieldsFromSubscription(
        { ...SUBSCRIPTION, items: { data: [] } },
        'ACTIVE',
      ).installmentAmount,
    ).toBeNull();
  });
});
