// Shared contract for the Daily Giving entry experience.
//
// This module is imported by BOTH sides of the feature:
//   - src/front-components/daily-donation-entry.tsx (browser, sandboxed)
//   - src/logic-functions/*.logic-function.ts        (server routes)
// so the wire format, validation rules, and money math can never drift.
// It must stay dependency-free and side-effect-free (unit-tested in
// src/__tests__/daily-entry.test.ts).

// ───────────────────────────── Limits ─────────────────────────────

export const MAX_ENTRIES_PER_BATCH = 100;
/** Per-gift cap; micros with 6 decimals (Twenty CURRENCY convention). */
export const MAX_AMOUNT_MICROS = 1_000_000_000_000n; // $1,000,000.00
/** Post-dated checks allowed up to this many days ahead. */
export const MAX_FUTURE_DAYS = 31;
/** Earliest gift date accepted by the entry form (historical backfill). */
export const MIN_GIFT_YEAR = 2000;

// ─────────────────────── Payment methods ──────────────────────────
// Mirrors the live donation.paymentMethod SELECT options exactly
// (verified against workspace metadata). Order drives UI display.

export type PaymentMethodValue =
  | 'CHECK'
  | 'CREDIT_CARD'
  | 'ACH'
  | 'WIRE'
  | 'STOCK'
  | 'CASH'
  | 'IN_KIND'
  | 'OTHER';

export type GiftEntryMode = 'DAILY_GIVING' | 'CASH_DEPOSIT' | 'ONLINE_GIFT';

export const PAYMENT_METHODS: ReadonlyArray<{
  value: PaymentMethodValue;
  label: string;
  /** In-kind gifts carry a goods description instead of a check number. */
  isInKind: boolean;
}> = [
  { value: 'CHECK', label: 'Check', isInKind: false },
  { value: 'CREDIT_CARD', label: 'Credit Card', isInKind: false },
  { value: 'ACH', label: 'ACH', isInKind: false },
  { value: 'WIRE', label: 'Wire', isInKind: false },
  { value: 'STOCK', label: 'Stock / Securities', isInKind: false },
  { value: 'CASH', label: 'Cash', isInKind: false },
  { value: 'IN_KIND', label: 'In-Kind (goods & services)', isInKind: true },
  { value: 'OTHER', label: 'Other', isInKind: false },
];

export const PAYMENT_METHOD_VALUES: ReadonlySet<string> = new Set(
  PAYMENT_METHODS.map((m) => m.value),
);

export const paymentMethodLabel = (value: string): string =>
  PAYMENT_METHODS.find((m) => m.value === value)?.label ?? value;

export const isPaymentMethod = (value: unknown): value is PaymentMethodValue =>
  typeof value === 'string' && PAYMENT_METHOD_VALUES.has(value);

// ─────────────────────────── Wire types ───────────────────────────

/**
 * One line of a daily entry batch. `entryKey` is generated client-side per
 * row (UUID v4) and stored on donation.externalTransactionId as
 * `dailyentry:<uuid>` — resubmitting the same batch is a no-op, not a
 * duplicate gift.
 */
export interface DailyEntryInput {
  entryKey?: unknown;
  entryMode?: unknown;
  /** yyyy-mm-dd */
  giftDate?: unknown;
  amountUsd?: unknown;
  paymentMethod?: unknown;
  personId?: unknown;
  companyId?: unknown;
  fundId?: unknown;
  fundraisingCampaignId?: unknown;
  checkNumber?: unknown;
  inKindDescription?: unknown;
  depositDate?: unknown;
  onlineTransactionId?: unknown;
  tributeType?: unknown;
  tributeName?: unknown;
  doNotAcknowledge?: unknown;
}

export type EntryStatus = 'created' | 'duplicate' | 'error';

export interface EntryResult {
  entryKey: string;
  status: EntryStatus;
  donationId?: string;
  message?: string;
}

export interface BatchResponse {
  results: EntryResult[];
  summary: {
    received: number;
    created: number;
    duplicates: number;
    errors: number;
    totalCreatedAmountMicros: string;
    createdGiftDate: string | null;
  };
}

export interface DailyGiftDonorSource {
  company?: { name?: string | null } | null;
  donationCredits?: {
    edges?: Array<{
      node?: {
        person?: {
          name?: {
            firstName?: string | null;
            lastName?: string | null;
          } | null;
        } | null;
      } | null;
    }>;
  } | null;
}

