import { kv } from 'twenty-sdk/logic-function';

import {
  buildLandingPageView,
  HTML_HEADERS,
  isRateLimited,
  isRecord,
  loadLiveLandingPage,
  MESSAGES,
  readClientIp,
  readEnv,
  renderLandingPageRoute,
  result,
  type PageRouteResult,
  type RequestHeaders,
  type RouteResult,
} from 'src/logic-functions/landing-page.server';
import {
  isStripeConfigured,
  stripeRequest,
  StripeRequestError,
} from 'src/logic-functions/stripe-client';
import { renderGiftThanksPage } from 'src/shared/marketing/landing-page-sections-html';
import { hashIp } from 'src/shared/marketing/spam-guard';
import {
  buildCheckoutReturnUrls,
  buildGiftProductName,
  MAKE_MONTHLY_WINDOW_SECONDS,
} from 'src/shared/marketing/stripe-checkout';

export const CHECKOUT_SESSION_ID_PATTERN = /^cs_(test|live)_[A-Za-z0-9]+$/;

const CONFIRM_KV_PREFIX = 'confirm:';

// Stripe sends this code when the bank wants the donor to confirm an off-session charge.
const CONFIRM_ERROR_CODES = new Set([
  'authentication_required',
  'subscription_payment_intent_requires_action',
]);

type CheckoutSession = {
  mode?: unknown;
  status?: unknown;
  payment_status?: unknown;
  amount_total?: unknown;
  created?: unknown;
  customer?: unknown;
  customer_details?: { name?: unknown } | null;
  metadata?: unknown;
  payment_intent?: unknown;
  subscription?: unknown;
  url?: unknown;
};

export type MakeMonthlyResult =
  | { status: 'started' }
  | { status: 'confirm'; url: string }
  | { status: 'refused' };

const readMetadata = (value: unknown): Record<string, string> =>
  isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      )
    : {};

const readId = (value: unknown): string | null => {
  if (typeof value === 'string' && value !== '') return value;

  return isRecord(value) && typeof value.id === 'string' && value.id !== ''
    ? value.id
    : null;
};

const readAmountCents = (session: CheckoutSession): number | null =>
  typeof session.amount_total === 'number' &&
  Number.isInteger(session.amount_total) &&
  session.amount_total > 0
    ? session.amount_total
    : null;

const readFirstName = (session: CheckoutSession): string => {
  const name = session.customer_details?.name;

  return typeof name === 'string' ? (name.trim().split(/\s+/)[0] ?? '') : '';
};

const fetchCheckoutSession = (
  sessionId: string,
  expand: string[] = [],
): Promise<CheckoutSession> =>
  stripeRequest<CheckoutSession>({
    method: 'GET',
    path: `/v1/checkout/sessions/${sessionId}`,
    params: expand.length === 0 ? {} : { expand },
  });

export const readGiftThanks = (
  session: CheckoutSession,
  slug: string,
): {
  firstName: string;
  amountCents: number;
  giftType: 'MONTHLY' | 'ONE_TIME';
  isProcessing: boolean;
  created: number;
} | null => {
  const isPaidOneTime =
    session.mode === 'payment' && session.payment_status === 'paid';
  // A delayed payment, such as a bank debit, completes unpaid and settles later.
  const isProcessing =
    session.mode === 'payment' &&
    session.payment_status === 'unpaid' &&
    session.status === 'complete';
  const isCompleteMonthly =
    session.mode === 'subscription' && session.status === 'complete';
  const amountCents = readAmountCents(session);

  if (!isPaidOneTime && !isProcessing && !isCompleteMonthly) return null;
  if (readMetadata(session.metadata).lp_slug !== slug) return null;
  if (amountCents === null) return null;

  return {
    firstName: readFirstName(session),
    amountCents,
    giftType: isCompleteMonthly ? 'MONTHLY' : 'ONE_TIME',
    isProcessing,
    // A missing time hides the monthly ask, since its window cannot be checked.
    created: typeof session.created === 'number' ? session.created : 0,
  };
};

