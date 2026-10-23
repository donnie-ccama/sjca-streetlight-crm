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

const COLORS = {
  border: '#e5e7eb',
  muted: '#6b7280',
  fg: '#111827',
  accent: '#4f46e5',
  accentSoft: '#eef2ff',
  danger: '#dc2626',
  success: '#059669',
};

const inputStyle: React.CSSProperties = {
  height: 32,
  padding: '0 8px',
  borderRadius: 6,
  border: `1px solid ${COLORS.border}`,
  fontSize: 13,
  color: COLORS.fg,
  background: '#ffffff',
  boxSizing: 'border-box',
  minWidth: 0,
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.4px',
  textTransform: 'uppercase',
  color: COLORS.muted,
  marginBottom: 2,
};

const buttonStyle = (primary: boolean): React.CSSProperties => ({
  height: 32,
  padding: '0 14px',
  borderRadius: 6,
  border: primary ? `1px solid ${COLORS.accent}` : `1px solid ${COLORS.border}`,
  background: primary ? COLORS.accent : '#ffffff',
  color: primary ? '#ffffff' : COLORS.fg,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
});

const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 8px',
  borderRadius: 999,
  background: COLORS.accentSoft,
  color: COLORS.accent,
  fontSize: 11,
  fontWeight: 500,
  whiteSpace: 'nowrap',
};

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
        CREATE_DAILY_DONATIONS_ROUTE,
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        height: '100%',
        width: '100%',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        color: COLORS.fg,
        boxSizing: 'border-box',
        padding: 12,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>Daily Giving</span>
        <input
          type="date"
          value={date}
          max={todayLocalDateString()}
          onChange={(e) => {
            const next = e.target.value;
            if (isValidDateString(next)) setDate(next);
          }}
          style={{ ...inputStyle, width: 150 }}
        />
        {daySummary ? (
          <span style={{ ...chipStyle }}>{daySummary}</span>
        ) : null}
        <div style={{ marginLeft: 'auto' }} />
        {contextError ? (
          <span style={{ color: COLORS.danger, fontSize: 12 }}>{contextError}</span>
        ) : null}
      </div>

      {/* Banner */}
      {banner ? (
        <div
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            fontSize: 12,
            background: banner.tone === 'ok' ? '#ecfdf5' : '#fffbeb',
            border: `1px solid ${banner.tone === 'ok' ? '#a7f3d0' : '#fde68a'}`,
            color: banner.tone === 'ok' ? COLORS.success : '#92400e',
          }}
        >
          {banner.text}
        </div>
      ) : null}

      {/* Entry form */}
      <div
        style={{
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          background: '#fafafa',
        }}
      >
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 180px', position: 'relative', minWidth: 160 }}>
            <div style={labelStyle}>Donor</div>
            {selectedDonor ? (
              <div
                style={{
                  padding: '5px 8px',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 6,
                  background: COLORS.accentSoft,
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <strong style={{ flex: 1 }}>
                    {selectedDonor.type === 'COMPANY' ? '🏢 ' : ''}
                    {selectedDonor.label}
                  </strong>
                  <button
                    onClick={clearDonor}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: COLORS.muted, padding: 0 }}
                    title="Clear donor"
                  >
                    ✕
                  </button>
                </div>
                <div
                  data-testid="selected-donor-address"
                  style={{ marginTop: 2, color: COLORS.muted, lineHeight: 1.35 }}
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
                placeholder="Search people or organizations…"
                value={donorQuery}
                onChange={(e) => setDonorQuery(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                style={{ ...inputStyle, width: '100%' }}
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
                  background: '#fff',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 6,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  overflow: 'hidden',
                }}
              >
                {suggestions.map((s) => (
                  <button
                    key={`${s.type}-${s.id}`}
                    data-testid="donor-suggestion"
                    type="button"
                    onMouseDown={() => pickDonor(s)}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '6px 10px',
                      border: 0,
                      background: '#fff',
                      font: 'inherit',
                      fontSize: 13,
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#f3f4f6';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div style={{ fontWeight: 500 }}>{s.label}</div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div style={{ width: 110 }}>
            <div style={labelStyle}>{isInKind ? 'Est. value ($)' : 'Amount ($)'}</div>
            <input
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') stageCurrentRow();
              }}
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>

          <div style={{ width: 130 }}>
            <div style={labelStyle}>Income stream</div>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              style={{ ...inputStyle, width: '100%' }}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ width: 170 }}>
            <div style={labelStyle}>Fund</div>
            <select
              value={fundId}
              onChange={(e) => setFundId(e.target.value)}
              style={{ ...inputStyle, width: '100%' }}
            >
              <option value="">— none —</option>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}{f.isRestricted ? ' 🔒' : ''}
                </option>
              ))}
            </select>
          </div>

          <div style={{ width: 170 }}>
            <div style={labelStyle}>Campaign</div>
            <select
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              style={{ ...inputStyle, width: '100%' }}
            >
              <option value="">— none —</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {method === 'CHECK' ? (
            <div style={{ width: 120 }}>
              <div style={labelStyle}>Check #</div>
              <input
                value={checkNumber}
                onChange={(e) => setCheckNumber(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') stageCurrentRow();
                }}
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
          ) : null}
          {isInKind ? (
            <div style={{ flex: '1 1 240px' }}>
              <div style={labelStyle}>What was donated?</div>
              <input
                placeholder="e.g. 40 cases of water, 12 backpacks"
                value={inKindDescription}
                onChange={(e) => setInKindDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') stageCurrentRow();
                }}
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
          ) : (
            <div style={{ flex: 1, fontSize: 11, color: COLORS.muted }}>
              Tip: press Enter to add this gift to the batch, then keep typing the next one.
            </div>
          )}
          <button onClick={stageCurrentRow} style={buttonStyle(false)}>
            + Add to batch
          </button>
        </div>

        {rowErrors.length > 0 ? (
          <div style={{ color: COLORS.danger, fontSize: 12 }}>
            {rowErrors.join(' · ')}
          </div>
        ) : null}
      </div>

      {/* Batch strip */}
      {staged.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>
              Batch ({staged.length})
            </span>
            <button onClick={submitBatch} disabled={submitting} style={buttonStyle(true)}>
              {submitting ? 'Recording…' : `Record ${staged.length} gift${staged.length === 1 ? '' : 's'}`}
            </button>
            <button
              onClick={() => setStaged([])}
              disabled={submitting}
              style={{ ...buttonStyle(false), borderColor: 'transparent', color: COLORS.muted }}
            >
              Clear
            </button>
          </div>
          {staged.map((row) => (
            <div
              key={row.localId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                padding: '3px 8px',
                borderRadius: 6,
                background: COLORS.accentSoft,
              }}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.displayLabel}
              </span>
              <button
                onClick={() => setStaged((rows) => rows.filter((r) => r.localId !== row.localId))}
                disabled={submitting}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: COLORS.muted, padding: 0 }}
                title="Remove from batch"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* Logged today */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
          Recorded on {context?.day.date ?? date}
        </div>
        {!context ? (
          <span style={{ fontSize: 12, color: COLORS.muted }}>Loading…</span>
        ) : context.day.entries.length === 0 ? (
          <span style={{ fontSize: 12, color: COLORS.muted }}>
            No gifts recorded yet for this day.
          </span>
        ) : (
          <div style={{ overflowY: 'auto', minHeight: 0 }}>
            {totals && Object.keys(totals.byMethod).length > 0 ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '2px 0 6px' }}>
                {Object.entries(totals.byMethod).map(([value, bucket]) => (
                  <span key={value} style={chipStyle}>
                    {paymentMethodLabel(value)}: {bucket.count} × {formatMicrosToUsd(bucket.amountMicros)}
                  </span>
                ))}
              </div>
            ) : null}
            {context.day.entries.map((entry) => (
              <div
                key={entry.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  padding: '4px 2px',
                  borderBottom: `1px solid ${COLORS.border}`,
                }}
              >
                <span style={{ width: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: COLORS.muted }}>
                  {donorChip(entry)}
                </span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entryTitle(entry)}
                </span>
                {entry.fund?.name ? (
                  <span style={{ color: COLORS.muted, whiteSpace: 'nowrap' }}>{entry.fund.name}</span>
                ) : null}
                <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {formatMicrosToUsd(entry.amount?.amountMicros ?? '0')}
                </span>
              </div>
            ))}
          </div>
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
