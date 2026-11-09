import { isNonEmptyString } from '@sniptt/guards';
import { kv } from 'twenty-sdk/logic-function';

import { resolveGiftTimeZone } from 'src/logic-functions/gift-time-zone';
import {
  applyOnlineGift,
  markGiftRefundedByPaymentIntent,
  type GiftContext,
} from 'src/logic-functions/online-gift.server';
import {
  findInvoicePaymentIntentId,
  isPaymentIntentHandledElsewhere,
  loadPaymentIntentDetails,
} from 'src/logic-functions/stripe-gift.server';
import { markStripeEventDone } from 'src/logic-functions/stripe-event-done.server';
import { upsertPledgeFromSubscription } from 'src/logic-functions/stripe-pledge.server';
import {
  giftFromCheckoutSession,
  giftFromInvoice,
  giftFromPaymentIntent,
  type StripeCheckoutSession,
  type StripeInvoice,
} from 'src/shared/marketing/stripe-gift';
import { verifyStripeSignature } from 'src/shared/marketing/stripe-signature';

export const STRIPE_IMPORT_START_KEY = 'stripe-import-start';
// A late retry of an event from just before the first one must still count.
export const IMPORT_START_TOLERANCE_SECONDS = 3600;

export type StripeEvent = {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
};

// Checkout and invoice events create their gifts first, and Stripe's lists settle by then.
export const PAYMENT_INTENT_SETTLE_SECONDS = 600;

export type StripeEventOptions = {
  source: 'webhook' | 'backstop';
  nowSeconds: number;
};

// 'deferred' means a later backstop run must handle the event again.
export type StripeEventResult =
  | 'handled'
  | 'ignored'
  | 'skipped-before-start'
  | 'deferred';

const GIFT_EVENT_TYPES = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'invoice.paid',
  'payment_intent.succeeded',
]);
const KNOWN_EVENT_TYPES = new Set([
  ...GIFT_EVENT_TYPES,
  'checkout.session.async_payment_failed',
  'charge.refunded',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
]);

const subscriptionIdFromInvoice = (invoice: StripeInvoice): string | null => {
  const subscriptionId = invoice.parent?.subscription_details?.subscription;

  return isNonEmptyString(subscriptionId) ? subscriptionId : null;
};

// The Pledge is read live from Stripe, so one upsert per run is current.
const upsertPledgeOnce = async (
  subscriptionId: string,
  context: GiftContext,
): Promise<void> => {
  if (context.pledgeSubscriptionIds?.has(subscriptionId)) return;

  await upsertPledgeFromSubscription(subscriptionId);
  context.pledgeSubscriptionIds?.add(subscriptionId);
};

// Returns true when the event predates the first one this app received.
const isBeforeImportStart = async (event: StripeEvent): Promise<boolean> => {
  const stored = await kv.get<number>(STRIPE_IMPORT_START_KEY);

  if (typeof stored !== 'number') {
    await kv.set(STRIPE_IMPORT_START_KEY, event.created);

    return false;
  }

  return (
    GIFT_EVENT_TYPES.has(event.type) &&
    event.created < stored - IMPORT_START_TOLERANCE_SECONDS
  );
};

const applyOrThrow = async (
  gift: Parameters<typeof applyOnlineGift>[0]['gift'],
  context: GiftContext,
): Promise<StripeEventResult> => {
  const outcome = await applyOnlineGift({
    gift,
    timeZone: resolveGiftTimeZone(),
    context,
  });

  // Stripe retries on a 500, so a missing Pledge or a write error is not lost.
  if (outcome === 'failed') throw new Error('Gift failed to import');

  return 'handled';
};

const handleCheckoutSession = async (
  session: StripeCheckoutSession,
  context: GiftContext,
): Promise<StripeEventResult> => {
  const gift = giftFromCheckoutSession(session);

  if (gift === null) return 'ignored';

  const { paymentMethodType, feeCents } = await loadPaymentIntentDetails(
    gift.id,
  );

  return applyOrThrow({ ...gift, paymentMethodType, feeCents }, context);
};

const handlePaidInvoice = async (
  invoice: StripeInvoice,
  context: GiftContext,
): Promise<StripeEventResult> => {
  const subscriptionId = subscriptionIdFromInvoice(invoice);

  // The gift links to the Pledge, so the Pledge must exist first.
  // An invoice with no subscription imports as a one-time gift.
  if (subscriptionId !== null) await upsertPledgeOnce(subscriptionId, context);

  const paymentIntentId = await findInvoicePaymentIntentId(invoice.id);

  if (paymentIntentId === null) {
    if (invoice.amount_paid > 0)
      throw new Error('Invoice has no PaymentIntent');

    return 'ignored';
  }

  const gift = giftFromInvoice(invoice, paymentIntentId);

  if (gift === null) return 'ignored';

  const { paymentMethodType, feeCents } =
    await loadPaymentIntentDetails(paymentIntentId);

  return applyOrThrow({ ...gift, paymentMethodType, feeCents }, context);
};

