import { LANDING_PAGE_ROUTE_BASE_PATH } from 'src/constants/marketing-identifiers';
import { parseAttribution } from 'src/shared/marketing/attribution';
import { INVITE_CODE_PATTERN } from 'src/shared/marketing/invite-input';

export const MIN_GIFT_CENTS = 500;
export const MAX_GIFT_CENTS = 99_999_999;
export const MAKE_MONTHLY_WINDOW_SECONDS = 24 * 60 * 60;

export type CheckoutGiftType = 'MONTHLY' | 'ONE_TIME';

export type CheckoutInput = {
  giftType: CheckoutGiftType;
  amountCents: number;
  utm: Record<string, string>;
  inviteCode: string | null;
};

export type CheckoutInputResult =
  | { ok: true; value: CheckoutInput }
  | { ok: false };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const parseCheckoutInput = (body: unknown): CheckoutInputResult => {
  if (!isRecord(body)) return { ok: false };

  const { giftType, amountCents } = body;

  if (giftType !== 'MONTHLY' && giftType !== 'ONE_TIME') return { ok: false };

  if (
    typeof amountCents !== 'number' ||
    !Number.isInteger(amountCents) ||
    amountCents < MIN_GIFT_CENTS ||
    amountCents > MAX_GIFT_CENTS
  ) {
    return { ok: false };
  }

  const rawUtm: Record<string, string | undefined> = {};

  const utmSource = isRecord(body.utm) ? body.utm : body;

  for (const [key, value] of Object.entries(utmSource)) {
    if (typeof value === 'string') rawUtm[key] = value;
  }

  const inviteCode =
    typeof body.inviteCode === 'string' &&
    INVITE_CODE_PATTERN.test(body.inviteCode)
      ? body.inviteCode
      : null;

  return {
    ok: true,
    value: {
      giftType,
      amountCents,
      utm: parseAttribution(rawUtm).utmRaw,
      inviteCode,
    },
  };
};

export const buildGiftProductName = (organizationName: string): string =>
  organizationName === '' ? 'Gift' : `Gift to ${organizationName}`;

export const buildCheckoutReturnUrls = (
  baseUrl: string,
  slug: string,
): { success_url: string; cancel_url: string } => {
  const host = baseUrl.replace(/\/+$/, '');
  const encodedSlug = encodeURIComponent(slug);

  // The edge rewrite maps only one-segment paths, so the thanks page needs the full route.
  return {
    success_url: `${host}${LANDING_PAGE_ROUTE_BASE_PATH}/${encodedSlug}/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${host}/${encodedSlug}`,
  };
};

export const buildCheckoutSessionParams = (input: {
  slug: string;
  baseUrl: string;
  organizationName: string;
  giftType: CheckoutGiftType;
  amountCents: number;
  utm: Record<string, string>;
  inviteCode: string | null;
}): Record<string, unknown> => {
  const productName = buildGiftProductName(input.organizationName);
  const metadata: Record<string, string> = { lp_slug: input.slug };

  if (input.inviteCode !== null) metadata.invite_code = input.inviteCode;

  for (const [key, value] of Object.entries(input.utm)) {
    if (value !== '') metadata[key] = value;
  }

  const priceData = {
    currency: 'usd',
    unit_amount: input.amountCents,
    product_data: { name: productName },
    ...(input.giftType === 'MONTHLY'
      ? { recurring: { interval: 'month' } }
      : {}),
  };

  const shared = {
    line_items: [{ price_data: priceData, quantity: 1 }],
    ...buildCheckoutReturnUrls(input.baseUrl, input.slug),
    metadata,
  };

  if (input.giftType === 'MONTHLY') {
    return {
      ...shared,
      mode: 'subscription',
      subscription_data: { metadata },
    };
  }

  return {
    ...shared,
    mode: 'payment',
    submit_type: 'donate',
    customer_creation: 'always',
    payment_intent_data: { setup_future_usage: 'off_session', metadata },
  };
};
