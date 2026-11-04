import { defineFrontComponent } from 'twenty-sdk/define';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';

import {
  DONOR_DASHBOARD_FRONT_COMPONENT_ID,
  GET_DONOR_DASHBOARD_CONTEXT_ROUTE,
} from 'src/constants/dashboard-identifiers';
import {
  buildStaticExportUrl,
  REPORT_KEY_ACK_PENDING,
  REPORT_KEY_LAPSED,
  REPORT_KEY_MONTHLY,
  REPORT_KEY_SNAPSHOT,
  REPORT_KEY_TOP_DONORS,
  type DashboardReportKey,
} from 'src/shared/dashboard-report-specs';
import {
  buildMonthlyBars,
  formatCompactUsd,
  formatComputedAt,
  formatShortDate,
  formatUsd,
  percentOf,
  sumGiftCount,
  type DonorDashboardContext,
  type PendingDonationRow,
  type PersonRow,
} from 'src/shared/donor-dashboard-specs';

const api = new RestApiClient();

// Colors and fonts come from the --sl-* variables twenty-front defines for
// the light and dark scopes, so the component follows the workspace theme.
const CARD_SHADOW = '0 1px 3px rgba(0,0,0,.12)';
const CARD_PADDING = 24;
const CARD_GAP = 16;
const EMPTY = '—';

const WARNING = 'light-dark(#b35c00, #ff9d3d)';

const STYLE = {
  root: {
    fontFamily: 'var(--sl-font-ui)',
    color: 'var(--sl-text)',
    background: 'var(--sl-surface)',
    padding: CARD_PADDING,
    fontSize: 13,
    lineHeight: 1.4,
    minHeight: '100%',
    boxSizing: 'border-box',
  },
  card: {
    background: 'var(--sl-bg)',
    borderRadius: 'var(--sl-radius)',
    boxShadow: CARD_SHADOW,
    padding: CARD_PADDING,
    minWidth: 0,
    overflow: 'hidden',
  },
  label: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.075em',
    color: 'var(--sl-text-secondary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  tileNumber: {
    fontFamily: 'var(--sl-font-display)',
    fontSize: 'clamp(28px, 3vw, 40px)',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    lineHeight: 1.1,
    whiteSpace: 'nowrap',
    margin: '6px 0 4px',
  },
  note: {
    color: 'var(--sl-text-secondary)',
    fontSize: 12,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  cardTitle: {
    fontFamily: 'var(--sl-font-display)',
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
    margin: 0,
  },
  hint: {
    color: 'var(--sl-text-secondary)',
    fontSize: 12,
    marginTop: 2,
  },
  cardHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  pillLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    padding: '0 14px',
    borderRadius: 'var(--sl-radius-pill)',
    border: '1px solid var(--sl-hairline-strong)',
    color: 'var(--sl-text)',
    fontWeight: 600,
    fontSize: 12,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  th: {
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.075em',
    textTransform: 'uppercase',
    color: 'var(--sl-text-secondary)',
    padding: '0 8px 10px 0',
    borderBottom: '1px solid var(--sl-hairline)',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '10px 8px 10px 0',
    borderBottom: '1px solid var(--sl-hairline)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    verticalAlign: 'middle',
  },
  rowLink: {
    color: 'inherit',
    textDecoration: 'none',
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
  },
  rowLinkText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  avatar: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: 'var(--sl-navy)',
    color: '#fff',
    fontSize: 10,
    fontWeight: 700,
    marginRight: 8,
    flexShrink: 0,
  },
  pill: {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: 'var(--sl-radius-pill)',
    fontSize: 11,
    fontWeight: 600,
    color: WARNING,
    background: `color-mix(in srgb, ${WARNING} 12%, transparent)`,
  },
  foot: {
    color: 'var(--sl-text-secondary)',
    fontSize: 12,
    marginTop: 12,
  },
  footLink: {
    color: 'inherit',
    textDecoration: 'underline',
  },
  muted: {
    color: 'var(--sl-text-secondary)',
    padding: '12px 0',
  },
  alert: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: CARD_GAP,
    padding: '10px 14px',
    borderRadius: 'var(--sl-radius-sm)',
    border: '1px solid var(--sl-hairline-strong)',
    background: 'var(--sl-bg)',
  },
  retry: {
    minHeight: 30,
    padding: '0 14px',
    borderRadius: 'var(--sl-radius-pill)',
    border: '1px solid var(--sl-hairline-strong)',
    background: 'transparent',
    color: 'var(--sl-text)',
    font: 'inherit',
    fontWeight: 600,
    cursor: 'pointer',
  },
} satisfies Record<string, React.CSSProperties>;