export const dailyGiftDonorLabel = (
  gift: DailyGiftDonorSource,
): string => {
  const people = (gift.donationCredits?.edges ?? [])
    .map(({ node }) =>
      [node?.person?.name?.firstName, node?.person?.name?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim(),
    )
    .filter(Boolean);

  if (people.length > 0) return people.join(', ');

  const companyName = gift.company?.name?.trim();
  return companyName || 'Unknown donor';
};

// ───────────────────────── Money helpers ──────────────────────────

/**
 * Parses a user-typed dollar amount into Twenty currency micros ("12.5" →
 * "12500000"). Accepts "$1,234.56" style input. Returns undefined when the
 * text is not a positive amount.
 */
export const parseAmountToMicros = (raw: unknown): bigint | undefined => {
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
  const text = String(raw).trim().replace(/^[$\s]+/, '').replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return undefined;
  const negativeOrZero = /^0*(\.0*)?$/.test(text);
  if (negativeOrZero) return undefined;
  try {
    const [whole, frac = ''] = text.split('.');
    return BigInt(whole) * 1_000_000n + BigInt((frac + '00').slice(0, 2)) * 10_000n;
  } catch {
    return undefined;
  }
};

/** "12500000" → "$12.50" (whole-dollar amounts print without cents). */
export const formatMicrosToUsd = (micros: string | bigint): string => {
  const value = BigInt(micros);
  const cents = value < 0n ? -value : value;
  const dollars = cents / 1_000_000n;
  const remainder = (cents % 1_000_000n).toString().padStart(6, '0');
  const whole = dollars.toLocaleString('en-US');
  if (remainder === '000000') return `${value < 0n ? '-' : ''}$${whole}`;
  const twoCents = remainder.slice(0, 2);
  return `${value < 0n ? '-' : ''}$${whole}.${twoCents}${remainder.slice(2) === '0000' ? '' : remainder.slice(2)}`;
};

// ───────────────────────── Date helpers ───────────────────────────

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const isValidDateString = (value: unknown): value is string => {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value;
};

/** Local-timezone today as yyyy-mm-dd (the staff member's "today"). */
export const todayLocalDateString = (now = new Date()): string => {
  const offsetMs = now.getTime() - now.getTimezoneOffset() * 60_000;
  return new Date(offsetMs).toISOString().slice(0, 10);
};

export const daysBetweenInDays = (fromIso: string, toIso: string): number =>
  Math.round(
    (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) /
      86_400_000,
  );

// ───────────────────── Idempotency keys ───────────────────────────

export const ENTRY_KEY_PREFIX = 'dailyentry:';
export const ENTRY_KEY_PATTERN = /^dailyentry:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const buildEntryKey = (clientKey: unknown): string | undefined => {
  if (
    typeof clientKey === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientKey)
  ) {
    return `${ENTRY_KEY_PREFIX}${clientKey.toLowerCase()}`;
  }
  return undefined;
};

// ─────────────────────── Entry validation ─────────────────────────

