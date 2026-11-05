import { defineFrontComponent } from 'twenty-sdk/define';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';

import {
  ENTRY_FRONT_COMPONENT_ID,
  CREATE_DAILY_DONATIONS_ROUTE,
  GET_DAILY_CONTEXT_ROUTE,
  SEARCH_DONORS_ROUTE,
} from 'src/constants/daily-giving-identifiers';
import {
  dailyGiftDonorLabel,
  formatMicrosToUsd,
  isValidDateString,
  MAX_ENTRIES_PER_BATCH,
  parseAmountToMicros,
  paymentMethodLabel,
  PAYMENT_METHODS,
  todayLocalDateString,
  type BatchResponse,
  type DailyEntryInput,
  type DailyGiftDonorSource,
  type EntryResult,
} from 'src/shared/daily-entry-specs';
import {
  CARD_GAP,
  DANGER,
  EMPTY,
  INTERACTION_CSS,
  initialOf,
  STYLE,
  SUCCESS,
  tint,
  WARNING,
} from 'src/shared/daily-giving-styles';
import { formatShortDate } from 'src/shared/donor-dashboard-specs';
import type { DonorSuggestion } from 'src/shared/donor-suggestions';

// ─────────────────────────── server types ──────────────────────────

interface DayEntry extends DailyGiftDonorSource {
  id: string;
  name: string;
  amount?: { amountMicros?: string };
  giftDate: string;
  paymentMethod?: string;
  checkNumber?: string | null;
  inKindDescription?: string | null;
  acknowledgmentStatus?: string;
  fund?: { name?: string } | null;
  fundraisingCampaign?: { name?: string } | null;
}

interface ContextPayload {
  today: string;
  funds: Array<{ id: string; name: string; isRestricted?: boolean | null }>;
  campaigns: Array<{ id: string; name: string; status?: string | null }>;
  day: {
    date: string;
    totals: {
      giftCount: number;
      amountMicros: string;
      inKindCount: number;
      byMethod: Record<string, { count: number; amountMicros: string }>;
    };
    entries: DayEntry[];
  };
}

interface StagedEntry extends DailyEntryInput {
  localId: string;
  displayLabel: string;
}

// ───────────────────────────── helpers ─────────────────────────────

const api = new RestApiClient();

// RestApiClient routes /s/-prefixed paths to TWENTY_FUNCTIONS_URL (the
// per-workspace app-route domain); bare paths hit TWENTY_API_URL and miss
// our logic functions. See https://docs.twenty.com/developers/extend/apps/layout/front-components.
const functionsPath = (path: string): string => `/s${path}`;

