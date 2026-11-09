import { isNonEmptyString } from '@sniptt/guards';

import type { OnlineGift } from 'src/shared/marketing/online-gift-import';

type StripeMetadata = Record<string, string> | null;

// Only the fields the adapters read.
export type StripeCheckoutSession = {
  id: string;
  mode: string;
  payment_status: string;
  currency: string;
  amount_total: number | null;
  created: number;
  payment_intent: string | null;
  metadata: StripeMetadata;
  customer_details: {
    email: string | null;
    name: string | null;
    phone: string | null;
  } | null;
};

export type StripeInvoice = {
  id: string;
  status: string | null;
  currency: string;
  amount_paid: number;
  created: number;
  customer_email: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  status_transitions?: { paid_at: number | null } | null;
  parent: {
    subscription_details: {
      subscription: string | null;
      metadata: StripeMetadata;
    } | null;
  } | null;
};

export type StripeCharge = {
  created: number;
  payment_method_details?: { type?: string | null } | null;
  billing_details?: {
    email?: string | null;
    name?: string | null;
    phone?: string | null;
  } | null;
};

export type StripePaymentIntent = {
  id: string;
  status: string;
  currency: string;
  amount_received: number;
  receipt_email?: string | null;
  metadata?: StripeMetadata;
};

const GIFT_CURRENCY = 'usd';
const UTM_KEY_PREFIX = 'utm_';

const toIsoTime = (epochSeconds: number): string =>
  new Date(epochSeconds * 1000).toISOString();

const textOrNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();

  return isNonEmptyString(trimmed) ? trimmed : null;
};

// Stripe holds one name field. The last word is the last name.
const splitName = (
  name: string | null | undefined,
): { firstName: string | null; lastName: string | null } => {
  const trimmed = textOrNull(name);

  if (trimmed === null) return { firstName: null, lastName: null };

  const splitAt = trimmed.lastIndexOf(' ');

  return splitAt === -1
    ? { firstName: trimmed, lastName: null }
    : {
        firstName: trimmed.slice(0, splitAt).trim(),
        lastName: trimmed.slice(splitAt + 1).trim(),
      };
};

const readMetadata = (metadata: StripeMetadata) => {
  const utm: Record<string, string> = {};

  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (key.startsWith(UTM_KEY_PREFIX) && isNonEmptyString(value)) {
      utm[key] = value;
    }
  }

  return {
    utm,
    landingPageSlug: textOrNull(metadata?.lp_slug),
    inviteCode: textOrNull(metadata?.invite_code),
  };
};

export const giftFromCheckoutSession = (
  session: StripeCheckoutSession,
): OnlineGift | null => {
  // A subscription session is imported from its invoices, one gift per charge.
  if (
    session.mode !== 'payment' ||
    session.payment_status !== 'paid' ||
    session.currency.toLowerCase() !== GIFT_CURRENCY ||
    !isNonEmptyString(session.payment_intent) ||
    session.amount_total === null ||
    session.amount_total <= 0
  ) {
    return null;
  }

  return {
    id: session.payment_intent,
    status: 'succeeded',
    amountCents: session.amount_total,
    currency: session.currency,
    paidAt: toIsoTime(session.created),
    paymentMethodType: null,
    feeCents: null,
    ...readMetadata(session.metadata),
    subscriptionId: null,
    supporter: {
      email: textOrNull(session.customer_details?.email),
      ...splitName(session.customer_details?.name),
      phone: textOrNull(session.customer_details?.phone),
    },
  };
};

// The Invoice has no PaymentIntent field, so the caller looks it up and passes it in.
export const giftFromInvoice = (
  invoice: StripeInvoice,
  paymentIntentId: string,
): OnlineGift | null => {
  if (
    invoice.status !== 'paid' ||
    invoice.currency.toLowerCase() !== GIFT_CURRENCY ||
    invoice.amount_paid <= 0
  ) {
    return null;
  }

  const subscriptionDetails = invoice.parent?.subscription_details ?? null;

  return {
    id: paymentIntentId,
    status: 'succeeded',
    amountCents: invoice.amount_paid,
    currency: invoice.currency,
    paidAt: toIsoTime(invoice.status_transitions?.paid_at ?? invoice.created),
    paymentMethodType: null,
    feeCents: null,
    ...readMetadata(subscriptionDetails?.metadata ?? null),
    subscriptionId: textOrNull(subscriptionDetails?.subscription),
    supporter: {
      email: textOrNull(invoice.customer_email),
      ...splitName(invoice.customer_name),
      phone: textOrNull(invoice.customer_phone),
    },
  };
};

// For payments made outside Checkout and invoices, such as payments made by another tool on the same account.
export const giftFromPaymentIntent = (
  paymentIntent: StripePaymentIntent,
  charge: StripeCharge,
): OnlineGift | null => {
  if (
    paymentIntent.status !== 'succeeded' ||
    paymentIntent.currency.toLowerCase() !== GIFT_CURRENCY ||
    paymentIntent.amount_received <= 0
  ) {
    return null;
  }

  const billing = charge.billing_details;

  return {
    id: paymentIntent.id,
    status: 'succeeded',
    amountCents: paymentIntent.amount_received,
    currency: paymentIntent.currency,
    paidAt: toIsoTime(charge.created),
    paymentMethodType: charge.payment_method_details?.type ?? null,
    feeCents: null,
    ...readMetadata(paymentIntent.metadata ?? null),
    subscriptionId: null,
    supporter: {
      email:
        textOrNull(billing?.email) ?? textOrNull(paymentIntent.receipt_email),
      ...splitName(billing?.name),
      phone: textOrNull(billing?.phone),
    },
  };
};
