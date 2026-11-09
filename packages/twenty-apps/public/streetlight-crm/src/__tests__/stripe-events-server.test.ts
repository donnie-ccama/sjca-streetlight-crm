import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

type DetailsResult = Awaited<
  ReturnType<
    typeof import('src/logic-functions/stripe-gift.server').loadPaymentIntentDetails
  >
>;

const {
  kvStore,
  calls,
  giftIds,
  pledgeSubscriptionIds,
  applyMock,
  refundMock,
  upsertPledgeMock,
  findPaymentIntentMock,
  detailsMock,
  handledElsewhereMock,
  refundedIds,
} = vi.hoisted(() => {
  const calls: string[] = [];
  const giftIds = new Set<string>();
  const pledgeSubscriptionIds = new Set<string>();

  return {
    refundedIds: new Set<string>(),
    kvStore: new Map<string, unknown>(),
    calls,
    giftIds,
    pledgeSubscriptionIds,
    applyMock: vi.fn(
      async (input: {
        gift: { id: string; subscriptionId: string | null };
      }) => {
        calls.push('apply');

        const { gift } = input;

        if (
          gift.subscriptionId !== null &&
          !pledgeSubscriptionIds.has(gift.subscriptionId)
        ) {
          return 'failed';
        }

        if (giftIds.has(gift.id)) return 'unchanged';

        giftIds.add(gift.id);

        return 'created';
      },
    ),
    refundMock: vi.fn(async (paymentIntentId: string) =>
      giftIds.has(paymentIntentId),
    ),
    upsertPledgeMock: vi.fn(async (subscriptionId: string) => {
      calls.push('pledge');
      pledgeSubscriptionIds.add(subscriptionId);

      return { pledgeId: 'pledge-1', created: true };
    }),
    findPaymentIntentMock: vi.fn(async (): Promise<string | null> => {
      calls.push('find-payment-intent');

      return 'pi_test_inv';
    }),
    handledElsewhereMock: vi.fn(async (): Promise<boolean> => {
      calls.push('handled-elsewhere');

      return false;
    }),
    detailsMock: vi.fn(async (): Promise<DetailsResult> => {
      calls.push('details');

      return {
        paymentMethodType: 'card',
        feeCents: 59,
        paymentIntent: {} as DetailsResult['paymentIntent'],
        charge: null,
      };
    }),
  };
});

vi.mock('twenty-sdk/logic-function', () => ({
  kv: {
    get: vi.fn(async (key: string) => kvStore.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      kvStore.set(key, value);
    }),
  },
}));

vi.mock('src/logic-functions/online-gift.server', () => ({
  createGiftContext: () => ({}),
  applyOnlineGift: applyMock,
  markGiftRefundedByPaymentIntent: refundMock,
}));

vi.mock('src/logic-functions/stripe-pledge.server', () => ({
  upsertPledgeFromSubscription: upsertPledgeMock,
}));

vi.mock('src/logic-functions/stripe-gift.server', () => ({
  findInvoicePaymentIntentId: findPaymentIntentMock,
  loadPaymentIntentDetails: detailsMock,
  isPaymentIntentHandledElsewhere: handledElsewhereMock,
}));

import {
  handleStripeEvent,
  handleStripeWebhookRequest,
  STRIPE_IMPORT_START_KEY,
  type StripeEvent,
} from 'src/logic-functions/stripe-events.server';
import webhookFunction from 'src/logic-functions/stripe-webhook.logic-function';

const fixture = (name: string): StripeEvent =>
  JSON.parse(
    readFileSync(join(__dirname, 'fixtures/stripe', `${name}.json`), 'utf8'),
  );

const SECRET = 'example_whsec_secret';
const context = {} as never;

const sign = (rawBody: string, timestamp = Math.floor(Date.now() / 1000)) =>
  `t=${timestamp},v1=${createHmac('sha256', SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex')}`;

