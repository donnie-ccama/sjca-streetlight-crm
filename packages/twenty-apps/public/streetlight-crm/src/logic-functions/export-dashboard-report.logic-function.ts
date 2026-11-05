import { defineLogicFunction, HTTPMethod } from 'twenty-sdk/define';
import type { RoutePayload } from 'twenty-sdk/logic-function';

import {
  buildCsv,
  buildExportFilename,
  DASHBOARD_REPORT_SPECS,
  formatFullName,
  isDashboardReportKey,
  microsToDecimalString,
  REPORT_KEY_ACK_PENDING,
  REPORT_KEY_LAPSED,
  REPORT_KEY_MONTHLY,
  REPORT_KEY_SNAPSHOT,
  REPORT_KEY_TOP_DONORS,
  REPORT_QUERY_PARAM,
  type DashboardReportKey,
} from 'src/shared/dashboard-report-specs';
import {
  fetchLapsedPeople,
  fetchMonthlyPoints,
  fetchPendingAcknowledgments,
  fetchSnapshot,
  fetchTopDonors,
  hardCreditDonorNames,
} from 'src/logic-functions/donor-dashboard.server';

// HTTP CSV export for the Donor Dashboard. The component renders a plain
// <a href> to this route; the browser downloads the response as an
// attachment without leaving the page. Auth is required and the
// same-origin link carries the session cookie.

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

type ReportRows = { filename: string; rows: string[][] };

const fetchSnapshotRows = async (): Promise<ReportRows> => {
  const spec = DASHBOARD_REPORT_SPECS[REPORT_KEY_SNAPSHOT];
  const s = await fetchSnapshot();
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
  const points = await fetchMonthlyPoints();
  return {
    filename: buildExportFilename(spec.filenamePrefix),
    rows: points.map((p) => [
      p.periodLabel ?? '',
      microsToDecimalString(p.totalAmount?.amountMicros ?? '0'),
      String(p.giftCount ?? 0),
      String(p.donorCount ?? 0),
    ]),
  };
};

const fetchLapsedRows = async (): Promise<ReportRows> => {
  const spec = DASHBOARD_REPORT_SPECS[REPORT_KEY_LAPSED];
  const people = await fetchLapsedPeople();
  return {
    filename: buildExportFilename(spec.filenamePrefix),
    rows: people.map((p) => [
      formatFullName(p.name),
      p.lastGiftDate ?? '',
      microsToDecimalString(p.lifetimeHardGiving?.amountMicros ?? '0'),
      p.doNotSolicit ? 'TRUE' : 'FALSE',
    ]),
  };
};

const fetchTopDonorRows = async (): Promise<ReportRows> => {
  const spec = DASHBOARD_REPORT_SPECS[REPORT_KEY_TOP_DONORS];
  const people = await fetchTopDonors();
  return {
    filename: buildExportFilename(spec.filenamePrefix),
    rows: people.map((p) => [
      formatFullName(p.name),
      microsToDecimalString(p.lifetimeHardGiving?.amountMicros ?? '0'),
      p.lastGiftDate ?? '',
    ]),
  };
};

const fetchAcknowledgmentRows = async (): Promise<ReportRows> => {
  const spec = DASHBOARD_REPORT_SPECS[REPORT_KEY_ACK_PENDING];
  const donations = await fetchPendingAcknowledgments();
  return {
    filename: buildExportFilename(spec.filenamePrefix),
    rows: donations.map((d) => [
      d.name ?? '',
      d.giftDate ?? '',
      microsToDecimalString(d.amount?.amountMicros ?? '0'),
      d.acknowledgmentStatus ?? '',
      hardCreditDonorNames(d),
      d.company?.name ?? '',
    ]),
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