// Every failure falls back to the normal page so a stale or shared link still works.
export const renderGiftThanksRoute = async (input: {
  slug: string;
  query: Record<string, string | undefined>;
  now: Date;
}): Promise<PageRouteResult> => {
  const sessionId = input.query.session_id ?? '';

  if (!CHECKOUT_SESSION_ID_PATTERN.test(sessionId) || !isStripeConfigured()) {
    return renderLandingPageRoute(input);
  }

  try {
    const page = await loadLiveLandingPage(input.slug);

    if (page === null) return renderLandingPageRoute(input);

    const thanks = readGiftThanks(
      await fetchCheckoutSession(sessionId),
      page.slug,
    );

    if (thanks === null) return renderLandingPageRoute(input);

    return {
      status: 200,
      headers: HTML_HEADERS,
      body: renderGiftThanksPage({
        ...(await buildLandingPageView(page, input.query)),
        ...thanks,
        sessionId,
        now: input.now,
      }),
    };
  } catch (error) {
    console.error(
      error instanceof StripeRequestError
        ? `Landing page thanks Stripe error ${error.code ?? error.status}`
        : 'Landing page thanks failed',
    );

    return renderLandingPageRoute(input);
  }
};

const createConfirmCheckout = async (input: {
  sessionId: string;
  idempotencyKey: string;
  slug: string;
  customerId: string;
  priceId: string;
  metadata: Record<string, string>;
  subscriptionMetadata: Record<string, string>;
}): Promise<MakeMonthlyResult> => {
  const session = await stripeRequest<{ id?: unknown; url?: unknown }>({
    method: 'POST',
    path: '/v1/checkout/sessions',
    idempotencyKey: input.idempotencyKey,
    params: {
      mode: 'subscription',
      customer: input.customerId,
      line_items: [{ price: input.priceId, quantity: 1 }],
      ...buildCheckoutReturnUrls(readEnv('LANDING_PAGE_BASE_URL'), input.slug),
      metadata: input.metadata,
      subscription_data: { metadata: input.subscriptionMetadata },
    },
  });

  const checkoutId = readId(session.id);

  if (
    checkoutId === null ||
    typeof session.url !== 'string' ||
    session.url === ''
  ) {
    throw new Error('Make-monthly checkout returned no url');
  }

  // A later tap reads this Checkout instead of trying the subscription again.
  await kv.set(
    `make-monthly:${input.sessionId}`,
    `${CONFIRM_KV_PREFIX}${checkoutId}`,
  );

  return { status: 'confirm', url: session.url };
};

