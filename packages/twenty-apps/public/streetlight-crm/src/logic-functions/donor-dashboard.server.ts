// Donor Dashboard queries shared by the CSV export route and the context
// route, so the page and its downloads never drift apart. Raw GraphQL over
// fetch: the generated client rejects workspace-owned objects (see
// workspace-gql.ts).

import { gql } from 'src/logic-functions/workspace-gql';
import {
  formatFullName,
  MAX_EXPORT_ROWS,
} from 'src/shared/dashboard-report-specs';
import {
  DASHBOARD_LIST_LIMIT,
  type DashboardSnapshot,
  type DonorDashboardContext,
  type MonthlyPoint,
  type PendingDonationRow,
  type PersonRow,
} from 'src/shared/donor-dashboard-specs';

const PAGE_SIZE = 200;

export type SnapshotNode = {
  ytdDonors?: number | null;
  ytdGiving?: { amountMicros?: string | null } | null;
  individualDonorsYtd?: number | null;
  companyDonorsYtd?: number | null;
  activeDonors90d?: number | null;
  avgGift?: { amountMicros?: string | null } | null;
  computedAt?: string | null;
};

export type MonthlyPointNode = {
  periodLabel?: string | null;
  sortKey?: number | null;
  totalAmount?: { amountMicros?: string | null } | null;
  giftCount?: number | null;
  donorCount?: number | null;
};

export type PersonNode = {
  id: string;
  name?: { firstName?: string | null; lastName?: string | null } | null;
  lastGiftDate?: string | null;
  lifetimeHardGiving?: { amountMicros?: string | null } | null;
  doNotSolicit?: boolean | null;
};

export type DonationCreditNode = {
  creditType?: string | null;
  person?: { name?: PersonNode['name'] } | null;
};

export type DonationNode = {
  id: string;
  name?: string | null;
  giftDate?: string | null;
  acknowledgmentStatus?: string | null;
  amount?: { amountMicros?: string | null } | null;
  company?: { name?: string | null } | null;
  donationCredits?: {
    edges?: ({ node?: DonationCreditNode | null } | null)[] | null;
  } | null;
};

type PageInfo = { hasNextPage?: boolean | null; endCursor?: string | null };
type Connection<TNode> = {
  edges?: ({ node?: TNode | null } | null)[] | null;
  pageInfo?: PageInfo | null;
};

const escapeInQuery = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

// Pages a connection until exhausted or the export row cap is reached.
const pageAll = async <TNode>(
  rootKey: string,
  nodeFields: string,
  firstPageArgs = '',
): Promise<TNode[]> => {
  const rows: TNode[] = [];
  let after: string | undefined;
  for (;;) {
    const pageArgs = [
      `first: ${PAGE_SIZE}`,
      after ? `after: "${escapeInQuery(after)}"` : null,
      firstPageArgs || null,
    ]
      .filter(Boolean)
      .join(', ');
    const data = await gql(
      `{ ${rootKey}(${pageArgs}) { edges { node { ${nodeFields} } } pageInfo { hasNextPage endCursor } } }`,
    );
    const connection = data?.[rootKey] as Connection<TNode> | undefined;
    for (const edge of connection?.edges ?? []) {
      if (edge?.node) rows.push(edge.node);
    }
    if (rows.length >= MAX_EXPORT_ROWS) break;
    const pageInfo = connection?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    after = pageInfo.endCursor;
  }
  return rows.slice(0, MAX_EXPORT_ROWS);
};

export const oldestDateFirst = (
  a: string | null | undefined,
  b: string | null | undefined,
): number => (a ?? '9999-12-31').localeCompare(b ?? '9999-12-31');

const PERSON_FIELDS = `
  id
  name { firstName lastName }
  lastGiftDate
  lifetimeHardGiving { amountMicros }
`;

const DONATION_FIELDS = `
  id name giftDate acknowledgmentStatus
  amount { amountMicros }
  company { name }
  donationCredits { edges { node { creditType person { name { firstName lastName } } } } }
`;

export const fetchSnapshot = async (): Promise<SnapshotNode | null> => {
  const data = await gql(
    `{ dashboardSnapshots(first: 1, filter: { snapshotKey: { eq: "CURRENT" } }) { edges { node {
      ytdDonors ytdGiving { amountMicros } individualDonorsYtd companyDonorsYtd
      activeDonors90d avgGift { amountMicros } computedAt
    } } } }`,
  );
  const connection = data?.dashboardSnapshots as Connection<SnapshotNode> | undefined;
  return connection?.edges?.[0]?.node ?? null;
};

export const fetchMonthlyPoints = async (): Promise<MonthlyPointNode[]> => {
  const points = await pageAll<MonthlyPointNode>(
    'monthlyGivingPoints',
    'periodLabel sortKey totalAmount { amountMicros } giftCount donorCount',
  );
  points.sort((a, b) => Number(b.sortKey ?? 0) - Number(a.sortKey ?? 0));
  return points;
};

export const fetchLapsedPeople = async (): Promise<PersonNode[]> => {
  const people = await pageAll<PersonNode>(
    'people',
    `${PERSON_FIELDS} doNotSolicit`,
    'filter: { isLapsed90d: { eq: "TRUE" } }',
  );
  people.sort((a, b) => oldestDateFirst(a.lastGiftDate, b.lastGiftDate));
  return people;
};

export const fetchTopDonors = async (): Promise<PersonNode[]> => {
  const people = await pageAll<PersonNode>('people', PERSON_FIELDS);
  people.sort(
    (a, b) =>
      Number(b.lifetimeHardGiving?.amountMicros ?? 0) -
      Number(a.lifetimeHardGiving?.amountMicros ?? 0),
  );
  return people;
};

