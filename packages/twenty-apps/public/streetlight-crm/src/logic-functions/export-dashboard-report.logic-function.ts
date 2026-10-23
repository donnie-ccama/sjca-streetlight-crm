import { defineLogicFunction, HTTPMethod } from 'twenty-sdk/define';
import type { RoutePayload } from 'twenty-sdk/logic-function';

import {
  buildCsv,
  buildExportFilename,
  DASHBOARD_REPORT_SPECS,
  formatFullName,
  isDashboardReportKey,
  MAX_EXPORT_ROWS,
  microsToDecimalString,
  REPORT_KEY_ACK_PENDING,
  REPORT_KEY_LAPSED,
  REPORT_KEY_MONTHLY,
  REPORT_KEY_SNAPSHOT,
  REPORT_KEY_TOP_DONORS,
  REPORT_QUERY_PARAM,
  type DashboardReportKey,
} from 'src/shared/dashboard-report-specs';

// HTTP CSV export for the Donor Dashboard widgets. Each export-bar front
// component renders a plain <a href> to this route; the browser downloads the
// response straight to the user's Downloads folder (Content-Disposition:
// attachment) without navigating away from Streetlight CRM. The route requires
// authentication and the same-origin link carries the current session cookie.
//
// Queries are sent as RAW GraphQL strings over fetch instead of through the
// generated CoreApiClient: the app-scoped schema this function runs against
// does not include workspace-owned custom objects (dashboardSnapshots,
// monthlyGivingPoints, donations), so the generated client rejects those
// fields before the request is ever sent. Raw queries have no such
// validation, matching scripts/bootstrap-dashboard.py.

const PAGE_SIZE = 200;

