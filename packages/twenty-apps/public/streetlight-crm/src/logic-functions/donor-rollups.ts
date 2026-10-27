// Shared donor-rollup primitives used by both the nightly sweep
// (recompute-donor-rollups.logic-function.ts) and the real-time per-credit
// updater (update-donor-rollup-on-credit.logic-function.ts). Keeping the
// math here ensures both functions agree on how Person giving totals,
// gift dates, and gift count are derived from hard-credit DonationCredits.
//
// Data access goes through workspace-gql raw requests: the generated
// twenty-client-sdk validates queries against an app-scoped schema at
// RUNTIME and rejects workspace-owned objects like donationCredits.

import { gql } from 'src/logic-functions/workspace-gql';

export type CreditRow = {
  personId: string;
  amountMicros: string;
  currencyCode?: string;
  giftDate?: string;
  giftStatus?: string;
};

export type Rollup = {
  lifetimeHardGivingMicros: bigint;
  currencyCode?: string;
  firstGiftDate?: string;
  lastGiftDate?: string;
  lastGiftAmountMicros: bigint;
  largestGiftMicros: bigint;
  givingThisYearMicros: bigint;
  givingLastYearMicros: bigint;
  creditCount: number;
};

// Gifts imported before giftStatus existed have no status and count as paid.
const COUNTED_GIFT_STATUSES = new Set([undefined, null, 'PAID']);

export const minDate = (a?: string, b?: string): string | undefined => {
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
};

export const maxDate = (a?: string, b?: string): string | undefined => {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
};

const giftYear = (giftDate?: string): number | undefined =>
  giftDate ? Number(giftDate.slice(0, 4)) : undefined;

export const computeRollup = (
  rows: CreditRow[],
  currentYear: number = new Date().getUTCFullYear(),
): Rollup => {
  const rollup: Rollup = {
    lifetimeHardGivingMicros: 0n,
    currencyCode: undefined,
    firstGiftDate: undefined,
    lastGiftDate: undefined,
    lastGiftAmountMicros: 0n,
    largestGiftMicros: 0n,
    givingThisYearMicros: 0n,
    givingLastYearMicros: 0n,
    creditCount: 0,
  };
  for (const row of rows) {
    if (!COUNTED_GIFT_STATUSES.has(row.giftStatus)) continue;
    const amountMicros = BigInt(row.amountMicros || '0');
    rollup.lifetimeHardGivingMicros += amountMicros;
    if (row.currencyCode && !rollup.currencyCode) {
      rollup.currencyCode = row.currencyCode;
    }
    rollup.firstGiftDate = minDate(rollup.firstGiftDate, row.giftDate);
    if (row.giftDate && row.giftDate === rollup.lastGiftDate) {
      rollup.lastGiftAmountMicros += amountMicros;
    } else if (maxDate(rollup.lastGiftDate, row.giftDate) !== rollup.lastGiftDate) {
      rollup.lastGiftDate = row.giftDate;
      rollup.lastGiftAmountMicros = amountMicros;
    }
    if (amountMicros > rollup.largestGiftMicros) {
      rollup.largestGiftMicros = amountMicros;
    }
    const year = giftYear(row.giftDate);
    if (year === currentYear) rollup.givingThisYearMicros += amountMicros;
    if (year === currentYear - 1) rollup.givingLastYearMicros += amountMicros;
    rollup.creditCount += 1;
  }
  return rollup;
};

const PAGE_SIZE = 500;

const CREDIT_PAGE_SELECTION = `
  edges { node { id creditAmount { amountMicros currencyCode } donation { giftDate giftStatus } } }
  pageInfo { hasNextPage endCursor }
`;