export const fetchPendingAcknowledgments = async (): Promise<DonationNode[]> => {
  const donations = await pageAll<DonationNode>(
    'donations',
    DONATION_FIELDS,
    'filter: { acknowledgmentStatus: { eq: "PENDING" } }',
  );
  donations.sort((a, b) => oldestDateFirst(a.giftDate, b.giftDate));
  return donations;
};

type Preview<TNode> = { rows: TNode[]; totalCount: number };

// One sorted, limited query per list for the dashboard page. The CSV export
// keeps the paging fetchers above because it needs every row.
const fetchPreview = async <TNode>(
  rootKey: string,
  nodeFields: string,
  args: string,
): Promise<Preview<TNode>> => {
  const data = await gql(
    `{ ${rootKey}(first: ${DASHBOARD_LIST_LIMIT}, ${args}) { totalCount edges { node { ${nodeFields} } } } }`,
  );
  const connection = data?.[rootKey] as
    | (Connection<TNode> & { totalCount?: number | null })
    | undefined;
  const rows: TNode[] = [];
  for (const edge of connection?.edges ?? []) {
    if (edge?.node) rows.push(edge.node);
  }
  return { rows, totalCount: connection?.totalCount ?? rows.length };
};

export const fetchLapsedPreview = (): Promise<Preview<PersonNode>> =>
  fetchPreview<PersonNode>(
    'people',
    PERSON_FIELDS,
    'filter: { isLapsed90d: { eq: "TRUE" } }, orderBy: [{ lastGiftDate: AscNullsLast }]',
  );

export const fetchTopDonorsPreview = (): Promise<Preview<PersonNode>> =>
  fetchPreview<PersonNode>(
    'people',
    PERSON_FIELDS,
    'orderBy: [{ lifetimeHardGiving: { amountMicros: DescNullsLast } }]',
  );

export const fetchPendingAcknowledgmentsPreview = (): Promise<Preview<DonationNode>> =>
  fetchPreview<DonationNode>(
    'donations',
    DONATION_FIELDS,
    'filter: { acknowledgmentStatus: { eq: "PENDING" } }, orderBy: [{ giftDate: AscNullsLast }]',
  );

export const currentYearMonthly = (
  nodes: MonthlyPointNode[],
  year: number,
): MonthlyPoint[] =>
  nodes
    .map(toMonthlyPoint)
    .filter((point) => Math.floor(point.sortKey / 100) === year)
    .sort((a, b) => a.sortKey - b.sortKey);

export const toSnapshot = (node: SnapshotNode | null): DashboardSnapshot | null =>
  node
    ? {
        ytdDonors: node.ytdDonors ?? 0,
        ytdGivingMicros: node.ytdGiving?.amountMicros ?? '0',
        individualDonorsYtd: node.individualDonorsYtd ?? 0,
        companyDonorsYtd: node.companyDonorsYtd ?? 0,
        activeDonors90d: node.activeDonors90d ?? 0,
        avgGiftMicros: node.avgGift?.amountMicros ?? '0',
        computedAt: node.computedAt ?? '',
      }
    : null;

export const toMonthlyPoint = (node: MonthlyPointNode): MonthlyPoint => ({
  periodLabel: node.periodLabel ?? '',
  sortKey: Number(node.sortKey ?? 0),
  totalAmountMicros: node.totalAmount?.amountMicros ?? '0',
  giftCount: node.giftCount ?? 0,
  donorCount: node.donorCount ?? 0,
});

export const toPersonRow = (node: PersonNode): PersonRow => ({
  id: node.id,
  name: formatFullName(node.name),
  lastGiftDate: node.lastGiftDate ?? null,
  lifetimeHardGivingMicros: node.lifetimeHardGiving?.amountMicros ?? '0',
});

export const hardCreditDonorNames = (node: DonationNode): string =>
  (node.donationCredits?.edges ?? [])
    .filter((edge) => edge?.node?.creditType === 'HARD')
    .map((edge) => formatFullName(edge?.node?.person?.name))
    .filter(Boolean)
    .join('; ');

export const toPendingDonationRow = (node: DonationNode): PendingDonationRow => ({
  id: node.id,
  name: node.name ?? '',
  giftDate: node.giftDate ?? null,
  amountMicros: node.amount?.amountMicros ?? '0',
  donorNames: hardCreditDonorNames(node),
  companyName: node.company?.name ?? '',
});

export const buildDonorDashboardContext = async (): Promise<DonorDashboardContext> => {
  const [snapshot, monthlyNodes, lapsed, topDonors, pending] = await Promise.all([
    fetchSnapshot(),
    fetchMonthlyPoints(),
    fetchLapsedPreview(),
    fetchTopDonorsPreview(),
    fetchPendingAcknowledgmentsPreview(),
  ]);
  // One clock decides the year, so the heading, the bars, and the snapshot
  // never disagree around New Year.
  const year = new Date().getFullYear();
  return {
    snapshot: toSnapshot(snapshot),
    year,
    monthly: currentYearMonthly(monthlyNodes, year),
    lapsed: {
      total: lapsed.totalCount,
      rows: lapsed.rows.map(toPersonRow),
    },
    topDonors: {
      rows: topDonors.rows.map(toPersonRow),
    },
    acknowledgmentsPending: {
      total: pending.totalCount,
      rows: pending.rows.map(toPendingDonationRow),
    },
  };
};
