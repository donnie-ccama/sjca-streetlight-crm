import { describe, expect, it } from 'vitest';

import {
  buildCsv,
  buildExportFilename,
  DASHBOARD_REPORT_SPECS,
  escapeCsvField,
  EXPORT_ROUTE_PATH,
  formatFullName,
  isDashboardReportKey,
  microsToDecimalString,
  REPORT_KEY_ACK_PENDING,
  REPORT_KEY_SNAPSHOT,
} from 'src/shared/dashboard-report-specs';

describe('escapeCsvField', () => {
  it('leaves plain values untouched', () => {
    expect(escapeCsvField('Alice Smith')).toBe('Alice Smith');
    expect(escapeCsvField('2026-08-24')).toBe('2026-08-24');
  });

  it('quotes values containing commas, quotes, or newlines', () => {
    expect(escapeCsvField('Smith, Alice')).toBe('"Smith, Alice"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
  });

  it('wraps and doubles when both quoting rules apply', () => {
    expect(escapeCsvField('a"b')).toBe('"a""b"');
    expect(escapeCsvField(',')).toBe('","');
  });

  it('neutralizes formula-injection leading characters', () => {
    expect(escapeCsvField('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(escapeCsvField('+1')).toBe("'+1");
    expect(escapeCsvField('-cmd')).toBe("'-cmd");
    expect(escapeCsvField('@import')).toBe("'@import");
  });

  it('places the apostrophe inside quotes when quoting also applies', () => {
    expect(escapeCsvField('=a,"b')).toBe('"\'=a,""b"');
  });

  it('does not treat embedded (non-leading) triggers as formulas', () => {
    expect(escapeCsvField('a=b')).toBe('a=b');
  });
});

describe('buildCsv', () => {
  it('emits a header row plus data rows with CRLF line endings', () => {
    const csv = buildCsv(['Name', 'Amount'], [['Alice', '12.00'], ['Bob', '0.50']]);
    expect(csv).toBe('Name,Amount\r\nAlice,12.00\r\nBob,0.50\r\n');
  });

  it('escapes every cell uniformly', () => {
    const csv = buildCsv(['Note'], [['=danger']]);
    expect(csv).toContain("'=danger");
  });
});

describe('microsToDecimalString', () => {
  it('converts micros to a fixed two-decimal number string', () => {
    expect(microsToDecimalString('125000000')).toBe('125.00');
    expect(microsToDecimalString(500000)).toBe('0.50');
    expect(microsToDecimalString('0')).toBe('0.00');
  });

  it('renders missing or invalid values as empty strings', () => {
    expect(microsToDecimalString(null)).toBe('');
    expect(microsToDecimalString(undefined)).toBe('');
    expect(microsToDecimalString('not-a-number')).toBe('');
  });
});

describe('formatFullName', () => {
  it('joins first and last names and trims the result', () => {
    expect(formatFullName({ firstName: 'Ada', lastName: 'Lovelace' })).toBe('Ada Lovelace');
    expect(formatFullName({ firstName: 'Cher', lastName: null })).toBe('Cher');
    expect(formatFullName(null)).toBe('');
  });
});

describe('isDashboardReportKey', () => {
  it('accepts exactly the defined report keys', () => {
    for (const key of Object.keys(DASHBOARD_REPORT_SPECS)) {
      expect(isDashboardReportKey(key)).toBe(true);
    }
    expect(isDashboardReportKey(REPORT_KEY_SNAPSHOT)).toBe(true);
    expect(isDashboardReportKey(REPORT_KEY_ACK_PENDING)).toBe(true);
  });

  it('rejects unknown reports and non-strings', () => {
    expect(isDashboardReportKey('all-donors')).toBe(false);
    expect(isDashboardReportKey('')).toBe(false);
    expect(isDashboardReportKey(undefined)).toBe(false);
    expect(isDashboardReportKey(42)).toBe(false);
  });

  it('gives every report unique headers, prefix, and label', () => {
    const specs = Object.values(DASHBOARD_REPORT_SPECS);
    const headers = specs.flatMap((spec) => spec.headers.join('|'));
    expect(new Set(headers).size).toBe(specs.length);
    expect(new Set(specs.map((s) => s.filenamePrefix)).size).toBe(specs.length);
    expect(specs.every((s) => s.label.length > 0)).toBe(true);
  });
});

describe('buildExportFilename', () => {
  it('stamps the UTC date into the filename', () => {
    const utcNoon = new Date('2026-08-24T12:00:00.000Z');
    expect(buildExportFilename('streetlight-top-donors', utcNoon)).toBe(
      'streetlight-top-donors-2026-08-24.csv',
    );
  });
});

describe('route contract', () => {
  it('exposes a stable export route path', () => {
    expect(EXPORT_ROUTE_PATH).toBe('/donor-dashboard-export');
  });
});