const RESPONSIVE_CSS = `
.sl-donor-dashboard .tiles { display: grid; gap: ${CARD_GAP}px; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: ${CARD_GAP}px; }
.sl-donor-dashboard .pair { display: grid; gap: ${CARD_GAP}px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-bottom: ${CARD_GAP}px; }
.sl-donor-dashboard tr.row:hover td { background: var(--sl-surface); }
.sl-donor-dashboard tr.row a:hover { text-decoration: underline; }
@media (max-width: 1100px) {
  .sl-donor-dashboard .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sl-donor-dashboard .pair { grid-template-columns: 1fr; }
}
@media (max-width: 600px) {
  .sl-donor-dashboard .tiles { grid-template-columns: 1fr; }
}`;

const CsvLink = ({ reportKey }: { reportKey: DashboardReportKey }) => (
  <a href={buildStaticExportUrl(reportKey)} style={STYLE.pillLink} download>
    ⬇ CSV
  </a>
);

const Tile = ({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) => (
  <div style={{ ...STYLE.card, padding: 20 }}>
    <div style={STYLE.label}>{label}</div>
    <div style={STYLE.tileNumber}>{value}</div>
    <div style={STYLE.note}>{note || ' '}</div>
  </div>
);

const CardHead = ({
  title,
  hint,
  reportKey,
}: {
  title: string;
  hint: string;
  reportKey: DashboardReportKey;
}) => (
  <div style={STYLE.cardHead}>
    <div style={{ minWidth: 0 }}>
      <h2 style={STYLE.cardTitle}>{title}</h2>
      <div style={STYLE.hint}>{hint}</div>
    </div>
    <CsvLink reportKey={reportKey} />
  </div>
);

const Avatar = ({ name }: { name: string }) => (
  <span style={STYLE.avatar}>{(name.trim()[0] ?? '?').toUpperCase()}</span>
);

const Footer = ({
  summary,
  href,
}: {
  summary: string;
  href: string;
}) => (
  <div style={STYLE.foot}>
    {summary} ·{' '}
    <a href={href} style={STYLE.footLink}>
      Open the full list →
    </a>
  </div>
);

const ListState = ({ loading }: { loading: boolean }) => (
  <div style={STYLE.muted}>{loading ? 'Loading…' : 'Nothing here'}</div>
);

const PeopleCard = ({
  title,
  hint,
  reportKey,
  rows,
  summary,
  loading,
}: {
  title: string;
  hint: string;
  reportKey: DashboardReportKey;
  rows: PersonRow[];
  summary: string;
  loading: boolean;
}) => (
  <div style={STYLE.card}>
    <CardHead title={title} hint={hint} reportKey={reportKey} />
    {rows.length === 0 ? (
      <ListState loading={loading} />
    ) : (
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontVariantNumeric: 'tabular-nums' }}>
        <thead>
          <tr>
            <th style={STYLE.th}>Name</th>
            <th style={{ ...STYLE.th, width: 96 }}>Last gift</th>
            <th style={{ ...STYLE.th, width: 84, textAlign: 'right', paddingRight: 0 }}>Lifetime</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="row">
              <td style={STYLE.td} title={row.name}>
                <a href={`/object/person/${row.id}`} style={STYLE.rowLink}>
                  <Avatar name={row.name} />
                  <span style={STYLE.rowLinkText}>{row.name || EMPTY}</span>
                </a>
              </td>
              <td style={STYLE.td}>{formatShortDate(row.lastGiftDate)}</td>
              <td style={{ ...STYLE.td, textAlign: 'right', paddingRight: 0, fontWeight: 600 }}>
                {formatUsd(row.lifetimeHardGivingMicros)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
    {rows.length > 0 ? <Footer summary={summary} href="/objects/people" /> : null}
  </div>
);

const pendingDonorLabel = (row: PendingDonationRow): string =>
  row.donorNames || row.companyName || row.name || EMPTY;

const AcknowledgmentsCard = ({
  rows,
  total,
  loading,
}: {
  rows: PendingDonationRow[];
  total: number;
  loading: boolean;
}) => (
  <div style={STYLE.card}>
    <CardHead
      title="Acknowledgments Pending"
      hint={`Oldest first · ${total} gifts waiting for a thank-you`}
      reportKey={REPORT_KEY_ACK_PENDING}
    />
    {rows.length === 0 ? (
      <ListState loading={loading} />
    ) : (
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontVariantNumeric: 'tabular-nums' }}>
        <thead>
          <tr>
            <th style={STYLE.th}>Donor</th>
            <th style={{ ...STYLE.th, width: 120 }}>Gift date</th>
            <th style={{ ...STYLE.th, width: 110, textAlign: 'right' }}>Amount</th>
            <th style={{ ...STYLE.th, width: 100, textAlign: 'right', paddingRight: 0 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="row">
              <td style={STYLE.td} title={pendingDonorLabel(row)}>
                <a href={`/object/donation/${row.id}`} style={STYLE.rowLink}>
                  <Avatar name={pendingDonorLabel(row)} />
                  <span style={STYLE.rowLinkText}>{pendingDonorLabel(row)}</span>
                </a>
              </td>
              <td style={STYLE.td}>{formatShortDate(row.giftDate)}</td>
              <td style={{ ...STYLE.td, textAlign: 'right', fontWeight: 600 }}>{formatUsd(row.amountMicros)}</td>
              <td style={{ ...STYLE.td, textAlign: 'right', paddingRight: 0 }}>
                <span style={STYLE.pill}>Pending</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
    {rows.length > 0 ? <Footer summary={`Showing ${rows.length} of ${total}`} href="/objects/donations" /> : null}
  </div>
);

const MonthlyCard = ({
  context,
  year,
  currentMonth,
}: {
  context: DonorDashboardContext | null;
  year: number;
  currentMonth: number;
}) => {
  const bars = buildMonthlyBars(context?.monthly ?? [], year, currentMonth);
  return (
    <div style={{ ...STYLE.card, marginBottom: CARD_GAP }}>
      <CardHead
        title="Monthly Giving"
        hint={`${year} by month · ${formatCompactUsd(context?.snapshot?.ytdGivingMicros)} so far`}
        reportKey={REPORT_KEY_MONTHLY}
      />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 150, paddingTop: 20, borderBottom: '1px solid var(--sl-hairline)' }}>
        {bars.map((bar) => (
          <div key={bar.month} style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'stretch', position: 'relative' }}>
            <span style={{ position: 'absolute', top: -18, left: 0, right: 0, textAlign: 'center', fontSize: 11, color: 'var(--sl-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden' }}>
              {bar.hasData ? formatCompactUsd(bar.amountMicros) : ''}
            </span>
            <div
              style={{
                height: `${Math.max(bar.heightPercent, 2)}%`,
                background: bar.hasData ? 'var(--sl-navy)' : 'var(--sl-hairline)',
                borderRadius: '6px 6px 0 0',
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
        {bars.map((bar) => (
          <div key={bar.month} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: bar.isCurrentMonth ? 'var(--sl-text)' : 'var(--sl-text-secondary)', fontWeight: bar.isCurrentMonth ? 700 : 400 }}>
            {bar.month}
          </div>
        ))}
      </div>
    </div>
  );
};

const DonorDashboard = () => {
  const [context, setContext] = useState<DonorDashboardContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latestRequestId = useRef(0);

  const load = useCallback(async () => {
    const requestId = latestRequestId.current + 1;
    latestRequestId.current = requestId;
    setError(null);
    setLoading(true);
    try {
      const data = await api.get<DonorDashboardContext>(
        `/s${GET_DONOR_DASHBOARD_CONTEXT_ROUTE}`,
      );
      if (requestId === latestRequestId.current) setContext(data);
    } catch (loadError) {
      if (requestId === latestRequestId.current) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'The dashboard could not be loaded',
        );
      }
    } finally {
      if (requestId === latestRequestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const snapshot = context?.snapshot ?? null;
  const now = new Date();
  const year = context?.year ?? now.getFullYear();
  const currentMonth = now.getFullYear() === year ? now.getMonth() + 1 : 0;
  const monthly = context?.monthly ?? [];

  return (
    <div className="sl-donor-dashboard" style={STYLE.root}>
      <style>{RESPONSIVE_CSS}</style>

      {error ? (
        <div role="alert" style={STYLE.alert}>
          <span style={{ flex: 1 }}>{error}</span>
          <button type="button" onClick={() => void load()} style={STYLE.retry} disabled={loading}>
            Retry
          </button>
        </div>
      ) : null}

      <div style={{ ...STYLE.cardHead, marginBottom: CARD_GAP }}>
        <div style={{ ...STYLE.note, fontSize: 13 }}>
          {year} year to date · refreshed hourly · last run {formatComputedAt(snapshot?.computedAt)}
        </div>
        <CsvLink reportKey={REPORT_KEY_SNAPSHOT} />
      </div>

      <div className="tiles">
        <Tile
          label="YTD Giving"
          value={snapshot ? formatCompactUsd(snapshot.ytdGivingMicros) : EMPTY}
          note={snapshot ? `${sumGiftCount(monthly).toLocaleString('en-US')} gifts` : ''}
        />
        <Tile
          label="YTD Donors"
          value={snapshot ? snapshot.ytdDonors.toLocaleString('en-US') : EMPTY}
          note={snapshot ? `${snapshot.individualDonorsYtd} people · ${snapshot.companyDonorsYtd} orgs` : ''}
        />
        <Tile
          label="Active 90 days"
          value={snapshot ? snapshot.activeDonors90d.toLocaleString('en-US') : EMPTY}
          note={snapshot ? `${percentOf(snapshot.activeDonors90d, snapshot.ytdDonors)} of donors` : ''}
        />
        <Tile
          label="Average Gift"
          value={snapshot ? formatCompactUsd(snapshot.avgGiftMicros) : EMPTY}
          note={snapshot ? 'per gift' : ''}
        />
      </div>

      <MonthlyCard context={context} year={year} currentMonth={currentMonth} />

      <div className="pair">
        <PeopleCard
          title="Lapsed Donors"
          hint={`90+ days since last gift · ${context?.lapsed.total ?? 0} people`}
          reportKey={REPORT_KEY_LAPSED}
          rows={context?.lapsed.rows ?? []}
          summary={`Showing ${context?.lapsed.rows.length ?? 0} of ${context?.lapsed.total ?? 0}`}
          loading={loading}
        />
        <PeopleCard
          title="Top Donors"
          hint="Lifetime giving"
          reportKey={REPORT_KEY_TOP_DONORS}
          rows={context?.topDonors.rows ?? []}
          summary={`Top ${context?.topDonors.rows.length ?? 0} by lifetime giving`}
          loading={loading}
        />
      </div>

      <AcknowledgmentsCard
        rows={context?.acknowledgmentsPending.rows ?? []}
        total={context?.acknowledgmentsPending.total ?? 0}
        loading={loading}
      />
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: DONOR_DASHBOARD_FRONT_COMPONENT_ID,
  name: 'donor-dashboard',
  description:
    'Streetlight-styled donor dashboard: year-to-date tiles, monthly giving chart, lapsed and top donors, acknowledgments pending.',
  component: DonorDashboard,
});
