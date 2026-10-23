import { defineFrontComponent } from 'twenty-sdk/define';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';

import {
  GET_DAILY_CONTEXT_ROUTE,
  TODAY_GIFTS_FRONT_COMPONENT_ID,
} from 'src/constants/daily-giving-identifiers';
import {
  dailyGiftDonorLabel,
  formatMicrosToUsd,
  paymentMethodLabel,
  todayLocalDateString,
  type DailyGiftDonorSource,
} from 'src/shared/daily-entry-specs';

interface DailyGift extends DailyGiftDonorSource {
  id: string;
  name?: string | null;
  amount?: { amountMicros?: string | null } | null;
  paymentMethod?: string | null;
  inKindDescription?: string | null;
  acknowledgmentStatus?: string | null;
  fund?: { name?: string | null } | null;
}

interface DailyGivingContext {
  day: {
    date: string;
    totals: {
      giftCount: number;
      amountMicros: string;
    };
    entries: DailyGift[];
  };
}

const api = new RestApiClient();

const COLORS = {
  border: '#e5e7eb',
  muted: '#6b7280',
  fg: '#111827',
  accent: '#4f46e5',
  danger: '#b91c1c',
  header: '#f9fafb',
};

const cellStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderBottom: `1px solid ${COLORS.border}`,
  fontSize: 12,
  lineHeight: 1.35,
  textAlign: 'left',
  verticalAlign: 'middle',
};

const headerCellStyle: React.CSSProperties = {
  ...cellStyle,
  position: 'sticky',
  top: 0,
  zIndex: 1,
  color: COLORS.muted,
  background: COLORS.header,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.4px',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
};

const giftLabel = (gift: DailyGift): string =>
  gift.inKindDescription?.trim() || gift.name?.trim() || 'Gift';

const statusLabel = (value?: string | null): string =>
  value
    ? value
        .toLowerCase()
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
    : '—';

const TodayGiftsTable = () => {
  const date = todayLocalDateString();
  const [context, setContext] = useState<DailyGivingContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latestRequestId = useRef(0);

  const loadGifts = useCallback(async () => {
    const requestId = latestRequestId.current + 1;
    latestRequestId.current = requestId;
    setError(null);
    try {
      const data = await api.get<DailyGivingContext>(
        `/s${GET_DAILY_CONTEXT_ROUTE}`,
        { query: { date } },
      );
      if (requestId === latestRequestId.current) setContext(data);
    } catch (loadError) {
      if (requestId === latestRequestId.current) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Today's gifts could not be loaded",
        );
      }
    } finally {
      if (requestId === latestRequestId.current) setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void loadGifts();
  }, [loadGifts]);

  const entries = context?.day.entries ?? [];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        color: COLORS.fg,
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 10px',
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <span style={{ color: COLORS.muted, fontSize: 12 }}>
          {context
            ? `${context.day.totals.giftCount} gift${context.day.totals.giftCount === 1 ? '' : 's'} · ${formatMicrosToUsd(context.day.totals.amountMicros)}`
            : date}
        </span>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void loadGifts();
          }}
          disabled={loading}
          style={{
            marginLeft: 'auto',
            minHeight: 30,
            padding: '4px 10px',
            border: `1px solid ${COLORS.border}`,
            borderRadius: 6,
            color: loading ? COLORS.muted : COLORS.accent,
            background: '#ffffff',
            font: 'inherit',
            fontSize: 12,
            fontWeight: 500,
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error ? (
        <div
          role="alert"
          style={{ padding: 12, color: COLORS.danger, fontSize: 12 }}
        >
          {error}. Select Refresh to try again.
        </div>
      ) : null}

      {loading && !context ? (
        <div aria-live="polite" style={{ padding: 12, color: COLORS.muted, fontSize: 12 }}>
          Loading today’s gifts…
        </div>
      ) : error && !context ? null : entries.length === 0 ? (
        <div style={{ padding: 12, color: COLORS.muted, fontSize: 12 }}>
          No gifts recorded today.
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <table
            style={{
              width: '100%',
              minWidth: 900,
              borderCollapse: 'collapse',
              tableLayout: 'fixed',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <thead>
              <tr>
                <th style={{ ...headerCellStyle, width: 220 }}>Gift</th>
                <th style={{ ...headerCellStyle, width: 190 }}>Donor</th>
                <th style={{ ...headerCellStyle, width: 110 }}>Amount</th>
                <th style={{ ...headerCellStyle, width: 130 }}>Income stream</th>
                <th style={{ ...headerCellStyle, width: 150 }}>Fund</th>
                <th style={{ ...headerCellStyle, width: 150 }}>Acknowledgment</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((gift) => (
                <tr key={gift.id}>
                  <td
                    title={giftLabel(gift)}
                    style={{
                      ...cellStyle,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontWeight: 500,
                    }}
                  >
                    {giftLabel(gift)}
                  </td>
                  <td
                    title={dailyGiftDonorLabel(gift)}
                    style={{
                      ...cellStyle,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {dailyGiftDonorLabel(gift)}
                  </td>
                  <td style={{ ...cellStyle, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {formatMicrosToUsd(gift.amount?.amountMicros ?? '0')}
                  </td>
                  <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
                    {paymentMethodLabel(gift.paymentMethod ?? 'OTHER')}
                  </td>
                  <td
                    title={gift.fund?.name ?? undefined}
                    style={{
                      ...cellStyle,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: gift.fund?.name ? COLORS.fg : COLORS.muted,
                    }}
                  >
                    {gift.fund?.name ?? '—'}
                  </td>
                  <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
                    {statusLabel(gift.acknowledgmentStatus)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: TODAY_GIFTS_FRONT_COMPONENT_ID,
  name: 'today-gifts-table',
  description:
    'Live table of today’s donations with individual or organization donor names beside each gift.',
  component: TodayGiftsTable,
});
