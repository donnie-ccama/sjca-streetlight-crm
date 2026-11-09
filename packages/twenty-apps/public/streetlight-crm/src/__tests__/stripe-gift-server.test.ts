import { beforeEach, describe, expect, it, vi } from 'vitest';

const { stripeRequestMock } = vi.hoisted(() => ({
  stripeRequestMock: vi.fn(),
}));

vi.mock('src/logic-functions/stripe-client', () => ({
  stripeRequest: stripeRequestMock,
}));

import {
  findInvoicePaymentIntentId,
  isPaymentIntentHandledElsewhere,
  loadPaymentIntentDetails,
} from 'src/logic-functions/stripe-gift.server';

beforeEach(() => {
  stripeRequestMock.mockReset();
});

describe('loadPaymentIntentDetails', () => {
  it('reads the method type and fee from the expanded charge', async () => {
    stripeRequestMock.mockResolvedValue({
      latest_charge: {
        payment_method_details: { type: 'card' },
        balance_transaction: { fee: 59 },
      },
    });

    expect(await loadPaymentIntentDetails('pi_1')).toMatchObject({
      paymentMethodType: 'card',
      feeCents: 59,
    });
    expect(stripeRequestMock).toHaveBeenCalledWith({
      method: 'GET',
      path: '/v1/payment_intents/pi_1',
      params: { expand: ['latest_charge.balance_transaction'] },
    });
  });

  it('gives null for missing parts', async () => {
    stripeRequestMock.mockResolvedValue({ latest_charge: null });

    expect(await loadPaymentIntentDetails('pi_1')).toMatchObject({
      paymentMethodType: null,
      feeCents: null,
    });

    stripeRequestMock.mockResolvedValue({
      latest_charge: {
        payment_method_details: { type: 'us_bank_account' },
        balance_transaction: 'txn_1',
      },
    });

    expect(await loadPaymentIntentDetails('pi_1')).toMatchObject({
      paymentMethodType: 'us_bank_account',
      feeCents: null,
    });
  });
});

describe('findInvoicePaymentIntentId', () => {
  it('returns the paid payment intent', async () => {
    stripeRequestMock.mockResolvedValue({
      data: [
        {
          status: 'open',
          payment: { type: 'payment_intent', payment_intent: 'pi_open' },
        },
        {
          status: 'paid',
          payment: { type: 'payment_intent', payment_intent: 'pi_paid' },
        },
      ],
    });

    expect(await findInvoicePaymentIntentId('in_1')).toBe('pi_paid');
    expect(stripeRequestMock).toHaveBeenCalledWith({
      method: 'GET',
      path: '/v1/invoice_payments',
      params: { invoice: 'in_1' },
    });
  });

  it('gives null when no paid payment intent exists', async () => {
    stripeRequestMock.mockResolvedValue({
      data: [
        { status: 'paid', payment: { type: 'charge', charge: 'ch_1' } },
        {
          status: 'open',
          payment: { type: 'payment_intent', payment_intent: 'pi_1' },
        },
      ],
    });

    expect(await findInvoicePaymentIntentId('in_1')).toBeNull();
  });
});

describe('isPaymentIntentHandledElsewhere', () => {
  it('is true when a Checkout Session holds the payment intent', async () => {
    stripeRequestMock.mockResolvedValueOnce({ data: [{ id: 'cs_1' }] });

    expect(await isPaymentIntentHandledElsewhere('pi_1')).toBe(true);
    expect(stripeRequestMock).toHaveBeenCalledTimes(1);
    expect(stripeRequestMock).toHaveBeenCalledWith({
      method: 'GET',
      path: '/v1/checkout/sessions',
      params: { payment_intent: 'pi_1', limit: 1 },
    });
  });

  it('is true when an invoice payment holds the payment intent', async () => {
    stripeRequestMock
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ id: 'inpay_1' }] });

    expect(await isPaymentIntentHandledElsewhere('pi_1')).toBe(true);
    expect(stripeRequestMock).toHaveBeenLastCalledWith({
      method: 'GET',
      path: '/v1/invoice_payments',
      params: {
        payment: { type: 'payment_intent', payment_intent: 'pi_1' },
        limit: 1,
      },
    });
  });

  it('is false when neither holds it', async () => {
    stripeRequestMock.mockResolvedValue({ data: [] });

    expect(await isPaymentIntentHandledElsewhere('pi_1')).toBe(false);
  });
});

describe('loadPaymentIntentDetails with the intent and charge', () => {
  it('returns the PaymentIntent and charge it read', async () => {
    const charge = {
      payment_method_details: { type: 'card' },
      balance_transaction: { fee: 59 },
    };

    stripeRequestMock.mockResolvedValue({ id: 'pi_1', latest_charge: charge });

    expect(await loadPaymentIntentDetails('pi_1')).toMatchObject({
      paymentIntent: { id: 'pi_1' },
      charge,
    });
  });
});