// X4: one session starts one plan, for the customer and card of that session only.
export const makeGiftMonthly = async (input: {
  slug: string;
  sessionId: string;
  now: Date;
}): Promise<MakeMonthlyResult> => {
  if (!CHECKOUT_SESSION_ID_PATTERN.test(input.sessionId)) {
    return { status: 'refused' };
  }

  const kvKey = `make-monthly:${input.sessionId}`;
  const stored = await kv.get<string>(kvKey);
  let expiredCheckoutId: string | null = null;

  if (typeof stored === 'string' && stored.startsWith(CONFIRM_KV_PREFIX)) {
    const checkoutId = stored.slice(CONFIRM_KV_PREFIX.length);
    const checkout = await fetchCheckoutSession(checkoutId);
    const subscriptionId = readId(checkout.subscription);

    if (checkout.status === 'complete' && subscriptionId !== null) {
      await kv.set(kvKey, subscriptionId);

      return { status: 'started' };
    }

    if (
      checkout.status === 'open' &&
      typeof checkout.url === 'string' &&
      checkout.url !== ''
    ) {
      return { status: 'confirm', url: checkout.url };
    }

    expiredCheckoutId = checkoutId;
  } else if (typeof stored === 'string' && stored !== '') {
    return { status: 'started' };
  }

  const session = await fetchCheckoutSession(input.sessionId, [
    'payment_intent',
  ]);
  const metadata = readMetadata(session.metadata);
  const amountCents = readAmountCents(session);
  const customerId = readId(session.customer);
  const paymentMethodId = isRecord(session.payment_intent)
    ? readId(session.payment_intent.payment_method)
    : null;
  const nowSeconds = Math.floor(input.now.getTime() / 1000);
  const isRecent =
    typeof session.created === 'number' &&
    nowSeconds - session.created <= MAKE_MONTHLY_WINDOW_SECONDS;

  if (
    session.mode !== 'payment' ||
    session.payment_status !== 'paid' ||
    metadata.lp_slug !== input.slug ||
    !isRecent ||
    amountCents === null ||
    customerId === null ||
    paymentMethodId === null
  ) {
    return { status: 'refused' };
  }

  const price = await stripeRequest<{ id?: unknown }>({
    method: 'POST',
    path: '/v1/prices',
    idempotencyKey: `make-monthly-price-${input.sessionId}`,
    params: {
      currency: 'usd',
      unit_amount: amountCents,
      recurring: { interval: 'month' },
      product_data: {
        name: buildGiftProductName(readEnv('LANDING_PAGE_ORGANIZATION_NAME')),
      },
    },
  });
  const priceId = readId(price.id);

  if (priceId === null) throw new Error('Make-monthly price returned no id');

  const subscriptionMetadata = {
    ...metadata,
    made_monthly_from: input.sessionId,
  };
  const confirm = () =>
    createConfirmCheckout({
      sessionId: input.sessionId,
      idempotencyKey:
        expiredCheckoutId === null
          ? `make-monthly-checkout-${input.sessionId}`
          : `make-monthly-checkout-${input.sessionId}-${expiredCheckoutId}`,
      slug: input.slug,
      customerId,
      priceId,
      metadata,
      subscriptionMetadata,
    });

  // The bank already asked for confirmation, so only a new Checkout can help.
  if (expiredCheckoutId !== null) return confirm();

  let subscription: { id?: unknown; status?: unknown };

  try {
    subscription = await stripeRequest<{ id?: unknown; status?: unknown }>({
      method: 'POST',
      path: '/v1/subscriptions',
      idempotencyKey: `make-monthly-${input.sessionId}`,
      params: {
        customer: customerId,
        items: [{ price: priceId }],
        default_payment_method: paymentMethodId,
        off_session: true,
        payment_behavior: 'error_if_incomplete',
        metadata: subscriptionMetadata,
      },
    });
  } catch (error) {
    if (
      error instanceof StripeRequestError &&
      error.code !== null &&
      CONFIRM_ERROR_CODES.has(error.code)
    ) {
      return confirm();
    }

    throw error;
  }

  if (subscription.status === 'incomplete') return confirm();

  const subscriptionId = readId(subscription.id);

  if (subscriptionId === null) {
    throw new Error('Make-monthly subscription returned no id');
  }

  await kv.set(kvKey, subscriptionId);

  return { status: 'started' };
};

export const handleMakeMonthly = async (input: {
  slug: string;
  body: unknown;
  headers: RequestHeaders;
  now: Date;
}): Promise<RouteResult | { status: number; body: MakeMonthlyResult }> => {
  const ipSalt = readEnv('TURNSTILE_SECRET_KEY');

  if (
    !isStripeConfigured() ||
    readEnv('LANDING_PAGE_BASE_URL') === '' ||
    ipSalt === ''
  ) {
    return result(503, false, MESSAGES.unavailable);
  }

  const ip = readClientIp(input.headers);
  const ipHash = ip === null ? null : hashIp(ip, ipSalt);

  if (await isRateLimited('makeMonthly', ipHash)) {
    return result(429, false, MESSAGES.rateLimited);
  }

  const sessionId =
    isRecord(input.body) && typeof input.body.sessionId === 'string'
      ? input.body.sessionId
      : '';

  if (!CHECKOUT_SESSION_ID_PATTERN.test(sessionId)) {
    return { status: 400, body: { status: 'refused' } };
  }

  try {
    const outcome = await makeGiftMonthly({
      slug: input.slug,
      sessionId,
      now: input.now,
    });

    return { status: outcome.status === 'refused' ? 400 : 200, body: outcome };
  } catch (error) {
    console.error(
      error instanceof StripeRequestError
        ? `Landing page make-monthly Stripe error ${error.code ?? error.status}`
        : 'Landing page make-monthly failed',
    );

    return result(502, false, MESSAGES.failure);
  }
};
