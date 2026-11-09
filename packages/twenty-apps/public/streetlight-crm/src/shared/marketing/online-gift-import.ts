import {
  buildDonationCreateVariables,
  buildHardCreditCreateVariables,
  paymentMethodLabel,
  type NormalizedEntry,
} from 'src/shared/daily-entry-specs';
import {
  parseAttribution,
  type Attribution,
} from 'src/shared/marketing/attribution';
import {
  parseFormInput,
  type FormInput,
} from 'src/shared/marketing/form-input';

// Stripe amounts are cents. CRM amounts are micros.
const MICROS_PER_CENT = 10_000n;

export type OnlineGift = {
  id: string;
  status: 'succeeded' | 'refunded';
  amountCents: number;
  currency: string;
  paidAt: string;
  paymentMethodType: string | null;
  feeCents: number | null;
  utm: Record<string, string>;
  landingPageSlug: string | null;
  inviteCode: string | null;
  subscriptionId: string | null;
  supporter: {
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
  };
};

export type ImportAction =
  | {
      kind: 'create';
      donation: Record<string, unknown>;
      credit: Record<string, unknown>;
      attribution: Attribution;
    }
  | { kind: 'markRefunded'; donationId: string }
  | {
      kind: 'repair';
      donationId: string;
      credit: Record<string, unknown> | null;
      createResponse: boolean;
      attribution: Attribution;
    }
  | { kind: 'skip'; reason: string };

export type ImportedPaymentMethod =
  | 'CREDIT_CARD'
  | 'ACH'
  | 'PAYPAL'
  | 'VENMO'
  | 'CRYPTOCURRENCY'
  | 'STOCK'
  | 'OTHER';

const PAYMENT_METHOD_BY_TYPE: Record<string, ImportedPaymentMethod> = {
  card: 'CREDIT_CARD',
  paypal: 'PAYPAL',
  venmo: 'VENMO',
  crypto: 'CRYPTOCURRENCY',
  us_bank_account: 'ACH',
  link: 'CREDIT_CARD',
};

export const ONLINE_GIFT_ENTRY_KEY_PREFIX = 'stripe:';

export type ExistingDonation = {
  id: string;
  isDeleted: boolean;
  giftStatus: string;
  hasHardCredit: boolean;
  hasGiftResponse: boolean;
};

export const mapPaymentMethod = (
  paymentMethodType: string,
): ImportedPaymentMethod =>
  Object.prototype.hasOwnProperty.call(
    PAYMENT_METHOD_BY_TYPE,
    paymentMethodType,
  )
    ? PAYMENT_METHOD_BY_TYPE[paymentMethodType]
    : 'OTHER';

export const buildGiftAttribution = (gift: OnlineGift): Attribution =>
  parseAttribution(gift.utm);

export const isValidTimeZone = (timeZone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });

    return true;
  } catch {
    return false;
  }
};

// en-CA formats a date as YYYY-MM-DD.
export const toGiftDate = (isoTime: string, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(isoTime));

// Adapts the supporter to the landing page form so the Person rules (X3) stay in one place.
// Gifts carry no SMS consent. A missing or invalid email gives null.
export const buildGiftDonorForm = (gift: OnlineGift): FormInput | null => {
  const parsed = parseFormInput({
    firstName: gift.supporter.firstName ?? '',
    lastName: gift.supporter.lastName ?? '',
    email: gift.supporter.email ?? '',
    phone: gift.supporter.phone ?? '',
    smsConsent: false,
  });

  return parsed.ok ? parsed.value : null;
};

// Donor rollups add micros across currencies, so only USD gifts are imported (R23).
const IMPORTED_CURRENCY = 'USD';

const toMoney = (micros: bigint) => ({
  amountMicros: micros.toString(),
  currencyCode: IMPORTED_CURRENCY,
});

