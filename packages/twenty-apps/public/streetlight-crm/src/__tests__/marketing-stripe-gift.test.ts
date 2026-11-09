import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  giftFromCheckoutSession,
  giftFromInvoice,
  giftFromPaymentIntent,
  type StripeCharge,
  type StripeCheckoutSession,
  type StripeInvoice,
  type StripePaymentIntent,
} from 'src/shared/marketing/stripe-gift';

const readEventObject = <TObject>(fixtureName: string): TObject =>
  JSON.parse(
    readFileSync(
      join(__dirname, 'fixtures', 'stripe', `${fixtureName}.json`),
      'utf8',
    ),
  ).data.object;

const session = readEventObject<StripeCheckoutSession>(
  'checkout-session-completed-payment',
);
const paymentLinkSession = readEventObject<StripeCheckoutSession>(
  'checkout-session-completed-payment-link',
);
const invoice = readEventObject<StripeInvoice>('invoice-paid');

describe('giftFromCheckoutSession', () => {
  it('reads metadata', () => {
    expect(giftFromCheckoutSession(session)).toEqual({
      id: 'pi_test_1',
      status: 'succeeded',
      amountCents: 5000,
      currency: 'usd',
      paidAt: '2026-11-05T17:31:40.000Z',
      paymentMethodType: null,
      feeCents: null,
      utm: {
        utm_source: 'newsletter',
        utm_medium: 'email',
        utm_campaign: 'fall',
      },
      landingPageSlug: 'give',
      inviteCode: 'abc123',
      subscriptionId: null,
      supporter: {
        email: 'donor@example.com',
        firstName: 'Test',
        lastName: 'Donor',
        phone: null,
      },
    });
  });

  it('with no metadata gives no slug and no utm', () => {
    const gift = giftFromCheckoutSession(paymentLinkSession);

    expect(gift?.id).toBe('pi_test_2');
    expect(gift?.landingPageSlug).toBeNull();
    expect(gift?.inviteCode).toBeNull();
    expect(gift?.utm).toEqual({});
  });

  it('splits the name at the last space', () => {
    const gift = giftFromCheckoutSession({
      ...session,
      customer_details: {
        email: 'a@example.com',
        name: 'Mary Ann Smith',
        phone: '+15125550100',
      },
    });

    expect(gift?.supporter).toEqual({
      email: 'a@example.com',
      firstName: 'Mary Ann',
      lastName: 'Smith',
      phone: '+15125550100',
    });
  });

  it('keeps a one-word name as the first name', () => {
    const gift = giftFromCheckoutSession({
      ...session,
      customer_details: {
        email: 'a@example.com',
        name: 'Madonna',
        phone: null,
      },
    });

    expect(gift?.supporter.firstName).toBe('Madonna');
    expect(gift?.supporter.lastName).toBeNull();
  });

  it('returns null for an unpaid session', () => {
    expect(
      giftFromCheckoutSession({ ...session, payment_status: 'unpaid' }),
    ).toBeNull();
  });

  it('returns null for a non-USD session', () => {
    expect(giftFromCheckoutSession({ ...session, currency: 'eur' })).toBeNull();
  });

  it('returns null for a subscription session, which the invoice covers', () => {
    expect(
      giftFromCheckoutSession({
        ...session,
        mode: 'subscription',
        payment_intent: null,
      }),
    ).toBeNull();
  });

  it('returns null without a PaymentIntent', () => {
    expect(
      giftFromCheckoutSession({ ...session, payment_intent: null }),
    ).toBeNull();
  });
});

describe('giftFromInvoice', () => {
  it('uses the PaymentIntent ID and subscription ID', () => {
    expect(giftFromInvoice(invoice, 'pi_test_inv')).toEqual({
      id: 'pi_test_inv',
      status: 'succeeded',
      amountCents: 2500,
      currency: 'usd',
      paidAt: '2026-11-05T17:32:30.000Z',
      paymentMethodType: null,
      feeCents: null,
      utm: {},
      landingPageSlug: 'give',
      inviteCode: 'abc123',
      subscriptionId: 'sub_test_1',
      supporter: {
        email: 'donor@example.com',
        firstName: null,
        lastName: null,
        phone: null,
      },
    });
  });

  it('reads the supporter name and phone from the customer fields', () => {
    const gift = giftFromInvoice(
      { ...invoice, customer_name: 'Ada Lovelace', customer_phone: '+1555' },
      'pi_test_inv',
    );

    expect(gift?.supporter).toMatchObject({
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone: '+1555',
    });
  });

  it('prefers the paid time over the created time', () => {
    const gift = giftFromInvoice(
      { ...invoice, status_transitions: { paid_at: 1793900100 } },
      'pi_test_inv',
    );

    expect(gift?.paidAt).toBe('2026-11-05T17:35:00.000Z');
  });

  it('returns null for amount_paid 0', () => {
    expect(
      giftFromInvoice({ ...invoice, amount_paid: 0 }, 'pi_test_inv'),
    ).toBeNull();
  });

  it('returns null for an unpaid invoice', () => {
    expect(
      giftFromInvoice({ ...invoice, status: 'open' }, 'pi_test_inv'),
    ).toBeNull();
  });

  it('returns null for a non-USD invoice', () => {
    expect(
      giftFromInvoice({ ...invoice, currency: 'eur' }, 'pi_test_inv'),
    ).toBeNull();
  });
});

describe('giftFromPaymentIntent', () => {
  const paymentIntent = readEventObject<
    StripePaymentIntent & { latest_charge: StripeCharge }
  >('payment-intent-succeeded-connect');
  const charge = paymentIntent.latest_charge;
  const withIntent = (changes: Partial<StripePaymentIntent>) =>
    giftFromPaymentIntent({ ...paymentIntent, ...changes }, charge);

  it('maps a Connect payment with no email', () => {
    expect(giftFromPaymentIntent(paymentIntent, charge)).toEqual({
      id: 'pi_test_connect',
      status: 'succeeded',
      amountCents: 2500,
      currency: 'usd',
      paidAt: '2026-11-05T17:36:35.000Z',
      paymentMethodType: 'card',
      feeCents: null,
      utm: {},
      landingPageSlug: null,
      inviteCode: null,
      subscriptionId: null,
      supporter: {
        email: null,
        firstName: 'Test',
        lastName: 'Donor',
        phone: null,
      },
    });
  });

  it('falls back to the receipt email', () => {
    expect(
      withIntent({ receipt_email: 'donor@example.com' })?.supporter.email,
    ).toBe('donor@example.com');
  });

  it('prefers the billing email', () => {
    expect(
      giftFromPaymentIntent(
        { ...paymentIntent, receipt_email: 'receipt@example.com' },
        {
          ...charge,
          billing_details: {
            name: null,
            email: 'bill@example.com',
            phone: '555',
          },
        },
      )?.supporter,
    ).toEqual({
      email: 'bill@example.com',
      firstName: null,
      lastName: null,
      phone: '555',
    });
  });

  it('gives null unless it succeeded, in USD, with money received', () => {
    expect(withIntent({ status: 'processing' })).toBeNull();
    expect(withIntent({ currency: 'cad' })).toBeNull();
    expect(withIntent({ amount_received: 0 })).toBeNull();
  });
});