beforeEach(() => {
  kvStore.clear();
  calls.length = 0;
  giftIds.clear();
  refundedIds.clear();
  refundMock.mockImplementation(async (id: string) => giftIds.has(id));
  pledgeSubscriptionIds.clear();
  vi.clearAllMocks();
  findPaymentIntentMock.mockImplementation(async () => {
    calls.push('find-payment-intent');

    return 'pi_test_inv';
  });
  handledElsewhereMock.mockImplementation(async () => {
    calls.push('handled-elsewhere');

    return false;
  });
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', SECRET);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('handleStripeEvent', () => {
  it('creates a one-time gift from a payment session with method and fee', async () => {
    const result = await handleStripeEvent(
      fixture('checkout-session-completed-payment'),
      context,
    );

    expect(result).toBe('handled');
    expect(detailsMock).toHaveBeenCalledWith('pi_test_1');
    expect(applyMock.mock.calls[0][0].gift).toMatchObject({
      id: 'pi_test_1',
      paymentMethodType: 'card',
      feeCents: 59,
    });
    expect(giftIds.has('pi_test_1')).toBe(true);
  });

  it('creates no gift from a payment session that is not paid yet', async () => {
    const event = fixture('checkout-session-async-payment-succeeded');

    event.type = 'checkout.session.completed';
    event.data.object.payment_status = 'unpaid';

    expect(await handleStripeEvent(event, context)).toBe('ignored');
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('creates the gift when a delayed payment succeeds', async () => {
    const result = await handleStripeEvent(
      fixture('checkout-session-async-payment-succeeded'),
      context,
    );

    expect(result).toBe('handled');
    expect(detailsMock).toHaveBeenCalledWith('pi_test_ach');
    expect(applyMock.mock.calls[0][0].gift).toMatchObject({
      id: 'pi_test_ach',
      amountCents: 5000,
      paymentMethodType: 'card',
    });
  });

  it('skips a delayed payment success created before the import start', async () => {
    kvStore.set(STRIPE_IMPORT_START_KEY, 1793900000 + 3601);

    expect(
      await handleStripeEvent(
        fixture('checkout-session-async-payment-succeeded'),
        context,
      ),
    ).toBe('skipped-before-start');
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('answers handled with no gift when a delayed payment fails, and logs only the id and type', async () => {
    const logSpy = vi.mocked(console.log);

    expect(
      await handleStripeEvent(
        fixture('checkout-session-async-payment-failed'),
        context,
      ),
    ).toBe('handled');
    expect(applyMock).not.toHaveBeenCalled();
    expect(detailsMock).not.toHaveBeenCalled();

    const logged = logSpy.mock.calls.flat().join(' ');

    expect(logged).toContain('evt_test_async_fail');
    expect(logged).toContain('checkout.session.async_payment_failed');
    expect(logged).not.toContain('ach-donor@example.com');
    expect(logged).not.toContain('pi_test_ach');
  });

  it('creates no gift from a subscription session', async () => {
    const result = await handleStripeEvent(
      fixture('checkout-session-completed-subscription'),
      context,
    );

    expect(result).toBe('ignored');
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('makes the Pledge, then finds the payment, then the gift for invoice.paid', async () => {
    const result = await handleStripeEvent(fixture('invoice-paid'), context);

    expect(result).toBe('handled');
    expect(calls).toEqual([
      'pledge',
      'find-payment-intent',
      'details',
      'apply',
    ]);
    expect(applyMock.mock.calls[0][0].gift).toMatchObject({
      id: 'pi_test_inv',
      paymentMethodType: 'card',
      feeCents: 59,
    });
  });

  it('imports a paid invoice with no subscription as a one-time gift', async () => {
    const result = await handleStripeEvent(
      fixture('invoice-paid-one-off'),
      context,
    );

    expect(result).toBe('handled');
    expect(upsertPledgeMock).not.toHaveBeenCalled();
    expect(findPaymentIntentMock).toHaveBeenCalledWith('in_test_one_off');
    expect(applyMock.mock.calls[0][0].gift).toMatchObject({
      id: 'pi_test_inv',
      amountCents: 2500,
      subscriptionId: null,
      paymentMethodType: 'card',
      feeCents: 59,
    });
    expect(giftIds.has('pi_test_inv')).toBe(true);
  });

  it('links the gift to a Pledge when invoice.paid comes before the subscription event', async () => {
    await handleStripeEvent(fixture('invoice-paid'), context);

    expect(giftIds.size).toBe(1);
    expect(upsertPledgeMock).toHaveBeenCalledTimes(1);

    await handleStripeEvent(fixture('customer-subscription-created'), context);

    expect(giftIds.size).toBe(1);
  });

  it('creates one gift when the same event arrives two times', async () => {
    await handleStripeEvent(fixture('invoice-paid'), context);
    await handleStripeEvent(fixture('invoice-paid'), context);
    await handleStripeEvent(
      fixture('checkout-session-completed-payment'),
      context,
    );
    await handleStripeEvent(
      fixture('checkout-session-completed-payment'),
      context,
    );

    expect(giftIds.size).toBe(2);
  });

  it('throws when the gift fails so Stripe retries', async () => {
    applyMock.mockResolvedValueOnce('failed');

    await expect(
      handleStripeEvent(fixture('checkout-session-completed-payment'), context),
    ).rejects.toThrow();
  });

  it('throws when a paid invoice has no PaymentIntent yet', async () => {
    findPaymentIntentMock.mockResolvedValueOnce(null);

    await expect(
      handleStripeEvent(fixture('invoice-paid'), context),
    ).rejects.toThrow();
  });

  it.each([
    'customer-subscription-created',
    'customer-subscription-updated',
    'customer-subscription-deleted',
  ])('upserts the Pledge for %s', async (name) => {
    const event = fixture(name);

    expect(await handleStripeEvent(event, context)).toBe('handled');
    expect(upsertPledgeMock).toHaveBeenCalledWith(event.data.object.id);
  });

  it('upserts the Pledge from the live subscription for invoice.payment_failed', async () => {
    expect(
      await handleStripeEvent(fixture('invoice-payment-failed'), context),
    ).toBe('handled');
    expect(upsertPledgeMock).toHaveBeenCalledTimes(1);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('marks the gift REFUNDED for a full refund', async () => {
    giftIds.add('pi_test_1');

    expect(await handleStripeEvent(fixture('charge-refunded'), context)).toBe(
      'handled',
    );
    expect(refundMock).toHaveBeenCalledWith('pi_test_1');
  });

  it('throws for a refund that arrives before its gift, then refunds after the gift exists', async () => {
    refundMock.mockImplementation(async (paymentIntentId: string) => {
      if (!giftIds.has(paymentIntentId)) return false;

      refundedIds.add(paymentIntentId);

      return true;
    });

    await expect(
      handleStripeEvent(fixture('charge-refunded'), context),
    ).rejects.toThrow();

    await handleStripeEvent(
      fixture('checkout-session-completed-payment'),
      context,
    );

    expect(await handleStripeEvent(fixture('charge-refunded'), context)).toBe(
      'handled',
    );
    expect(refundedIds.has('pi_test_1')).toBe(true);
  });

  it('answers handled for an unknown gift whose charge predates the import start', async () => {
    kvStore.set(STRIPE_IMPORT_START_KEY, 1793900000 + 7200);
    const event = fixture('charge-refunded');

    event.created = 1793900000 + 7200;
    event.data.object.created = 1793900000;

    expect(await handleStripeEvent(event, context)).toBe('handled');
  });

  describe('payment_intent.succeeded', () => {
    const BACKSTOP = {
      source: 'backstop' as const,
      nowSeconds: 1793900200 + 600,
    };
    const paymentIntentEvent = () =>
      fixture('payment-intent-succeeded-connect');
    const mockLoadedDetails = () => {
      const object = paymentIntentEvent().data.object;

      detailsMock.mockImplementationOnce(async () => {
        calls.push('details');

        return {
          paymentMethodType: 'card',
          feeCents: 103,
          paymentIntent: object as DetailsResult['paymentIntent'],
          charge: object.latest_charge as DetailsResult['charge'],
        };
      });
    };

    it('defers a webhook delivery without any Stripe call', async () => {
      expect(await handleStripeEvent(paymentIntentEvent(), context)).toBe(
        'deferred',
      );
      expect(handledElsewhereMock).not.toHaveBeenCalled();
      expect(detailsMock).not.toHaveBeenCalled();
      expect(applyMock).not.toHaveBeenCalled();
    });

    it('defers a backstop event 599 seconds old and imports one 600 seconds old', async () => {
      expect(
        await handleStripeEvent(paymentIntentEvent(), context, {
          source: 'backstop',
          nowSeconds: 1793900200 + 599,
        }),
      ).toBe('deferred');
      expect(applyMock).not.toHaveBeenCalled();

      mockLoadedDetails();

      expect(
        await handleStripeEvent(paymentIntentEvent(), context, BACKSTOP),
      ).toBe('handled');
      expect(giftIds.has('pi_test_connect')).toBe(true);
    });

    it('ignores an event without an id', async () => {
      const event = paymentIntentEvent();

      delete event.data.object.id;

      expect(await handleStripeEvent(event, context, BACKSTOP)).toBe('ignored');
    });

    it('creates one gift with the fee and type from the loaded details', async () => {
      mockLoadedDetails();

      expect(
        await handleStripeEvent(paymentIntentEvent(), context, BACKSTOP),
      ).toBe('handled');
      expect(calls).toEqual(['handled-elsewhere', 'details', 'apply']);
      expect(detailsMock).toHaveBeenCalledWith('pi_test_connect');
      expect(applyMock.mock.calls[0][0].gift).toMatchObject({
        id: 'pi_test_connect',
        amountCents: 2500,
        paymentMethodType: 'card',
        feeCents: 103,
      });
    });

    it('creates one gift when the same event arrives twice', async () => {
      mockLoadedDetails();
      await handleStripeEvent(paymentIntentEvent(), context, BACKSTOP);
      mockLoadedDetails();
      await handleStripeEvent(paymentIntentEvent(), context, BACKSTOP);

      expect(giftIds.size).toBe(1);
    });

    it('ignores a payment intent that a Checkout Session or invoice holds', async () => {
      handledElsewhereMock.mockResolvedValueOnce(true);

      expect(
        await handleStripeEvent(paymentIntentEvent(), context, BACKSTOP),
      ).toBe('ignored');
      expect(detailsMock).not.toHaveBeenCalled();
      expect(applyMock).not.toHaveBeenCalled();
    });

    it('applies the import start rule with its tolerance', async () => {
      kvStore.set(STRIPE_IMPORT_START_KEY, 1793900200 + 3601);

      expect(
        await handleStripeEvent(paymentIntentEvent(), context, BACKSTOP),
      ).toBe('skipped-before-start');
      expect(handledElsewhereMock).not.toHaveBeenCalled();

      kvStore.set(STRIPE_IMPORT_START_KEY, 1793900200 + 600);
      mockLoadedDetails();

      expect(
        await handleStripeEvent(paymentIntentEvent(), context, BACKSTOP),
      ).toBe('handled');
    });

    it('ignores a payment intent that is not a USD success', async () => {
      const event = paymentIntentEvent();

      event.data.object.status = 'processing';
      detailsMock.mockImplementationOnce(async () => ({
        paymentMethodType: null,
        feeCents: null,
        paymentIntent: event.data.object as DetailsResult['paymentIntent'],
        charge: event.data.object.latest_charge as DetailsResult['charge'],
      }));

      expect(await handleStripeEvent(event, context, BACKSTOP)).toBe('ignored');
      expect(applyMock).not.toHaveBeenCalled();
    });

    it('throws when the gift fails to apply', async () => {
      mockLoadedDetails();
      applyMock.mockResolvedValueOnce('failed');

      await expect(
        handleStripeEvent(paymentIntentEvent(), context, BACKSTOP),
      ).rejects.toThrow('Gift failed to import');
    });
  });

  describe('one Pledge read for each subscription in a run', () => {
    const runContext = () =>
      ({ pledgeSubscriptionIds: new Set<string>() }) as never;

    it('upserts each subscription one time for events that share a context', async () => {
      const shared = runContext();

      await handleStripeEvent(fixture('customer-subscription-created'), shared);
      await handleStripeEvent(fixture('invoice-paid'), shared);
      await handleStripeEvent(fixture('customer-subscription-updated'), shared);
      await handleStripeEvent(fixture('invoice-payment-failed'), shared);

      expect(upsertPledgeMock).toHaveBeenCalledTimes(1);
      expect(giftIds.has('pi_test_inv')).toBe(true);
    });

    it('upserts again after a failed upsert', async () => {
      const shared = runContext();

      upsertPledgeMock.mockRejectedValueOnce(new Error('write failed'));

      await expect(
        handleStripeEvent(fixture('customer-subscription-created'), shared),
      ).rejects.toThrow();
      await handleStripeEvent(fixture('customer-subscription-updated'), shared);

      expect(upsertPledgeMock).toHaveBeenCalledTimes(2);
    });

    it('upserts for every event in separate contexts', async () => {
      await handleStripeEvent(
        fixture('customer-subscription-created'),
        runContext(),
      );
      await handleStripeEvent(
        fixture('customer-subscription-updated'),
        runContext(),
      );

      expect(upsertPledgeMock).toHaveBeenCalledTimes(2);
    });
  });

  it('ignores a partial refund', async () => {
    const event = fixture('charge-refunded');

    event.data.object.refunded = false;

    expect(await handleStripeEvent(event, context)).toBe('ignored');
    expect(refundMock).not.toHaveBeenCalled();
  });

  it('ignores an unknown event type and stores no start time', async () => {
    const event = { ...fixture('charge-refunded'), type: 'customer.created' };

    expect(await handleStripeEvent(event, context)).toBe('ignored');
    expect(kvStore.has(STRIPE_IMPORT_START_KEY)).toBe(false);
  });

  it('sets the import start from the first event', async () => {
    await handleStripeEvent(fixture('customer-subscription-created'), context);

    expect(kvStore.get(STRIPE_IMPORT_START_KEY)).toBe(1793900000);
  });

  it('skips a gift event created before the import start', async () => {
    kvStore.set(STRIPE_IMPORT_START_KEY, 1793900000 + 3601);

    expect(
      await handleStripeEvent(
        fixture('checkout-session-completed-payment'),
        context,
      ),
    ).toBe('skipped-before-start');
    expect(await handleStripeEvent(fixture('invoice-paid'), context)).toBe(
      'skipped-before-start',
    );
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('processes a gift event 10 minutes before the import start', async () => {
    kvStore.set(STRIPE_IMPORT_START_KEY, 1793900000 + 600);

    expect(
      await handleStripeEvent(
        fixture('checkout-session-completed-payment'),
        context,
      ),
    ).toBe('handled');
    expect(giftIds.has('pi_test_1')).toBe(true);
  });

  it('still updates a plan for a subscription event created before the import start', async () => {
    kvStore.set(STRIPE_IMPORT_START_KEY, 1793900000 + 3601);

    expect(
      await handleStripeEvent(
        fixture('customer-subscription-deleted'),
        context,
      ),
    ).toBe('handled');
  });
});

describe('handleStripeWebhookRequest', () => {
  const body = JSON.stringify(fixture('checkout-session-completed-payment'));

  it('answers 503 when the secret is empty', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');

    const result = await handleStripeWebhookRequest(
      { rawBody: body, signatureHeader: sign(body) },
      context,
    );

    expect(result.status).toBe(503);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('answers 400 for a bad signature and calls nothing', async () => {
    const result = await handleStripeWebhookRequest(
      { rawBody: body, signatureHeader: 't=1,v1=deadbeef' },
      context,
    );

    expect(result.status).toBe(400);
    expect(applyMock).not.toHaveBeenCalled();
    expect(kvStore.size).toBe(0);
  });

  it('answers 400 for a missing body or header', async () => {
    expect(
      (
        await handleStripeWebhookRequest(
          { rawBody: undefined, signatureHeader: sign(body) },
          context,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleStripeWebhookRequest(
          { rawBody: body, signatureHeader: undefined },
          context,
        )
      ).status,
    ).toBe(400);
  });

  it('answers 400 for bad JSON with a good signature', async () => {
    const result = await handleStripeWebhookRequest(
      { rawBody: 'not json', signatureHeader: sign('not json') },
      context,
    );

    expect(result.status).toBe(400);
  });

  it('answers 200 and records the gift for a signed event', async () => {
    const result = await handleStripeWebhookRequest(
      { rawBody: body, signatureHeader: sign(body) },
      context,
    );

    expect(result).toEqual({ status: 200, body: 'OK' });
    expect(giftIds.has('pi_test_1')).toBe(true);
  });

  it('answers 200 for an unknown event type', async () => {
    const unknown = JSON.stringify({
      ...fixture('charge-refunded'),
      type: 'customer.created',
    });
    const result = await handleStripeWebhookRequest(
      { rawBody: unknown, signatureHeader: sign(unknown) },
      context,
    );

    expect(result.status).toBe(200);
  });

  it('marks the event done after a success', async () => {
    await handleStripeWebhookRequest(
      { rawBody: body, signatureHeader: sign(body) },
      context,
    );

    expect(kvStore.get('stripe-event-done:evt_test_1')).toBe(true);
  });

  it('marks an ignored event done', async () => {
    const subscriptionBody = JSON.stringify(
      fixture('checkout-session-completed-subscription'),
    );

    await handleStripeWebhookRequest(
      { rawBody: subscriptionBody, signatureHeader: sign(subscriptionBody) },
      context,
    );

    const eventId = fixture('checkout-session-completed-subscription').id;

    expect(kvStore.get(`stripe-event-done:${eventId}`)).toBe(true);
  });

  it('does not mark a failed event done', async () => {
    applyMock.mockResolvedValueOnce('failed');

    await handleStripeWebhookRequest(
      { rawBody: body, signatureHeader: sign(body) },
      context,
    );

    expect(kvStore.has('stripe-event-done:evt_test_1')).toBe(false);
  });

  it('does not mark a PaymentIntent event done, since the backstop imports it later', async () => {
    const paymentIntentBody = JSON.stringify(
      fixture('payment-intent-succeeded-connect'),
    );
    const result = await handleStripeWebhookRequest(
      { rawBody: paymentIntentBody, signatureHeader: sign(paymentIntentBody) },
      context,
    );
    const eventId = fixture('payment-intent-succeeded-connect').id;

    expect(result.status).toBe(200);
    expect(kvStore.has(`stripe-event-done:${eventId}`)).toBe(false);
  });

  it('answers 500 when the handler throws, without echoing the event or secret', async () => {
    applyMock.mockResolvedValueOnce('failed');

    const result = await handleStripeWebhookRequest(
      { rawBody: body, signatureHeader: sign(body) },
      context,
    );

    expect(result.status).toBe(500);
    expect(result.body).not.toContain('pi_test_1');
    expect(result.body).not.toContain(SECRET);
  });
});

describe('stripe-webhook route', () => {
  it('is public and forwards only the signature header', () => {
    expect(webhookFunction.config.httpRouteTriggerSettings).toMatchObject({
      path: '/stripe/webhook',
      httpMethod: 'POST',
      isAuthRequired: false,
      forwardedRequestHeaders: ['stripe-signature'],
    });
  });
});