export interface NormalizedEntry {
  entryKey: string;
  entryMode: GiftEntryMode;
  giftDate: string;
  amountMicros: string;
  paymentMethod: PaymentMethodValue;
  personId?: string;
  companyId?: string;
  fundId?: string;
  fundraisingCampaignId?: string;
  checkNumber?: string;
  inKindDescription?: string;
  depositDate?: string;
  onlineTransactionId?: string;
  tributeType?: 'NONE' | 'IN_MEMORY' | 'IN_HONOR';
  tributeName?: string;
  acknowledgmentStatus: 'PENDING' | 'DO_NOT_ACKNOWLEDGE';
  /** Auto-generated record label shown in tables and searches. */
  name: string;
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const optionalUuid = (value: unknown): string | undefined =>
  typeof value === 'string' && UUID_V4.test(value) ? value : undefined;

const optionalTrimmed = (value: unknown, max: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
};

const TRIBUTE_VALUES = new Set(['NONE', 'IN_MEMORY', 'IN_HONOR']);
const ENTRY_MODES = new Set<GiftEntryMode>([
  'DAILY_GIVING',
  'CASH_DEPOSIT',
  'ONLINE_GIFT',
]);
const ONLINE_PAYMENT_METHODS = new Set<PaymentMethodValue>([
  'CREDIT_CARD',
  'ACH',
]);

/** Thrown by inline validators inside normalizeEntry and converted to a
 *  per-row error result; never escapes the module. */
class ValidationError extends Error {}

/**
 * Validates one raw entry against every business rule. Returns either a
 * normalized entry or a human-readable error. `todayIso` is injected so
 * tests are deterministic.
 */
export const normalizeEntry = (
  raw: DailyEntryInput,
  todayIso: string,
): { ok: true; entry: NormalizedEntry } | { ok: false; error: string } => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'entry must be an object' };
  }

  const entryKey = buildEntryKey(raw.entryKey);
  if (!entryKey) {
    return { ok: false, error: 'entryKey is missing or not a UUID v4' };
  }

  if (!isValidDateString(raw.giftDate)) {
    return { ok: false, error: 'giftDate must be a valid date (yyyy-mm-dd)' };
  }
  const ageDays = daysBetweenInDays(raw.giftDate, todayIso);
  if (ageDays < -MAX_FUTURE_DAYS) {
    return {
      ok: false,
      error: `giftDate is more than ${MAX_FUTURE_DAYS} days in the future`,
    };
  }
  const minYear = `${MIN_GIFT_YEAR}-01-01`;
  if (raw.giftDate < minYear) {
    return { ok: false, error: `giftDate cannot be before ${MIN_GIFT_YEAR}` };
  }

  const amountMicros = parseAmountToMicros(raw.amountUsd);
  if (amountMicros === undefined) {
    return { ok: false, error: 'amountUsd must be a positive dollar amount' };
  }
  if (amountMicros > MAX_AMOUNT_MICROS) {
    return { ok: false, error: 'amountUsd exceeds the single-gift limit' };
  }

  if (!isPaymentMethod(raw.paymentMethod)) {
    return { ok: false, error: 'paymentMethod is not a known income stream' };
  }
  const method = raw.paymentMethod;

  const entryMode =
    raw.entryMode === undefined || raw.entryMode === null || raw.entryMode === ''
      ? 'DAILY_GIVING'
      : raw.entryMode;
  if (typeof entryMode !== 'string' || !ENTRY_MODES.has(entryMode as GiftEntryMode)) {
    return { ok: false, error: 'entryMode is not recognized' };
  }
  const normalizedMode = entryMode as GiftEntryMode;

  const personId = optionalUuid(raw.personId);
  const companyId = optionalUuid(raw.companyId);
  if (!personId && !companyId) {
    return { ok: false, error: 'choose a donor (person or organization)' };
  }
  if (personId && companyId) {
    return { ok: false, error: 'choose either a person or an organization, not both' };
  }

  const inKind = PAYMENT_METHODS.find((m) => m.value === method)!.isInKind;
  const inKindDescription = optionalTrimmed(raw.inKindDescription, 500);
  if (inKind && !inKindDescription) {
    return { ok: false, error: 'in-kind gifts need a description of the goods' };
  }
  if (!inKind && inKindDescription) {
    return { ok: false, error: 'inKindDescription only applies to IN_KIND gifts' };
  }

  const checkNumber = optionalTrimmed(raw.checkNumber, 40);
  if (method === 'CHECK' && !checkNumber) {
    return { ok: false, error: 'checks need a check number' };
  }
  if (method !== 'CHECK' && checkNumber) {
    return { ok: false, error: 'checkNumber only applies to CHECK gifts' };
  }

  let depositDate: string | undefined;
  if (raw.depositDate !== undefined && raw.depositDate !== null && raw.depositDate !== '') {
    if (!isValidDateString(raw.depositDate)) {
      return { ok: false, error: 'depositDate must be a valid date (yyyy-mm-dd)' };
    }
    depositDate = raw.depositDate;
  }

  const onlineTransactionId = optionalTrimmed(raw.onlineTransactionId, 121);
  if (
    typeof raw.onlineTransactionId === 'string' &&
    raw.onlineTransactionId.trim().length > 120
  ) {
    return { ok: false, error: 'onlineTransactionId cannot exceed 120 characters' };
  }
  if (onlineTransactionId && /[\u0000-\u001f\u007f]/.test(onlineTransactionId)) {
    return { ok: false, error: 'onlineTransactionId contains unsupported characters' };
  }

  if (normalizedMode === 'CASH_DEPOSIT') {
    if (method !== 'CASH') {
      return { ok: false, error: 'cash deposits must use the CASH payment method' };
    }
    if (!depositDate) {
      return { ok: false, error: 'cash deposits need a depositDate' };
    }
    if (depositDate < raw.giftDate) {
      return { ok: false, error: 'depositDate cannot be before giftDate' };
    }
    if (depositDate > todayIso) {
      return { ok: false, error: 'depositDate cannot be in the future' };
    }
    if (onlineTransactionId) {
      return { ok: false, error: 'onlineTransactionId only applies to online gifts' };
    }
  } else if (normalizedMode === 'ONLINE_GIFT') {
    if (!ONLINE_PAYMENT_METHODS.has(method)) {
      return {
        ok: false,
        error: 'online gifts must use CREDIT_CARD or ACH',
      };
    }
    if (!onlineTransactionId) {
      return { ok: false, error: 'online gifts need an onlineTransactionId' };
    }
  } else if (onlineTransactionId) {
    return { ok: false, error: 'onlineTransactionId only applies to online gifts' };
  }

  // Optional reference fields: present-but-invalid values are rejected, not
  // dropped — a silently dropped fund would misattribute the gift.
  const strictOptionalUuid = (value: unknown, label: string): string | undefined => {
    if (value === undefined || value === null || value === '') return undefined;
    const asString = typeof value === 'string' ? value : String(value);
    if (!UUID_V4.test(asString)) {
      throw new ValidationError(`${label} must be a valid id`);
    }
    return asString;
  };

  let fundId: string | undefined;
  let fundraisingCampaignId: string | undefined;
  try {
    fundId = strictOptionalUuid(raw.fundId, 'fundId');
    fundraisingCampaignId = strictOptionalUuid(
      raw.fundraisingCampaignId,
      'fundraisingCampaignId',
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  let tributeType: NormalizedEntry['tributeType'];
  if (raw.tributeType === undefined || raw.tributeType === null || raw.tributeType === '') {
    tributeType = 'NONE';
  } else if (typeof raw.tributeType === 'string' && TRIBUTE_VALUES.has(raw.tributeType)) {
    tributeType = raw.tributeType as NormalizedEntry['tributeType'];
  } else {
    return { ok: false, error: 'tributeType must be NONE, IN_MEMORY or IN_HONOR' };
  }
  const tributeName = optionalTrimmed(raw.tributeName, 200);
  if (tributeType && tributeType !== 'NONE' && !tributeName) {
    return { ok: false, error: 'honoree name required for tribute gifts' };
  }

  const donorLabel = personId ? 'Donor gift' : 'Organization gift';

  return {
    ok: true,
    entry: {
      entryKey,
      entryMode: normalizedMode,
      giftDate: raw.giftDate,
      amountMicros: amountMicros.toString(),
      paymentMethod: method,
      personId,
      companyId,
      fundId,
      fundraisingCampaignId,
      checkNumber,
      inKindDescription,
      depositDate,
      onlineTransactionId,
      tributeType,
      tributeName,
      acknowledgmentStatus:
        raw.doNotAcknowledge === true ? 'DO_NOT_ACKNOWLEDGE' : 'PENDING',
      name: inKind
        ? `In-kind: ${inKindDescription!.slice(0, 80)}`
        : normalizedMode === 'CASH_DEPOSIT'
          ? `Cash deposit ${donorLabel.toLowerCase()}`
          : normalizedMode === 'ONLINE_GIFT'
            ? `Online ${paymentMethodLabel(method).toLowerCase()} ${donorLabel.toLowerCase()}`
            : `${paymentMethodLabel(method)} ${donorLabel.toLowerCase()}`,
    },
  };
};

// ───────────────── GraphQL write-variable builders ────────────────
// The app-scoped schema omits workspace custom objects, so server code
// sends raw GraphQL strings. These builders produce the `data` objects for
// createDonation / createDonationCredit mutations.

export const buildDonationCreateVariables = (
  entry: NormalizedEntry,
): Record<string, unknown> => {
  const data: Record<string, unknown> = {
    name: entry.name,
    amount: { amountMicros: entry.amountMicros, currencyCode: 'USD' },
    giftDate: entry.giftDate,
    paymentMethod: entry.paymentMethod,
    externalTransactionId: entry.entryKey,
    acknowledgmentStatus: entry.acknowledgmentStatus,
    statementIncluded: true,
    goodsOrServicesProvided: Boolean(entry.inKindDescription),
    tributeType: entry.tributeType ?? 'NONE',
  };
  if (entry.depositDate) data.depositDate = entry.depositDate;
  if (entry.onlineTransactionId) {
    data.onlineTransactionId = entry.onlineTransactionId;
  }
  if (entry.checkNumber) data.checkNumber = entry.checkNumber;
  if (entry.inKindDescription) data.inKindDescription = entry.inKindDescription;
  if (entry.tributeName) data.tributeName = entry.tributeName;
  if (entry.companyId) data.companyId = entry.companyId;
  if (entry.fundId) data.fundId = entry.fundId;
  if (entry.fundraisingCampaignId) data.fundraisingCampaignId = entry.fundraisingCampaignId;
  return { data };
};

export const buildHardCreditCreateVariables = (
  entry: NormalizedEntry,
  donationId: string,
): Record<string, unknown> => ({
  data: {
    name: `Hard credit — ${entry.name}`.slice(0, 120),
    creditType: 'HARD',
    creditRole: 'DONOR',
    creditAmount: { amountMicros: entry.amountMicros, currencyCode: 'USD' },
    includeInStatement: true,
    thanked: false,
    donationId,
    ...(entry.personId ? { personId: entry.personId } : {}),
  },
});
