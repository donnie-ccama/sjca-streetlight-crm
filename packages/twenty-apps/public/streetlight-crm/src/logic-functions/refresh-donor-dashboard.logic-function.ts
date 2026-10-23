import { defineLogicFunction } from 'twenty-sdk/define';

import { rawMutation, rawQuery } from 'src/logic-functions/workspace-gql';

// Donor Dashboard refresh — computes all dashboard metrics server-side and
// writes them into provisioned snapshot records that native record-table
// widgets display. Native widgets cannot compute aggregates themselves, so
// this cron is their data path. (App front components CAN call the API via
// the host-proxied SDK clients; see export-dashboard-report for an example.)
//
// Refresh cadence: hourly at :15. Also exposed as a manual workflow action.
//
// All data access goes through workspace-gql raw requests: donations,
// dashboardSnapshots, monthlyGivingPoints and the custom person fields are
// workspace-owned and rejected by the generated client's runtime validation.

const PAGE_SIZE = 200;
// Cloud workspaces meter mutations in compute tokens (~100/min). Small batches
// with a pause between them keep the hourly sweep well under the cap.
const PATCH_BATCH = 20;
const PATCH_BATCH_PAUSE_MS = 15_000;

const money = (micros: bigint) => ({
  amountMicros: micros.toString(),
  currencyCode: 'USD',
});

async function pageAll(
  rootKey: string,
  selection: Record<string, unknown>,
  extraArgs: Record<string, unknown> = {},
): Promise<any[]> {
  const rows: any[] = [];
  let after: string | undefined;
  for (;;) {
    const args: Record<string, unknown> = {
      first: PAGE_SIZE,
      ...(after ? { after } : {}),
      ...extraArgs,
    };
    const res = await rawQuery({ [rootKey]: { __args: args, ...selection } });
    const conn = res?.[rootKey];
    for (const edge of conn?.edges ?? []) rows.push(edge.node);
    if (!conn?.pageInfo?.hasNextPage) break;
    after = conn?.pageInfo?.endCursor;
    if (!after) break;
  }
  return rows;
}

async function upsertByUniqueField(
  plural: string,
  createMutation: string,
  updateMutation: string,
  keyField: string,
  keyValue: string,
  data: Record<string, unknown>,
): Promise<'created' | 'updated'> {
  const findRes = await rawQuery({
    [plural]: {
      __args: { filter: { [keyField]: { eq: keyValue } }, first: 1 },
      edges: { node: { id: true } },
    },
  });
  const existingId = findRes?.[plural]?.edges?.[0]?.node?.id;
  if (existingId) {
    await rawMutation({
      [updateMutation]: { __args: { id: existingId, data }, id: true },
    });
    return 'updated';
  }
  await rawMutation({
    [createMutation]: { __args: { data: { [keyField]: keyValue, ...data } }, id: true },
  });
  return 'created';
}

