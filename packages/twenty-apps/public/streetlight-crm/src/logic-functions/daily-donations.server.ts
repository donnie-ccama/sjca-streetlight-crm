// Server-side core shared by the Daily Giving HTTP routes
// (create-daily-donations + get-daily-giving-context). Kept separate from
// the defineLogicFunction wrappers so the route files stay thin.
//
// Raw GraphQL over fetch, mirroring export-dashboard-report: the generated
// CoreApiClient schema omits workspace-owned custom objects (donations,
// funds, fundraisingCampaigns), so typed queries reject those fields.
// Mutation variable typing ($data: CreateDonationInput!) follows the exact
// pattern proven against this workspace by scripts/bootstrap-dashboard.py.

import {
  buildDonationCreateVariables,
  buildHardCreditCreateVariables,
  isValidDateString,
  MAX_ENTRIES_PER_BATCH,
  normalizeEntry,
  todayLocalDateString,
  type BatchResponse,
  type DailyEntryInput,
  type NormalizedEntry,
} from 'src/shared/daily-entry-specs';
import { gql } from 'src/logic-functions/workspace-gql';

const PAGE_SIZE = 100;

const DONATION_FIELDS = `
  id
  name
  amount { amountMicros currencyCode }
  giftDate
  depositDate
  paymentMethod
  checkNumber
  inKindDescription
  acknowledgmentStatus
  externalTransactionId
  onlineTransactionId
  fund { id name }
  fundraisingCampaign { id name }
  company { id name }
  donationCredits(filter: {creditType: {eq: HARD}}) {
    edges { node { id person { id name { firstName lastName } } } }
  }
`;

// ───────────────────────── POST: create ───────────────────────────

interface CreateOutcome {
  status: 'created' | 'duplicate' | 'error';
  donationId?: string;
  message?: string;
}

const findExistingEntry = async (
  entry: NormalizedEntry,
): Promise<string | undefined> => {
  // JSON string encoding makes both values safe GraphQL string literals.
  // Online gifts check the processor reference as well as the client retry
  // key, preventing a second browser session from re-recording a transaction.
  const filters = [
    `{externalTransactionId: {eq: ${JSON.stringify(entry.entryKey)}}}`,
    ...(entry.onlineTransactionId
      ? [
          `{onlineTransactionId: {eq: ${JSON.stringify(
            entry.onlineTransactionId,
          )}}}`,
        ]
      : []),
  ];
  const data = await gql(
    `query {
      donations(filter: {or: [${filters.join(', ')}]}, first: 1) {
        edges { node { id } }
      }
    }`,
  );
  return data.donations?.edges?.[0]?.node?.id;
};

const createOneEntry = async (
  entry: NormalizedEntry,
): Promise<CreateOutcome> => {
  // Idempotency: the client-generated entry key is stored on the donation,
  // so resubmitting a batch can never double-count a gift.
  const existing = await findExistingEntry(entry);
  if (existing) {
    return { status: 'duplicate', donationId: existing };
  }

  const createData = await gql(
    `mutation ($data: CreateDonationInput!) {
      createDonation(data: $data) { id }
    }`,
    buildDonationCreateVariables(entry),
  );
  const donationId: string | undefined = createData.createDonation?.id;
  if (!donationId) {
    throw new Error('createDonation returned no id');
  }

  // Individual donors are credited via a HARD DonationCredit (NPSP OCR
  // pattern); organization donors use the company relation only. The
  // existing donationCredit.created DB event refreshes Person rollups, so
  // no rollup math is needed here.
  if (entry.personId) {
    await gql(
      `mutation ($data: CreateDonationCreditInput!) {
        createDonationCredit(data: $data) { id }
      }`,
      buildHardCreditCreateVariables(entry, donationId),
    );
  }

  return { status: 'created', donationId };
};

/**
 * Validates and applies a batch. Partial success semantics: valid rows are
 * created even when siblings fail; every row reports its own outcome.
 */