/** Sends one raw GraphQL request and returns `data`, throwing on errors. */
const gql = async (
  query: string,
  variables: Record<string, unknown> = {},
): Promise<Record<string, any>> => {
  const base = process.env.TWENTY_API_URL;
  // App access token when present; fall back to a configured API key.
  const token =
    process.env.TWENTY_APP_ACCESS_TOKEN ?? process.env.TWENTY_API_KEY;
  if (!base || !token) {
    throw new Error(
      'Logic function env is missing TWENTY_API_URL or an access token (TWENTY_APP_ACCESS_TOKEN / TWENTY_API_KEY)',
    );
  }

  let response: Response;
  try {
    response = await fetch(`${base.replace(/\/+$/, '')}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (error) {
    throw new Error(
      `Network error contacting Twenty API: ${error instanceof Error ? error.message : 'unknown'}`,
    );
  }

  if (!response.ok) {
    throw new Error(`Twenty API responded HTTP ${response.status}`);
  }

  const json = (await response.json()) as {
    data?: Record<string, any>;
    errors?: { message?: string }[];
  };
  if (json.errors?.length) {
    throw new Error(
      json.errors.map((e) => e.message ?? 'unknown GraphQL error').join('; '),
    );
  }
  return json.data ?? {};
};

const escapeInQuery = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

interface GqlPageInfo {
  hasNextPage?: boolean | null;
  endCursor?: string | null;
}

/** Pages a connection until exhausted or the export row cap is reached. */
const pageAll = async (
  rootKey: string,
  nodeFields: string,
  firstPageArgs = '',
): Promise<any[]> => {
  const rows: any[] = [];
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
    const conn = data?.[rootKey];
    for (const edge of conn?.edges ?? []) rows.push(edge.node);
    if (rows.length >= MAX_EXPORT_ROWS) break;
    const pageInfo: GqlPageInfo | undefined = conn?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    after = pageInfo.endCursor;
  }
  return rows.slice(0, MAX_EXPORT_ROWS);
};

const csvResponse = (filename: string, body: string) => ({
  __twentyHttpResponse: true as const,
  status: 200,
  headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  },
  body,
});

const errorResponse = (status: number, message: string) => ({
  __twentyHttpResponse: true as const,
  status,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ error: message }),
});

// ─── Per-report queries — filters/sorts mirror the dashboard views ───

type ReportRows = { filename: string; rows: string[][] };

const oldestDateFirst = (a: string | null, b: string | null): number =>
  (a ?? '9999-12-31').localeCompare(b ?? '9999-12-31');

const PERSON_FIELDS = `
  name { firstName lastName }
  lastGiftDate
  lifetimeHardGiving { amountMicros }
`;

const fetchSnapshotRows = async (): Promise<ReportRows> => {
  const spec = DASHBOARD_REPORT_SPECS[REPORT_KEY_SNAPSHOT];
  const data = await gql(
    `{ dashboardSnapshots(first: 1, filter: { snapshotKey: { eq: "CURRENT" } }) { edges { node {
      ytdDonors ytdGiving { amountMicros } individualDonorsYtd companyDonorsYtd
      activeDonors90d avgGift { amountMicros } computedAt
    } } } }`,
  );
  const s = data?.dashboardSnapshots?.edges?.[0]?.node;
  return {
    filename: buildExportFilename(spec.filenamePrefix),
    rows: [
      [
        String(s?.ytdDonors ?? 0),
        microsToDecimalString(s?.ytdGiving?.amountMicros ?? '0'),
        String(s?.individualDonorsYtd ?? 0),
        String(s?.companyDonorsYtd ?? 0),
        String(s?.activeDonors90d ?? 0),
        microsToDecimalString(s?.avgGift?.amountMicros ?? '0'),
        s?.computedAt ?? '',
      ],
    ],
  };
};

const fetchMonthlyRows = async (): Promise<ReportRows> => {
  const spec = DASHBOARD_REPORT_SPECS[REPORT_KEY_MONTHLY];
  const points = await pageAll(
    'monthlyGivingPoints',
    'periodLabel sortKey totalAmount { amountMicros } giftCount donorCount',
  );
  points.sort((a: any, b: any) => Number(b?.sortKey ?? 0) - Number(a?.sortKey ?? 0));
  return {
    filename: buildExportFilename(spec.filenamePrefix),
    rows: points.map((p: any) => [
      p?.periodLabel ?? '',
      microsToDecimalString(p?.totalAmount?.amountMicros ?? '0'),
      String(p?.giftCount ?? 0),
      String(p?.donorCount ?? 0),
    ]),
  };
};

const fetchLapsedRows = async (): Promise<ReportRows> => {
  const spec = DASHBOARD_REPORT_SPECS[REPORT_KEY_LAPSED];
  const people = await pageAll(
    'people',
    `${PERSON_FIELDS} doNotSolicit`,
    'filter: { isLapsed90d: { eq: "TRUE" } }',
  );
  // Oldest last-gift first, exactly like the Lapsed Donors view.
  people.sort((a: any, b: any) => oldestDateFirst(a?.lastGiftDate, b?.lastGiftDate));
  return {
    filename: buildExportFilename(spec.filenamePrefix),
    rows: people.map((p: any) => [
      formatFullName(p?.name),
      p?.lastGiftDate ?? '',
      microsToDecimalString(p?.lifetimeHardGiving?.amountMicros ?? '0'),
      p?.doNotSolicit ? 'TRUE' : 'FALSE',
    ]),
  };
};

const fetchTopDonorRows = async (): Promise<ReportRows> => {
  const spec = DASHBOARD_REPORT_SPECS[REPORT_KEY_TOP_DONORS];
  const people = await pageAll('people', PERSON_FIELDS);
  people.sort(
    (a: any, b: any) =>
      Number(b?.lifetimeHardGiving?.amountMicros ?? 0) -
      Number(a?.lifetimeHardGiving?.amountMicros ?? 0),
  );
  return {
    filename: buildExportFilename(spec.filenamePrefix),
    rows: people.map((p: any) => [
      formatFullName(p?.name),
      microsToDecimalString(p?.lifetimeHardGiving?.amountMicros ?? '0'),
      p?.lastGiftDate ?? '',
    ]),
  };
};

const DONATION_FIELDS = `
  name giftDate acknowledgmentStatus
  amount { amountMicros }
  company { name }
  donationCredits { edges { node { creditType person { name { firstName lastName } } } } }
`;

const fetchAcknowledgmentRows = async (): Promise<ReportRows> => {
  const spec = DASHBOARD_REPORT_SPECS[REPORT_KEY_ACK_PENDING];
  const donations = await pageAll(
    'donations',
    DONATION_FIELDS,
    'filter: { acknowledgmentStatus: { eq: "PENDING" } }',
  );
  donations.sort((a: any, b: any) => oldestDateFirst(a?.giftDate, b?.giftDate));
  return {
    filename: buildExportFilename(spec.filenamePrefix),
    rows: donations.map((d: any) => {
      const hardCreditDonors = (d?.donationCredits?.edges ?? [])
        .filter((e: any) => e?.node?.creditType === 'HARD')
        .map((e: any) => formatFullName(e?.node?.person?.name))
        .filter(Boolean)
        .join('; ');
      return [
        d?.name ?? '',
        d?.giftDate ?? '',
        microsToDecimalString(d?.amount?.amountMicros ?? '0'),
        d?.acknowledgmentStatus ?? '',
        hardCreditDonors,
        d?.company?.name ?? '',
      ];
    }),
  };
};

const FETCHERS: Record<DashboardReportKey, () => Promise<ReportRows>> = {
  [REPORT_KEY_SNAPSHOT]: fetchSnapshotRows,
  [REPORT_KEY_MONTHLY]: fetchMonthlyRows,
  [REPORT_KEY_LAPSED]: fetchLapsedRows,
  [REPORT_KEY_TOP_DONORS]: fetchTopDonorRows,
  [REPORT_KEY_ACK_PENDING]: fetchAcknowledgmentRows,
};

const handler = async (event: RoutePayload) => {
  const params = event.queryStringParameters ?? {};

  const reportKey = params[REPORT_QUERY_PARAM];
  if (!isDashboardReportKey(reportKey)) {
    return errorResponse(400, `Unknown report "${reportKey ?? ''}".`);
  }
  const spec = DASHBOARD_REPORT_SPECS[reportKey];

  try {
    const { filename, rows } = await FETCHERS[reportKey]();
    // Coerce every cell to a string; buildCsv applies RFC-4180 quoting and
    // formula-injection neutralization uniformly, so do not escape here.
    const safeRows = rows.map((row) =>
      row.map((cell) => (cell === null || cell === undefined ? '' : String(cell))),
    );
    return csvResponse(filename, buildCsv(spec.headers, safeRows));
  } catch (error) {
    return errorResponse(
      500,
      `Failed to build ${spec.label} export: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
};

export default defineLogicFunction({
  universalIdentifier: 'a0666cdb-c202-4062-91f2-953973936ced',
  name: 'export-dashboard-report',
  description:
    'Authenticated HTTP GET /donor-dashboard-export?report=<key> returning one Donor Dashboard report as a downloadable CSV attachment.',
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: {
    path: '/donor-dashboard-export',
    httpMethod: HTTPMethod.GET,
    isAuthRequired: true,
  },
});
