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
import {
  DANGER,
  EMPTY,
  INTERACTION_CSS,
  initialOf,
  statusPillColor,
  STYLE,
  tint,
} from 'src/shared/daily-giving-styles';
import { formatShortDate } from 'src/shared/donor-dashboard-specs';

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

const SCOPE = 'sl-today-gifts';

const giftLabel = (gift: DailyGift): string =>
  gift.inKindDescription?.trim() || gift.name?.trim() || 'Gift';

const statusLabel = (value?: string | null): string =>
  value
    ? value
        .toLowerCase()
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
    : EMPTY;

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
    <div className={SCOPE} style={STYLE.root}>
      <style>{INTERACTION_CSS(SCOPE)}</style>
      <div style={STYLE.card}>
        <div style={STYLE.cardHead}>
          <div style={{ minWidth: 0 }}>
            <h2 style={STYLE.cardTitle}>Today’s Gifts</h2>
            <div style={STYLE.hint}>
              {context
                ? `${context.day.totals.giftCount} gift${context.day.totals.giftCount === 1 ? '' : 's'} · ${formatMicrosToUsd(context.day.totals.amountMicros)}`
                : formatShortDate(date)}
            </div>
          </div>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setLoading(true);
              void loadGifts();
            }}
            disabled={loading}
            style={STYLE.ghostButton}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {error ? (
          <div role="alert" style={{ ...STYLE.muted, color: DANGER }}>
            {error}. Select Refresh to try again.
          </div>
        ) : null}

        {loading && !context ? (
          <div aria-live="polite" style={STYLE.muted}>
            Loading today’s gifts…
          </div>
        ) : error && !context ? null : entries.length === 0 ? (
          <div style={STYLE.muted}>No gifts recorded today.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                minWidth: 860,
                borderCollapse: 'collapse',
                tableLayout: 'fixed',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <thead>
                <tr>
                  <th style={{ ...STYLE.th, width: 220 }}>Gift</th>
                  <th style={{ ...STYLE.th, width: 200 }}>Donor</th>
                  <th style={{ ...STYLE.th, width: 110, textAlign: 'right', paddingRight: 24 }}>Amount</th>
                  <th style={{ ...STYLE.th, width: 130 }}>Income stream</th>
                  <th style={{ ...STYLE.th, width: 150 }}>Fund</th>
                  <th style={{ ...STYLE.th, width: 150, paddingRight: 0 }}>Acknowledgment</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((gift) => (
                  <tr key={gift.id} className="row">
                    <td title={giftLabel(gift)} style={{ ...STYLE.td, fontWeight: 500 }}>
                      {giftLabel(gift)}
                    </td>
                    <td title={dailyGiftDonorLabel(gift)} style={STYLE.td}>
                      <span style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                        <span style={STYLE.avatar}>{initialOf(dailyGiftDonorLabel(gift))}</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {dailyGiftDonorLabel(gift)}
                        </span>
                      </span>
                    </td>
                    <td style={{ ...STYLE.td, textAlign: 'right', paddingRight: 24, fontWeight: 600 }}>
                      {formatMicrosToUsd(gift.amount?.amountMicros ?? '0')}
                    </td>
                    <td style={STYLE.td}>{paymentMethodLabel(gift.paymentMethod ?? 'OTHER')}</td>
                    <td
                      title={gift.fund?.name ?? undefined}
                      style={{
                        ...STYLE.td,
                        color: gift.fund?.name ? 'var(--sl-text)' : 'var(--sl-text-secondary)',
                      }}
                    >
                      {gift.fund?.name ?? EMPTY}
                    </td>
                    <td style={{ ...STYLE.td, paddingRight: 0 }}>
                      {gift.acknowledgmentStatus ? (
                        <span
                          style={{
                            ...STYLE.pill,
                            color: statusPillColor(gift.acknowledgmentStatus),
                            background: tint(statusPillColor(gift.acknowledgmentStatus)),
                          }}
                        >
                          {statusLabel(gift.acknowledgmentStatus)}
                        </span>
                      ) : (
                        EMPTY
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