/** Pages ALL hard-credit DonationCredit rows for one Person. */
export const fetchHardCreditsForPerson = async (
  personId: string,
): Promise<CreditRow[]> => {
  const rows: CreditRow[] = [];
  let after: string | undefined;

  for (;;) {
    const afterClause = after ? `, after: "${after}"` : '';
    // personId filter form verified against the live workspace; the relation
    // field itself does not accept {eq}.
    const data = await gql(
      `query {
        donationCredits(
          first: ${PAGE_SIZE}${afterClause},
          filter: {creditType: {eq: HARD}, personId: {eq: "${personId}"}}
        ) { ${CREDIT_PAGE_SELECTION} }
      }`,
    );
    const conn = data.donationCredits;
    for (const edge of conn?.edges ?? []) {
      const node = edge.node;
      rows.push({
        personId,
        amountMicros: node.creditAmount?.amountMicros ?? '0',
        currencyCode: node.creditAmount?.currencyCode,
        giftDate: node.donation?.giftDate,
        giftStatus: node.donation?.giftStatus,
      });
    }

    if (!conn?.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor ?? undefined;
    if (!after) break;
  }

  return rows;
};

/** Fetches EVERY hard-credit DonationCredit in the workspace. */
export const fetchAllHardCredits = async (): Promise<CreditRow[]> => {
  const rows: CreditRow[] = [];
  let after: string | undefined;

  for (;;) {
    const afterClause = after ? `, after: "${after}"` : '';
    const data = await gql(
      `query {
        donationCredits(first: ${PAGE_SIZE}${afterClause}, filter: {creditType: {eq: HARD}}) {
          edges { node { id creditAmount { amountMicros currencyCode } person { id } donation { giftDate giftStatus } } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
    );
    const conn = data.donationCredits;
    for (const edge of conn?.edges ?? []) {
      const node = edge.node;
      const personId = node.person?.id;
      if (!personId) continue; // skip orphan credits
      rows.push({
        personId,
        amountMicros: node.creditAmount?.amountMicros ?? '0',
        currencyCode: node.creditAmount?.currencyCode,
        giftDate: node.donation?.giftDate,
        giftStatus: node.donation?.giftStatus,
      });
    }

    if (!conn?.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor ?? undefined;
    if (!after) break;
  }

  return rows;
};

/** Groups flat credit rows into per-Person rollups. Used by the sweep. */
export const groupRollupsByPerson = (
  rows: CreditRow[],
  currentYear: number = new Date().getUTCFullYear(),
): Map<string, Rollup> => {
  const rowsByPerson = new Map<string, CreditRow[]>();
  for (const row of rows) {
    rowsByPerson.set(row.personId, [
      ...(rowsByPerson.get(row.personId) ?? []),
      row,
    ]);
  }
  const byPerson = new Map<string, Rollup>();
  for (const [personId, personRows] of rowsByPerson) {
    byPerson.set(personId, computeRollup(personRows, currentYear));
  }
  return byPerson;
};

const currencyInput = (amountMicros: bigint, currencyCode: string) =>
  `{ amountMicros: "${amountMicros.toString()}", currencyCode: "${currencyCode}" }`;

/**
 * Writes one Person's rollup fields. Raw mutation because lifetimeHardGiving
 * is a workspace-added custom field absent from the generated client schema.
 */
export const writePersonRollup = async (
  personId: string,
  rollup: Rollup,
): Promise<void> => {
  const currencyCode = rollup.currencyCode ?? 'USD';
  const data = await gql(
    `mutation {
      updatePerson(
        id: "${personId}",
        data: {
          lifetimeHardGiving: ${currencyInput(rollup.lifetimeHardGivingMicros, currencyCode)},
          lastGiftAmount: ${currencyInput(rollup.lastGiftAmountMicros, currencyCode)},
          largestGift: ${currencyInput(rollup.largestGiftMicros, currencyCode)},
          givingThisYear: ${currencyInput(rollup.givingThisYearMicros, currencyCode)},
          givingLastYear: ${currencyInput(rollup.givingLastYearMicros, currencyCode)},
          giftCount: ${rollup.creditCount},
          firstGiftDate: ${rollup.firstGiftDate ? `"${rollup.firstGiftDate}"` : 'null'},
          lastGiftDate: ${rollup.lastGiftDate ? `"${rollup.lastGiftDate}"` : 'null'}
        }
      ) { id }
    }`,
  );
  if (!data.updatePerson?.id) {
    throw new Error(`updatePerson returned no id for ${personId}`);
  }
};
