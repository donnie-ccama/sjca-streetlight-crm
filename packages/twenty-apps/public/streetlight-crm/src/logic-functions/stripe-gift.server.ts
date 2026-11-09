import { stripeRequest } from 'src/logic-functions/stripe-client';
import type {
  StripeCharge,
  StripePaymentIntent,
} from 'src/shared/marketing/stripe-gift';

type PaymentIntentResponse = StripePaymentIntent & {
  latest_charge?:
    | (StripeCharge & {
        payment_method_details?: { type?: string | null } | null;
        // A string ID when the expansion did not apply.
        balance_transaction?: { fee?: number | null } | string | null;
      })
    | null;
};

type InvoicePaymentsResponse = {
  data?: {
    status?: string;
    payment?: { type?: string; payment_intent?: string | null };
  }[];
};

export const loadPaymentIntentDetails = async (
  paymentIntentId: string,
): Promise<{
  paymentMethodType: string | null;
  feeCents: number | null;
  paymentIntent: StripePaymentIntent;
  charge: StripeCharge | null;
}> => {
  const paymentIntent = await stripeRequest<PaymentIntentResponse>({
    method: 'GET',
    path: `/v1/payment_intents/${paymentIntentId}`,
    params: { expand: ['latest_charge.balance_transaction'] },
  });
  const charge = paymentIntent.latest_charge;
  const balanceTransaction = charge?.balance_transaction;
  const fee =
    typeof balanceTransaction === 'object' && balanceTransaction !== null
      ? balanceTransaction.fee
      : null;

  return {
    paymentMethodType: charge?.payment_method_details?.type ?? null,
    feeCents: typeof fee === 'number' ? fee : null,
    paymentIntent,
    charge: charge ?? null,
  };
};

// Invoices carry no payment_intent field since 2025-03-31.basil.
export const findInvoicePaymentIntentId = async (
  invoiceId: string,
): Promise<string | null> => {
  const payments = await stripeRequest<InvoicePaymentsResponse>({
    method: 'GET',
    path: '/v1/invoice_payments',
    params: { invoice: invoiceId },
  });
  const paid = (payments.data ?? []).find(
    (payment) =>
      payment.status === 'paid' &&
      payment.payment?.type === 'payment_intent' &&
      typeof payment.payment.payment_intent === 'string',
  );

  return paid?.payment?.payment_intent ?? null;
};

type ListResponse = { data?: unknown[] };

// Checkout and invoice events import these payments, so the PaymentIntent event must not.
export const isPaymentIntentHandledElsewhere = async (
  paymentIntentId: string,
): Promise<boolean> => {
  const sessions = await stripeRequest<ListResponse>({
    method: 'GET',
    path: '/v1/checkout/sessions',
    params: { payment_intent: paymentIntentId, limit: 1 },
  });

  if ((sessions.data ?? []).length > 0) return true;

  const invoicePayments = await stripeRequest<ListResponse>({
    method: 'GET',
    path: '/v1/invoice_payments',
    params: {
      payment: { type: 'payment_intent', payment_intent: paymentIntentId },
      limit: 1,
    },
  });

  return (invoicePayments.data ?? []).length > 0;
};