const handlePaymentIntent = async (
  paymentIntentId: string,
  context: GiftContext,
): Promise<StripeEventResult> => {
  if (await isPaymentIntentHandledElsewhere(paymentIntentId)) return 'ignored';

  // The event carries the charge as an ID, so it is read again with the fee.
  const { paymentIntent, charge, paymentMethodType, feeCents } =
    await loadPaymentIntentDetails(paymentIntentId);

  if (charge === null) return 'ignored';

  const gift = giftFromPaymentIntent(paymentIntent, charge);

  if (gift === null) return 'ignored';

  return applyOrThrow({ ...gift, paymentMethodType, feeCents }, context);
};

export const handleStripeEvent = async (
  event: StripeEvent,
  context: GiftContext,
  options: StripeEventOptions = {
    source: 'webhook',
    nowSeconds: Math.floor(Date.now() / 1000),
  },
): Promise<StripeEventResult> => {
  if (!KNOWN_EVENT_TYPES.has(event.type)) return 'ignored';

  // Only the backstop imports plain PaymentIntents, once they are settled.
  if (
    event.type === 'payment_intent.succeeded' &&
    (options.source !== 'backstop' ||
      options.nowSeconds - event.created < PAYMENT_INTENT_SETTLE_SECONDS)
  ) {
    return 'deferred';
  }

  if (await isBeforeImportStart(event)) return 'skipped-before-start';

  const object = event.data.object;

  switch (event.type) {
    // A delayed payment (such as a bank debit) completes unpaid and succeeds later.
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      return handleCheckoutSession(object as StripeCheckoutSession, context);
    case 'checkout.session.async_payment_failed':
      console.log(`Stripe event ${event.id} ${event.type}: no gift`);

      return 'handled';
    case 'invoice.paid':
      return handlePaidInvoice(object as StripeInvoice, context);
    case 'payment_intent.succeeded':
      return isNonEmptyString(object.id)
        ? handlePaymentIntent(object.id, context)
        : 'ignored';
    case 'invoice.payment_failed': {
      const subscriptionId = subscriptionIdFromInvoice(object as StripeInvoice);

      if (subscriptionId === null) return 'ignored';

      await upsertPledgeOnce(subscriptionId, context);

      return 'handled';
    }
    case 'charge.refunded': {
      const {
        payment_intent: paymentIntentId,
        refunded,
        created: chargeCreated,
      } = object as {
        payment_intent: string | null;
        refunded: boolean;
        created?: number;
      };

      // A partial refund leaves the gift as it is.
      if (refunded !== true || !isNonEmptyString(paymentIntentId)) {
        return 'ignored';
      }

      if (await markGiftRefundedByPaymentIntent(paymentIntentId)) {
        return 'handled';
      }

      const start = await kv.get<number>(STRIPE_IMPORT_START_KEY);
      const isPreSwitchCharge =
        typeof start !== 'number' ||
        (chargeCreated ?? event.created) <
          start - IMPORT_START_TOLERANCE_SECONDS;

      // The gift may not exist yet, so Stripe retries until it does.
      if (!isPreSwitchCharge) throw new Error('Refunded gift not found');

      return 'handled';
    }
    default: {
      // customer.subscription.created, .updated and .deleted
      await upsertPledgeOnce(object.id as string, context);

      return 'handled';
    }
  }
};

export type StripeWebhookRequest = {
  rawBody: string | undefined;
  signatureHeader: string | undefined;
};

export const handleStripeWebhookRequest = async (
  request: StripeWebhookRequest,
  context: GiftContext,
): Promise<{ status: number; body: string }> => {
  const secret = (process.env.STRIPE_WEBHOOK_SECRET ?? '').trim();

  if (secret === '') return { status: 503, body: 'Not configured' };

  const { rawBody, signatureHeader } = request;

  if (
    !isNonEmptyString(rawBody) ||
    !verifyStripeSignature({
      rawBody,
      header: signatureHeader ?? '',
      secret,
      nowSeconds: Math.floor(Date.now() / 1000),
    })
  ) {
    return { status: 400, body: 'Invalid request' };
  }

  let event: StripeEvent;

  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return { status: 400, body: 'Invalid request' };
  }

  if (!isNonEmptyString(event?.id) || !isNonEmptyString(event?.type)) {
    return { status: 400, body: 'Invalid request' };
  }

  try {
    const result = await handleStripeEvent(event, context);

    if (result !== 'deferred') await markStripeEventDone(event.id);

    console.log(`Stripe event ${event.id} ${event.type}: ${result}`);

    return { status: 200, body: 'OK' };
  } catch {
    // The error text can echo donor values, so only the id and type are logged.
    console.error(`Stripe event ${event.id} ${event.type} failed`);

    return { status: 500, body: 'Error' };
  }
};