const newUuidV4 = (): string => {
  // crypto.randomUUID is unavailable in some older runtimes; fall back.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const donorChip = (entry: DayEntry): string =>
  dailyGiftDonorLabel(entry);

const entryTitle = (entry: DayEntry): string =>
  entry.inKindDescription || entry.name || 'Gift';

// ───────────────────────────── styles ──────────────────────────────

const SCOPE = 'sl-daily-entry';

const RESPONSIVE_CSS = `${INTERACTION_CSS(SCOPE)}
.${SCOPE} .fields { display: grid; gap: 12px; grid-template-columns: minmax(0, 2fr) repeat(4, minmax(0, 1fr)); align-items: start; }
.${SCOPE} .extras { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; margin-top: 12px; }
.${SCOPE} .suggestion:hover { background: var(--sl-surface); }
@media (max-width: 1100px) {
  .${SCOPE} .fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .${SCOPE} .fields .donor { grid-column: 1 / -1; }
}
@media (max-width: 600px) {
  .${SCOPE} .fields { grid-template-columns: 1fr; }
}`;

// ─────────────────────────── component ─────────────────────────────

const DailyDonationEntry = () => {
  const [date, setDate] = useState<string>(() => todayLocalDateString());
  const [context, setContext] = useState<ContextPayload | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);

  const [donorQuery, setDonorQuery] = useState('');
  const [suggestions, setSuggestions] = useState<DonorSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedDonor, setSelectedDonor] = useState<DonorSuggestion | null>(null);

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CHECK');
  const [fundId, setFundId] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [inKindDescription, setInKindDescription] = useState('');

  const [staged, setStaged] = useState<StagedEntry[]>([]);
  const [rowErrors, setRowErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── context loading ──
  const loadContext = useCallback(async (dateIso: string) => {
    setContextError(null);
    try {
      const data = await api.get<ContextPayload>(
        functionsPath(GET_DAILY_CONTEXT_ROUTE),
        {
          query: { date: dateIso },
        },
      );
      setContext(data);
    } catch (error) {
      setContextError(
        error instanceof Error ? error.message : 'Failed to load giving data',
      );
    }
  }, []);

  useEffect(() => {
    void loadContext(date);
  }, [date, loadContext]);

  // ── donor autocomplete ──
  useEffect(() => {
    if (selectedDonor || donorQuery.trim().length < 2) {
      setSuggestions([]);
      return undefined;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try {
        const data = await api.get<{ suggestions: DonorSuggestion[] }>(
          functionsPath(SEARCH_DONORS_ROUTE),
          { query: { q: donorQuery.trim() } },
        );
        setSuggestions(data.suggestions ?? []);
        setShowSuggestions(true);
      } catch {
        setSuggestions([]);
      }
    }, 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [donorQuery, selectedDonor]);

  const pickDonor = (suggestion: DonorSuggestion) => {
    setSelectedDonor(suggestion);
    setDonorQuery(suggestion.label);
    setShowSuggestions(false);
  };

  const clearDonor = () => {
    setSelectedDonor(null);
    setDonorQuery('');
    setSuggestions([]);
  };

  // ── staging ──
  const isInKind = method === 'IN_KIND';

  const validateForm = (): string[] => {
    const errors: string[] = [];
    if (!selectedDonor) errors.push('Choose a donor');
    const amountOk = /^\$?\s*\d+(\.\d{1,2})?$/.test(amount.trim()) && Number(amount.replace(/[$,\s]/g, '')) > 0;
    if (!amountOk) errors.push(isInKind ? 'Enter an estimated value' : 'Enter an amount');
    if (isInKind && !inKindDescription.trim()) errors.push('Describe the donated goods');
    if (method === 'CHECK' && !checkNumber.trim()) errors.push('Enter the check number');
    return errors;
  };

  const buildPayload = (): DailyEntryInput => ({
    entryKey: newUuidV4(),
    giftDate: date,
    amountUsd: amount.trim().replace(/[$,\s]/g, ''),
    paymentMethod: method,
    ...(selectedDonor?.type === 'PERSON' ? { personId: selectedDonor.id } : {}),
    ...(selectedDonor?.type === 'COMPANY' ? { companyId: selectedDonor.id } : {}),
    ...(fundId ? { fundId } : {}),
    ...(campaignId ? { fundraisingCampaignId: campaignId } : {}),
    ...(checkNumber.trim() ? { checkNumber: checkNumber.trim() } : {}),
    ...(isInKind && inKindDescription.trim()
      ? { inKindDescription: inKindDescription.trim() }
      : {}),
  });

  const stageCurrentRow = () => {
    const errors = validateForm();
    setRowErrors(errors);
    if (errors.length > 0) return;
    if (staged.length >= MAX_ENTRIES_PER_BATCH) {
      setRowErrors([`Batch limit is ${MAX_ENTRIES_PER_BATCH} gifts — submit first`]);
      return;
    }
    const payload = buildPayload();
    const micros = parseAmountToMicros(payload.amountUsd);
    const label = `${paymentMethodLabel(method)} · ${
      selectedDonor!.label
    } · ${formatMicrosToUsd(micros ?? 0n)}${isInKind ? ` (${inKindDescription.trim().slice(0, 40)})` : ''}`;
    setStaged((rows) => [...rows, { ...payload, localId: newUuidV4(), displayLabel: label }]);
    // Reset for rapid repeat entry; keep date/method/fund/campaign sticky.
    setAmount('');
    setCheckNumber('');
    setInKindDescription('');
    clearDonor();
    setBanner(null);
  };

  // ── submission ──
  const submitBatch = async () => {
    if (staged.length === 0 || submitting) return;
    setSubmitting(true);
    setBanner(null);
    try {
      const payloadEntries: DailyEntryInput[] = staged.map(
        ({ localId: _localId, displayLabel: _displayLabel, ...entry }) => entry,
      );
      const response = await api.post<BatchResponse>(
        functionsPath(CREATE_DAILY_DONATIONS_ROUTE),
        { entries: payloadEntries },
      );
      const failedRows = new Set(
        response.results
          .filter((r: EntryResult) => r.status === 'error')
          .map((r: EntryResult) => r.entryKey),
      );
      setStaged((rows) =>
        rows.filter((row) => failedRows.has(String(row.entryKey))),
      );
      const s = response.summary;
      const parts = [
        `${s.created} gift${s.created === 1 ? '' : 's'} recorded`,
        s.totalCreatedAmountMicros !== '0'
          ? formatMicrosToUsd(s.totalCreatedAmountMicros)
          : null,
        s.duplicates > 0 ? `${s.duplicates} duplicate(s) skipped` : null,
        s.errors > 0 ? `${s.errors} row(s) failed` : null,
      ].filter(Boolean);
      setBanner({
        tone: s.errors > 0 ? 'warn' : 'ok',
        text: parts.join(' · '),
      });
      await loadContext(date);
    } catch (error) {
      setBanner({
        tone: 'warn',
        text: error instanceof Error ? error.message : 'Submission failed',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const totals = context?.day.totals;
  const funds = context?.funds ?? [];
  const campaigns = context?.campaigns ?? [];

  const daySummary = useMemo(() => {
    if (!totals) return '';
    const bits = [
      `${totals.giftCount} gift${totals.giftCount === 1 ? '' : 's'} · ${formatMicrosToUsd(totals.amountMicros)}`,
    ];
    if (totals.inKindCount > 0) bits.push(`${totals.inKindCount} in-kind`);
    return bits.join(' · ');
  }, [totals]);

  return (
    <div className={SCOPE} style={STYLE.root}>
      <style>{RESPONSIVE_CSS}</style>

      {contextError ? (
        <div role="alert" style={STYLE.alert}>
          <span style={{ flex: 1, color: DANGER }}>{contextError}</span>
          <button
            type="button"
            className="ghost"
            onClick={() => void loadContext(date)}
            style={STYLE.ghostButton}
          >
            Retry
          </button>
        </div>
      ) : null}

      <div style={{ ...STYLE.cardHead, marginBottom: CARD_GAP }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minWidth: 0 }}>
          <input
            type="date"
            aria-label="Gift date"
            value={date}
            max={todayLocalDateString()}
            onChange={(e) => {
              const next = e.target.value;
              if (isValidDateString(next)) setDate(next);
            }}
            style={{ ...STYLE.input, width: 170 }}
          />
          <span style={STYLE.note}>{daySummary || 'Loading…'}</span>
        </div>
      </div>

      {banner ? (
        <div
          role="status"
          style={{
            ...STYLE.alert,
            border: 'none',
            fontWeight: 600,
            color: banner.tone === 'ok' ? SUCCESS : WARNING,
            background: tint(banner.tone === 'ok' ? SUCCESS : WARNING),
          }}
        >
          {banner.text}
        </div>
      ) : null}

      <div style={{ ...STYLE.card, marginBottom: CARD_GAP }}>
        <div style={STYLE.cardHead}>
          <div style={{ minWidth: 0 }}>
            <h2 style={STYLE.cardTitle}>Record gifts</h2>
            <div style={STYLE.hint}>
              Press Enter to add a gift to the batch, then type the next one.
            </div>
          </div>
        </div>

        <div className="fields">
          <div className="donor" style={{ position: 'relative', minWidth: 0 }}>
            <span style={STYLE.fieldLabel}>Donor</span>
            {selectedDonor ? (
              <div
                style={{
                  padding: '9px 14px',
                  borderRadius: 'var(--sl-radius-sm)',
                  border: '1px solid var(--sl-hairline-strong)',
                  background: 'var(--sl-surface)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={STYLE.avatar}>{initialOf(selectedDonor.label)}</span>
                  <strong style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedDonor.label}
                  </strong>
                  {selectedDonor.type === 'COMPANY' ? (
                    <span style={{ ...STYLE.pill, color: 'var(--sl-text-secondary)', background: 'var(--sl-bg)' }}>
                      Organization
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={clearDonor}
                    style={STYLE.iconButton}
                    title="Clear donor"
                    aria-label="Clear donor"
                  >
                    ✕
                  </button>
                </div>
                <div
                  data-testid="selected-donor-address"
                  style={{ marginTop: 6, paddingLeft: 30, fontSize: 12, color: 'var(--sl-text-secondary)', lineHeight: 1.35 }}
                >
                  {(selectedDonor.addressLines ?? []).length > 0
                    ? (selectedDonor.addressLines ?? []).map((line) => (
                        <div key={line}>{line}</div>
                      ))
                    : 'No mailing address on file'}
                </div>
              </div>
            ) : (
              <input
                aria-label="Donor"
                placeholder="Search people or organizations…"
                value={donorQuery}
                onChange={(e) => setDonorQuery(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                style={STYLE.input}
              />
            )}
            {showSuggestions && suggestions.length > 0 ? (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 10,
                  marginTop: 4,
                  padding: 4,
                  background: 'var(--sl-bg)',
                  border: '1px solid var(--sl-hairline)',
                  borderRadius: 'var(--sl-radius-sm)',
                  boxShadow: '0 8px 24px rgba(0,0,0,.14)',
                  overflow: 'hidden',
                }}
              >
                {suggestions.map((s) => (
                  <button
                    key={`${s.type}-${s.id}`}
                    data-testid="donor-suggestion"
                    type="button"
                    className="suggestion"
                    onMouseDown={() => pickDonor(s)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      width: '100%',
                      padding: '8px 10px',
                      border: 0,
                      borderRadius: 8,
                      background: 'transparent',
                      color: 'var(--sl-text)',
                      font: 'inherit',
                      fontSize: 13,
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={STYLE.avatar}>{initialOf(s.label)}</span>
                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.label}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <label style={{ minWidth: 0 }}>
            <span style={STYLE.fieldLabel}>{isInKind ? 'Est. value ($)' : 'Amount ($)'}</span>
            <input
              placeholder="0.00"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') stageCurrentRow();
              }}
              style={STYLE.input}
            />
          </label>

          <label style={{ minWidth: 0 }}>
            <span style={STYLE.fieldLabel}>Income stream</span>
            <select value={method} onChange={(e) => setMethod(e.target.value)} style={STYLE.input}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label style={{ minWidth: 0 }}>
            <span style={STYLE.fieldLabel}>Fund</span>
            <select value={fundId} onChange={(e) => setFundId(e.target.value)} style={STYLE.input}>
              <option value="">None</option>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                  {f.isRestricted ? ' (restricted)' : ''}
                </option>
              ))}
            </select>
          </label>

          <label style={{ minWidth: 0 }}>
            <span style={STYLE.fieldLabel}>Campaign</span>
            <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} style={STYLE.input}>
              <option value="">None</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="extras">
          {method === 'CHECK' ? (
            <label style={{ width: 160 }}>
              <span style={STYLE.fieldLabel}>Check #</span>
              <input
                value={checkNumber}
                onChange={(e) => setCheckNumber(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') stageCurrentRow();
                }}
                style={STYLE.input}
              />
            </label>
          ) : null}
          {isInKind ? (
            <label style={{ flex: '1 1 260px', minWidth: 0 }}>
              <span style={STYLE.fieldLabel}>What was donated?</span>
              <input
                placeholder="e.g. 40 cases of water, 12 backpacks"
                value={inKindDescription}
                onChange={(e) => setInKindDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') stageCurrentRow();
                }}
                style={STYLE.input}
              />
            </label>
          ) : null}
          <div style={{ flex: 1 }} />
          <button type="button" className="secondary" onClick={stageCurrentRow} style={STYLE.secondaryButton}>
            + Add to batch
          </button>
        </div>

        {rowErrors.length > 0 ? (
          <div role="alert" style={{ color: DANGER, fontSize: 12, fontWeight: 600, marginTop: 12 }}>
            {rowErrors.join(' · ')}
          </div>
        ) : null}
      </div>

      {staged.length > 0 ? (
        <div style={{ ...STYLE.card, marginBottom: CARD_GAP }}>
          <div style={STYLE.cardHead}>
            <div style={{ minWidth: 0 }}>
              <h2 style={STYLE.cardTitle}>Batch</h2>
              <div style={STYLE.hint}>
                {staged.length} gift{staged.length === 1 ? '' : 's'} ready to record
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="ghost"
                onClick={() => setStaged([])}
                disabled={submitting}
                style={STYLE.ghostButton}
              >
                Clear
              </button>
              <button
                type="button"
                className="primary"
                onClick={submitBatch}
                disabled={submitting}
                style={STYLE.primaryButton}
              >
                {submitting ? 'Recording…' : `Record ${staged.length} gift${staged.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
          {staged.map((row) => (
            <div
              key={row.localId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 0',
                borderBottom: '1px solid var(--sl-hairline)',
              }}
            >
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.displayLabel}
              </span>
              <button
                type="button"
                onClick={() => setStaged((rows) => rows.filter((r) => r.localId !== row.localId))}
                disabled={submitting}
                style={STYLE.iconButton}
                title="Remove from batch"
                aria-label="Remove from batch"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div style={STYLE.card}>
        <div style={STYLE.cardHead}>
          <div style={{ minWidth: 0 }}>
            <h2 style={STYLE.cardTitle}>
              Recorded on {formatShortDate(context?.day.date ?? date)}
            </h2>
            <div style={STYLE.hint}>{daySummary || ' '}</div>
          </div>
        </div>
        {totals && Object.keys(totals.byMethod).length > 0 ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {Object.entries(totals.byMethod).map(([value, bucket]) => (
              <span
                key={value}
                style={{ ...STYLE.pill, color: 'var(--sl-text)', border: '1px solid var(--sl-hairline-strong)' }}
              >
                {paymentMethodLabel(value)}: {bucket.count} × {formatMicrosToUsd(bucket.amountMicros)}
              </span>
            ))}
          </div>
        ) : null}
        {!context ? (
          <div style={STYLE.muted}>Loading…</div>
        ) : context.day.entries.length === 0 ? (
          <div style={STYLE.muted}>No gifts recorded yet for this day.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr>
                <th style={{ ...STYLE.th, width: '30%' }}>Donor</th>
                <th style={STYLE.th}>Gift</th>
                <th style={{ ...STYLE.th, width: '22%' }}>Fund</th>
                <th style={{ ...STYLE.th, width: 110, textAlign: 'right', paddingRight: 0 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {context.day.entries.map((entry) => (
                <tr key={entry.id} className="row">
                  <td style={STYLE.td} title={donorChip(entry)}>
                    <span style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                      <span style={STYLE.avatar}>{initialOf(donorChip(entry))}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{donorChip(entry)}</span>
                    </span>
                  </td>
                  <td style={STYLE.td} title={entryTitle(entry)}>
                    {entryTitle(entry)}
                  </td>
                  <td style={{ ...STYLE.td, color: entry.fund?.name ? 'var(--sl-text)' : 'var(--sl-text-secondary)' }}>
                    {entry.fund?.name ?? EMPTY}
                  </td>
                  <td style={{ ...STYLE.td, textAlign: 'right', paddingRight: 0, fontWeight: 600 }}>
                    {formatMicrosToUsd(entry.amount?.amountMicros ?? '0')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: ENTRY_FRONT_COMPONENT_ID,
  name: 'daily-donation-entry',
  description:
    'Fast daily donation entry across every income stream — money and in-kind — with donor search, batch recording, and a live view of everything logged for the day.',
  component: DailyDonationEntry,
});