const handler = async () => {
  const year = new Date().getFullYear();
  const ninetyDaysAgo = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);

  // ── Pull donations (YTD) and people ────────────────────────────────
  const donations = await pageAll('donations', {
    edges: {
      node: {
        id: true,
        amount: { amountMicros: true },
        giftDate: true,
        company: { id: true },
        donationCredits: { edges: { node: { person: { id: true } } } },
      },
    },
    pageInfo: { hasNextPage: true, endCursor: true },
  }, { filter: { giftDate: { gte: `${year}-01-01` } } });

  const people = await pageAll('people', {
    edges: {
      node: {
        id: true,
        isLapsed90d: true,
        lastGiftDate: true,
      },
    },
    pageInfo: { hasNextPage: true, endCursor: true },
  });

  if (!donations.length && !people.length) {
    return { skipped: true, reason: 'no donations or people found' };
  }

  // ── Aggregate YTD giving ───────────────────────────────────────────
  const individualDonors = new Set<string>();
  const companyDonors = new Set<string>();
  const activeDonors = new Set<string>();
  const monthAgg = new Map<string, { micros: bigint; gifts: number; donors: Set<string> }>();
  let totalMicros = 0n;

  for (const d of donations) {
    const micros = BigInt(d?.amount?.amountMicros ?? '0');
    totalMicros += micros;

    const creditPersonIds = (d?.donationCredits?.edges ?? [])
      .map((e: any) => e?.node?.person?.id)
      .filter(Boolean);

    for (const pid of creditPersonIds) individualDonors.add(pid);
    if (d?.company?.id) companyDonors.add(d.company.id);

    const ym = String(d?.giftDate ?? '').slice(0, 7);
    if (ym) {
      const agg = monthAgg.get(ym) ?? { micros: 0n, gifts: 0, donors: new Set<string>() };
      agg.micros += micros;
      agg.gifts += 1;
      for (const pid of creditPersonIds) agg.donors.add(pid);
      if (d?.company?.id) agg.donors.add(`c:${d.company.id}`);
      monthAgg.set(ym, agg);
    }

    if (d?.giftDate && d.giftDate >= ninetyDaysAgo) {
      for (const pid of creditPersonIds) activeDonors.add(pid);
      if (d?.company?.id) activeDonors.add(`c:${d.company.id}`);
    }
  }

  const donationCount = donations.length || 1;
  const avgMicros = totalMicros / BigInt(donationCount);

  // Lapsed individuals = people with a lastGiftDate older than the cutoff
  let lapsedCount = 0;

  // ── Maintain person.isLapsed90d flags (SELECT 'TRUE'/'FALSE'; patch only diffs) ──
  const flagDiffs: { id: string; desired: 'TRUE' | 'FALSE' }[] = [];
  for (const p of people) {
    const lastGift: string | null = p?.lastGiftDate ?? null;
    const isLapsed = Boolean(lastGift && lastGift < ninetyDaysAgo);
    if (isLapsed) lapsedCount += 1;
    const desired: 'TRUE' | 'FALSE' = isLapsed ? 'TRUE' : 'FALSE';
    if (p?.isLapsed90d !== desired) flagDiffs.push({ id: p.id, desired });
  }

  let flagsPatched = 0;
  for (let i = 0; i < flagDiffs.length; i += PATCH_BATCH) {
    const batch = flagDiffs.slice(i, i + PATCH_BATCH);
    await Promise.all(
      batch.map(({ id, desired }) =>
        rawMutation({
          updatePerson: { __args: { id, data: { isLapsed90d: desired } }, id: true },
        }),
      ),
    );
    flagsPatched += batch.length;
    if (i + PATCH_BATCH < flagDiffs.length) {
      await new Promise((resolve) => setTimeout(resolve, PATCH_BATCH_PAUSE_MS));
    }
  }

  // ── Upsert the singleton KPI snapshot ──────────────────────────────
  await upsertByUniqueField(
    'dashboardSnapshots',
    'createDashboardSnapshot',
    'updateDashboardSnapshot',
    'snapshotKey',
    'CURRENT',
    {
      computedAt: new Date().toISOString(),
      ytdDonors: individualDonors.size + companyDonors.size,
      individualDonorsYtd: individualDonors.size,
      companyDonorsYtd: companyDonors.size,
      activeDonors90d: activeDonors.size,
      lapsedDonorCount: lapsedCount,
      ytdGiving: money(totalMicros),
      avgGift: money(avgMicros),
    },
  );

  // ── Upsert 12 monthly rows for the current year ────────────────────
  let monthsWritten = 0;
  for (let m = 1; m <= 12; m++) {
    const ym = `${year}-${String(m).padStart(2, '0')}`;
    const agg = monthAgg.get(ym);
    await upsertByUniqueField(
      'monthlyGivingPoints',
      'createMonthlyGivingPoint',
      'updateMonthlyGivingPoint',
      'periodLabel',
      ym,
      {
        sortKey: year * 100 + m,
        totalAmount: money(agg?.micros ?? 0n),
        giftCount: agg?.gifts ?? 0,
        donorCount: agg?.donors.size ?? 0,
      },
    );
    monthsWritten += 1;
  }

  return {
    donationsProcessed: donations.length,
    peopleConsidered: people.length,
    ytdDonors: individualDonors.size + companyDonors.size,
    individualDonorsYtd: individualDonors.size,
    companyDonorsYtd: companyDonors.size,
    activeDonors90d: activeDonors.size,
    lapsedDonors: lapsedCount,
    ytdGivingMicros: totalMicros.toString(),
    flagsPatched,
    monthsWritten,
    computedAt: new Date().toISOString(),
  };
};

export default defineLogicFunction({
  universalIdentifier: '7c2d9e4a-8b31-4f6a-9d25-e1a7c3f84b52',
  name: 'refresh-donor-dashboard',
  description:
    'Recomputes Donor Dashboard metrics (YTD donors incl. companies, monthly breakdown, lapsed flags) into dashboardSnapshot/monthlyGivingPoint rows shown by native dashboard widgets. Hourly cron; also runnable manually.',
  timeoutSeconds: 300,
  handler,
  cronTriggerSettings: {
    pattern: '15 * * * *',
  },
  workflowActionTriggerSettings: {
    label: 'Refresh Donor Dashboard',
    icon: 'IconLayoutDashboard',
  },
});