const buildEntry = (
  gift: OnlineGift,
  amountMicros: bigint,
  timeZone: string,
): NormalizedEntry => {
  const paymentMethod = mapPaymentMethod(gift.paymentMethodType ?? '');

  return {
    entryKey: `${ONLINE_GIFT_ENTRY_KEY_PREFIX}${gift.id}`,
    entryMode: 'ONLINE_GIFT',
    giftDate: toGiftDate(gift.paidAt, timeZone),
    amountMicros: amountMicros.toString(),
    paymentMethod,
    onlineTransactionId: gift.id,
    tributeType: 'NONE',
    acknowledgmentStatus: 'PENDING',
    name: `Online ${paymentMethodLabel(paymentMethod).toLowerCase()} donor gift`,
  };
};

// The caller adds donationId and personId.
const buildCredit = (
  entry: NormalizedEntry,
  amountMicros: bigint,
): Record<string, unknown> => {
  const credit: Record<string, unknown> = {
    ...(buildHardCreditCreateVariables(entry, '').data as Record<
      string,
      unknown
    >),
    creditAmount: toMoney(amountMicros),
  };

  delete credit.donationId;

  return credit;
};

// Undefined for a zero, negative, or fractional cent amount.
const centsToMicros = (cents: number): bigint | undefined =>
  Number.isSafeInteger(cents) && cents > 0
    ? BigInt(cents) * MICROS_PER_CENT
    : undefined;

const planRepair = (
  gift: OnlineGift,
  existing: ExistingDonation,
  timeZone: string,
): ImportAction => {
  const amountMicros = centsToMicros(gift.amountCents);
  const needsCredit =
    !existing.hasHardCredit &&
    buildGiftDonorForm(gift) !== null &&
    amountMicros !== undefined;

  if (!needsCredit && existing.hasGiftResponse) {
    return { kind: 'skip', reason: 'already-imported' };
  }

  return {
    kind: 'repair',
    donationId: existing.id,
    credit: needsCredit
      ? buildCredit(buildEntry(gift, amountMicros, timeZone), amountMicros)
      : null,
    createResponse: !existing.hasGiftResponse,
    attribution: buildGiftAttribution(gift),
  };
};

export const planOnlineGiftImport = (input: {
  gift: OnlineGift;
  existing: ExistingDonation | null;
  timeZone?: string;
}): ImportAction => {
  const { gift, existing } = input;
  const timeZone = input.timeZone ?? 'UTC';

  // Staff deleted it on purpose; restoring or re-creating it would undo that.
  if (existing?.isDeleted === true) {
    return { kind: 'skip', reason: 'deleted-in-crm' };
  }

  if (existing !== null) {
    return gift.status === 'refunded' && existing.giftStatus !== 'REFUNDED'
      ? { kind: 'markRefunded', donationId: existing.id }
      : planRepair(gift, existing, timeZone);
  }

  if (gift.status !== 'succeeded') {
    return { kind: 'skip', reason: `status-${gift.status}` };
  }

  if (gift.currency.trim().toUpperCase() !== IMPORTED_CURRENCY) {
    return { kind: 'skip', reason: 'non-usd-currency' };
  }

  const amountMicros = centsToMicros(gift.amountCents);

  if (amountMicros === undefined) {
    return { kind: 'skip', reason: 'invalid-amount' };
  }

  const attribution = buildGiftAttribution(gift);
  const entry = buildEntry(gift, amountMicros, timeZone);
  const donation: Record<string, unknown> = {
    ...(buildDonationCreateVariables(entry).data as Record<string, unknown>),
    giftStatus: 'PAID',
    utmRaw: attribution.utmRaw,
  };
  const feeMicros =
    gift.feeCents === null ? undefined : centsToMicros(gift.feeCents);

  if (feeMicros !== undefined) {
    donation.processingFee = toMoney(feeMicros);
  }

  return {
    kind: 'create',
    donation,
    credit: buildCredit(entry, amountMicros),
    attribution,
  };
};
