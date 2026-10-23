// Shared contract for the Donor Dashboard CSV exports. Imported by the
// export-dashboard-report logic function (route side) and by the page layout
// that bakes static download links into native rich-text widgets, so the link
// a widget renders and the route that answers it can never drift apart.
//
// Pure TypeScript only: no React, no DOM, no Node built-ins.

export const EXPORT_ROUTE_PATH = '/donor-dashboard-export';
export const REPORT_QUERY_PARAM = 'report';

export const buildStaticExportUrl = (reportKey: DashboardReportKey): string =>
  `${EXPORT_ROUTE_PATH}?${REPORT_QUERY_PARAM}=${encodeURIComponent(reportKey)}`;

export const MAX_EXPORT_ROWS = 5_000;

// ─── Report keys (the `report` query parameter) ───
export const REPORT_KEY_SNAPSHOT = 'kpi-snapshot';
export const REPORT_KEY_MONTHLY = 'monthly-giving';
export const REPORT_KEY_LAPSED = 'lapsed-donors';
export const REPORT_KEY_TOP_DONORS = 'top-donors';
export const REPORT_KEY_ACK_PENDING = 'acknowledgments-pending';

export type DashboardReportKey =
  | typeof REPORT_KEY_SNAPSHOT
  | typeof REPORT_KEY_MONTHLY
  | typeof REPORT_KEY_LAPSED
  | typeof REPORT_KEY_TOP_DONORS
  | typeof REPORT_KEY_ACK_PENDING;

export type DashboardReportSpec = {
  key: DashboardReportKey;
  /** Human-facing report name, used in UI copy and error messages. */
  label: string;
  /** Filename stem; buildExportFilename appends `-YYYY-MM-DD.csv`. */
  filenamePrefix: string;
  /** CSV header row, in column order. Row mappers must match this order. */
  headers: string[];
};

export const DASHBOARD_REPORT_SPECS: Record<DashboardReportKey, DashboardReportSpec> = {
  [REPORT_KEY_SNAPSHOT]: {
    key: REPORT_KEY_SNAPSHOT,
    label: 'YTD Snapshot',
    filenamePrefix: 'streetlight-ytd-snapshot',
    headers: [
      'YTD Donors',
      'YTD Giving (USD)',
      'Individual Donors YTD',
      'Company Donors YTD',
      'Active Donors (90d)',
      'Avg Gift (USD)',
      'Computed At',
    ],
  },
  [REPORT_KEY_MONTHLY]: {
    key: REPORT_KEY_MONTHLY,
    label: 'Monthly Giving Breakdown',
    filenamePrefix: 'streetlight-monthly-giving',
    headers: ['Month', 'Total Amount (USD)', 'Gift Count', 'Donor Count'],
  },
  [REPORT_KEY_LAPSED]: {
    key: REPORT_KEY_LAPSED,
    label: 'Lapsed Donors (90+ days)',
    filenamePrefix: 'streetlight-lapsed-donors',
    headers: ['Name', 'Last Gift Date', 'Lifetime Giving (USD)', 'Do Not Solicit'],
  },
  [REPORT_KEY_TOP_DONORS]: {
    key: REPORT_KEY_TOP_DONORS,
    label: 'Top Donors (lifetime)',
    filenamePrefix: 'streetlight-top-donors',
    headers: ['Name', 'Lifetime Giving (USD)', 'Last Gift Date'],
  },
  [REPORT_KEY_ACK_PENDING]: {
    key: REPORT_KEY_ACK_PENDING,
    label: 'Acknowledgments Pending',
    filenamePrefix: 'streetlight-acknowledgments-pending',
    headers: [
      'Donation',
      'Gift Date',
      'Amount (USD)',
      'Acknowledgment Status',
      'Hard-Credit Donor(s)',
      'Company',
    ],
  },
};

export const isDashboardReportKey = (value: unknown): value is DashboardReportKey =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(DASHBOARD_REPORT_SPECS, value);

// ─── Formatting helpers ───

/**
 * Twenty stores money as integer micros. Renders as a plain fixed-precision
 * number (no currency symbol, no grouping) so spreadsheets treat it as a
 * number rather than text.
 */
export const microsToDecimalString = (micros?: string | number | null): string => {
  if (micros === null || micros === undefined || micros === '') return '';
  const value = Number(micros);
  if (!Number.isFinite(value)) return '';
  return (value / 1_000_000).toFixed(2);
};

/** Joins fullName subfields into a display name. */
export const formatFullName = (
  name?: { firstName?: string | null; lastName?: string | null } | null,
): string =>
  [name?.firstName, name?.lastName]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(' ')
    .trim();

// Characters spreadsheet apps evaluate as formulas when they lead a cell.
// Neutralized by prefixing a literal single quote so the cell is read as text
// (same guard as the donation-entry dashboard's audit export).
const FORMULA_TRIGGER_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

// Characters that force RFC-4180 quoting.
const QUOTE_TRIGGER_CHARS = new Set([',', '"', '\n', '\r']);

/** RFC-4180 quoting plus formula-injection neutralization for one field. */
export const escapeCsvField = (value: string): string => {
  let needsQuoting = false;
  for (let i = 0; i < value.length; i++) {
    if (QUOTE_TRIGGER_CHARS.has(value[i])) {
      needsQuoting = true;
      break;
    }
  }
  const isFormulaTrigger = value.length > 0 && FORMULA_TRIGGER_CHARS.has(value[0]);
  if (!needsQuoting && !isFormulaTrigger) return value;
  const escaped = needsQuoting ? value.split('"').join('""') : value;
  if (needsQuoting && isFormulaTrigger) {
    // The apostrophe must end up INSIDE the quotes: "'=dangerous".
    return `"'${escaped}"`;
  }
  if (needsQuoting) return `"${escaped}"`;
  return `'${escaped}`;
};

/** Builds the full CSV text from a header row and data rows of strings. */
export const buildCsv = (headers: string[], rows: string[][]): string => {
  const lines = [headers.map(escapeCsvField).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
};

/** `streetlight-top-donors-2026-08-24.csv` style filenames. */
export const buildExportFilename = (filenamePrefix: string, now: Date = new Date()): string => {
  const day = now.toISOString().slice(0, 10);
  return `${filenamePrefix}-${day}.csv`;
};
