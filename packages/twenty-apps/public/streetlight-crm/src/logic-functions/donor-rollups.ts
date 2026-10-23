// Shared donor-rollup primitives used by both the nightly sweep
// (recompute-donor-rollups.logic-function.ts) and the real-time per-credit
// updater (update-donor-rollup-on-credit.logic-function.ts). Keeping the
// math here ensures both functions agree on how Person.lifetimeHardGiving,
// firstGiftDate, and lastGiftDate are derived from hard-credit DonationCredits.
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
};

export type Rollup = {
  lifetimeHardGivingMicros: bigint;
  currencyCode?: string;
  firstGiftDate?: string;
  lastGiftDate?: string;
  creditCount: number;
};

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

export const computeRollup = (rows: CreditRow[]): Rollup => {
  const rollup: Rollup = {
    lifetimeHardGivingMicros: 0n,
    currencyCode: undefined,
    firstGiftDate: undefined,
    lastGiftDate: undefined,
    creditCount: 0,
  };
  for (const row of rows) {
    rollup.lifetimeHardGivingMicros += BigInt(row.amountMicros || '0');
    if (row.currencyCode && !rollup.currencyCode) {
      rollup.currencyCode = row.currencyCode;
    }
    rollup.firstGiftDate = minDate(rollup.firstGiftDate, row.giftDate);
    rollup.lastGiftDate = maxDate(rollup.lastGiftDate, row.giftDate);
    rollup.creditCount += 1;
  }
  return rollup;
};

const PAGE_SIZE = 500;

const CREDIT_PAGE_SELECTION = `
  edges { node { id creditAmount { amountMicros currencyCode } donation { giftDate } } }
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
          edges { node { id creditAmount { amountMicros currencyCode } person { id } donation { giftDate } } }
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
): Map<string, Rollup> => {
  const byPerson = new Map<string, Rollup>();
  for (const row of rows) {
    const existing = byPerson.get(row.personId);
    const rollup = existing
      ? {
          ...existing,
          lifetimeHardGivingMicros:
            existing.lifetimeHardGivingMicros + BigInt(row.amountMicros || '0'),
          currencyCode: existing.currencyCode ?? row.currencyCode,
          firstGiftDate: minDate(existing.firstGiftDate, row.giftDate),
          lastGiftDate: maxDate(existing.lastGiftDate, row.giftDate),
          creditCount: existing.creditCount + 1,
        }
      : {
          lifetimeHardGivingMicros: BigInt(row.amountMicros || '0'),
          currencyCode: row.currencyCode,
          firstGiftDate: row.giftDate,
          lastGiftDate: row.giftDate,
          creditCount: 1,
        };
    byPerson.set(row.personId, rollup);
  }
  return byPerson;
};

/**
 * Writes one Person's rollup fields. Raw mutation because lifetimeHardGiving
 * is a workspace-added custom field absent from the generated client schema.
 */
export const writePersonRollup = async (
  personId: string,
  rollup: Rollup,
): Promise<void> => {
  const data = await gql(
    `mutation {
      updatePerson(
        id: "${personId}",
        data: {
          lifetimeHardGiving: { amountMicros: "${rollup.lifetimeHardGivingMicros.toString()}", currencyCode: "${rollup.currencyCode ?? 'USD'}" },
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