export const processBatch = async (
  rawEntries: unknown,
  todayIso: string,
): Promise<BatchResponse> => {
  if (!Array.isArray(rawEntries)) {
    throw new BadRequestError('body.entries must be an array');
  }
  if (rawEntries.length === 0) {
    throw new BadRequestError('body.entries must contain at least one entry');
  }
  if (rawEntries.length > MAX_ENTRIES_PER_BATCH) {
    throw new BadRequestError(
      `batches are limited to ${MAX_ENTRIES_PER_BATCH} entries per submission`,
    );
  }

  const normalized: Array<{
    index: number;
    entry?: NormalizedEntry;
    error?: string;
  }> = rawEntries.map((raw, index) => {
    const outcome = normalizeEntry(raw as DailyEntryInput, todayIso);
    return outcome.ok
      ? { index, entry: outcome.entry }
      : { index, error: outcome.error };
  });

  const results: BatchResponse['results'] = [];
  for (const item of normalized) {
    if (!item.entry) {
      results.push({
        entryKey: `row-${item.index}`,
        status: 'error',
        message: item.error,
      });
      continue;
    }
    try {
      const outcome = await createOneEntry(item.entry);
      results.push({
        entryKey: item.entry.entryKey,
        status: outcome.status,
        donationId: outcome.donationId,
      });
    } catch (error) {
      results.push({
        entryKey: item.entry.entryKey,
        status: 'error',
        message: error instanceof Error ? error.message : 'unknown failure',
      });
    }
  }

  let totalCreatedMicros = 0n;
  let createdGiftDate: string | null = null;
  const summary = {
    received: rawEntries.length,
    created: 0,
    duplicates: 0,
    errors: 0,
  };
  for (let i = 0; i < results.length; i += 1) {
    const result = results[i];
    if (result.status === 'created') summary.created += 1;
    else if (result.status === 'duplicate') summary.duplicates += 1;
    else summary.errors += 1;
    if (result.status === 'created') {
      const entry = normalized[i].entry!;
      totalCreatedMicros += BigInt(entry.amountMicros);
      createdGiftDate = createdGiftDate ?? entry.giftDate;
    }
  }

  return {
    results,
    summary: {
      ...summary,
      totalCreatedAmountMicros: totalCreatedMicros.toString(),
      createdGiftDate,
    },
  };
};

export class BadRequestError extends Error {}

// ───────────────────── GET: context & day view ────────────────────

export interface DailyGivingContextPayload {
  today: string;
  funds: Array<{ id: string; name: string; isRestricted?: boolean | null }>;
  campaigns: Array<{ id: string; name: string; status?: string | null }>;
  day: {
    date: string;
    totals: {
      giftCount: number;
      amountMicros: string;
      inKindCount: number;
      byMethod: Record<string, { count: number; amountMicros: string }>;
    };
    entries: Array<Record<string, unknown>>;
  };
}

export const resolveContextDate = (rawDate: unknown): string => {
  if (typeof rawDate === 'string' && isValidDateString(rawDate)) {
    return rawDate;
  }
  return todayLocalDateString();
};

const sumDayTotals = (
  nodes: any[],
): DailyGivingContextPayload['day']['totals'] => {
  const totals = {
    giftCount: 0,
    amountMicros: 0n,
    inKindCount: 0,
    byMethod: {} as Record<string, { count: number; amountMicros: string }>,
  };
  for (const node of nodes) {
    totals.giftCount += 1;
    const micros = BigInt(node.amount?.amountMicros ?? '0');
    totals.amountMicros += micros;
    const method: string = node.paymentMethod ?? 'OTHER';
    const bucket = totals.byMethod[method] ?? { count: 0, amountMicros: '0' };
    bucket.count += 1;
    bucket.amountMicros = (BigInt(bucket.amountMicros) + micros).toString();
    totals.byMethod[method] = bucket;
    if (method === 'IN_KIND') totals.inKindCount += 1;
  }
  return {
    giftCount: totals.giftCount,
    amountMicros: totals.amountMicros.toString(),
    inKindCount: totals.inKindCount,
    byMethod: totals.byMethod,
  };
};

export const buildDailyContext = async (
  dateIso: string,
): Promise<DailyGivingContextPayload> => {
  // All filters inline: values are server-validated UUIDs/dates/enums.
  const [fundsData, campaignsData, dayData] = await Promise.all([
    gql(
      `query {
        funds(first: ${PAGE_SIZE}, filter: {isActive: {eq: true}}, orderBy: [{position: AscNullsLast}]) {
          edges { node { id name isRestricted } }
        }
      }`,
    ),
    gql(
      `query {
        fundraisingCampaigns(first: ${PAGE_SIZE}, filter: {status: {in: [ACTIVE, PLANNED]}}, orderBy: [{position: AscNullsLast}]) {
          edges { node { id name status } }
        }
      }`,
    ),
    gql(
      `query {
        donations(filter: {giftDate: {eq: "${dateIso}"}}, first: 200, orderBy: [{createdAt: DescNullsLast}]) {
          edges { node { ${DONATION_FIELDS} } }
        }
      }`,
    ),
  ]);

  const entries = (dayData.donations?.edges ?? []).map((e: any) => e.node);

  return {
    today: todayLocalDateString(),
    funds: (fundsData.funds?.edges ?? []).map((e: any) => e.node),
    campaigns: (campaignsData.fundraisingCampaigns?.edges ?? []).map(
      (e: any) => e.node,
    ),
    day: {
      date: dateIso,
      totals: sumDayTotals(entries),
      entries,
    },
  };
};
