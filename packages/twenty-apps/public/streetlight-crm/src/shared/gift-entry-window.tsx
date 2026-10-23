import { RestApiClient } from 'twenty-client-sdk/rest';
import { useEffect, useRef, useState } from 'react';

import {
  CREATE_DAILY_DONATIONS_ROUTE,
  GET_DAILY_CONTEXT_ROUTE,
  SEARCH_DONORS_ROUTE,
} from 'src/constants/daily-giving-identifiers';
import {
  formatMicrosToUsd,
  normalizeEntry,
  todayLocalDateString,
  type BatchResponse,
  type DailyEntryInput,
  type GiftEntryMode,
  type PaymentMethodValue,
} from 'src/shared/daily-entry-specs';
import type { DonorSuggestion } from 'src/shared/donor-suggestions';

interface EntryContext {
  funds: Array<{ id: string; name: string; isRestricted?: boolean | null }>;
  campaigns: Array<{ id: string; name: string }>;
}

export interface GiftEntryWindowProps {
  mode: Extract<GiftEntryMode, 'CASH_DEPOSIT' | 'ONLINE_GIFT'>;
}

const api = new RestApiClient();
const functionsPath = (path: string): string => `/s${path}`;

const newUuidV4 = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

const colors = {
  accent: '#4f46e5',
  border: '#d1d5db',
  danger: '#b91c1c',
  foreground: '#111827',
  muted: '#6b7280',
  success: '#047857',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  height: 36,
  padding: '0 10px',
  border: `1px solid ${colors.border}`,
  borderRadius: 7,
  boxSizing: 'border-box',
  background: '#fff',
  color: colors.foreground,
  fontSize: 13,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 4,
  color: colors.muted,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
};

const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <label style={{ display: 'block', minWidth: 0 }}>
    <span style={labelStyle}>{label}</span>
    {children}
  </label>
);

export const GiftEntryWindow = ({ mode }: GiftEntryWindowProps) => {
  const today = todayLocalDateString();
  const isCash = mode === 'CASH_DEPOSIT';
  const [giftDate, setGiftDate] = useState(today);
  const [depositDate, setDepositDate] = useState(today);
  const [method, setMethod] = useState<PaymentMethodValue>(
    isCash ? 'CASH' : 'CREDIT_CARD',
  );
  const [amount, setAmount] = useState('');
  const [onlineTransactionId, setOnlineTransactionId] = useState('');
  const [fundId, setFundId] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [context, setContext] = useState<EntryContext | null>(null);
  const [donorQuery, setDonorQuery] = useState('');
  const [donor, setDonor] = useState<DonorSuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<DonorSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [status, setStatus] = useState<
    { tone: 'error' | 'success'; text: string } | undefined
  >();
  const [submitting, setSubmitting] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    api
      .get<EntryContext>(functionsPath(GET_DAILY_CONTEXT_ROUTE), {
        query: { date: giftDate },
      })
      .then((value) => {
        if (active) setContext(value);
      })
      .catch(() => {
        if (active) {
          setStatus({ tone: 'error', text: 'Funds and campaigns could not be loaded.' });
        }
      });
    return () => {
      active = false;
    };
  }, [giftDate]);

  useEffect(() => {
    if (donor || donorQuery.trim().length < 2) {
      setSuggestions([]);
      return undefined;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      api
        .get<{ suggestions: DonorSuggestion[] }>(
          functionsPath(SEARCH_DONORS_ROUTE),
          { query: { q: donorQuery.trim() } },
        )
        .then((value) => {
          setSuggestions(value.suggestions ?? []);
          setShowSuggestions(true);
        })
        .catch(() => setSuggestions([]));
    }, 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [donor, donorQuery]);

  const buildInput = (): DailyEntryInput => ({
    entryKey: newUuidV4(),
    entryMode: mode,
    giftDate,
    depositDate: isCash ? depositDate : undefined,
    amountUsd: amount,
    paymentMethod: isCash ? 'CASH' : method,
    onlineTransactionId: isCash ? undefined : onlineTransactionId,
    ...(donor?.type === 'PERSON' ? { personId: donor.id } : {}),
    ...(donor?.type === 'COMPANY' ? { companyId: donor.id } : {}),
    ...(fundId ? { fundId } : {}),
    ...(campaignId ? { fundraisingCampaignId: campaignId } : {}),
  });

  const submit = async () => {
    if (submitting) return;
    if (!donor) {
      setStatus({ tone: 'error', text: 'Choose a donor.' });
      return;
    }
    if (!amount.trim()) {
      setStatus({ tone: 'error', text: 'Enter the gift amount.' });
      return;
    }
    if (!isCash && !onlineTransactionId.trim()) {
      setStatus({
        tone: 'error',
        text: 'Enter the processor transaction ID.',
      });
      return;
    }
    const input = buildInput();
    const validation = normalizeEntry(input, today);
    if (!validation.ok) {
      setStatus({ tone: 'error', text: validation.error });
      return;
    }
    setSubmitting(true);
    setStatus(undefined);
    try {
      const response = await api.post<BatchResponse>(
        functionsPath(CREATE_DAILY_DONATIONS_ROUTE),
        { entries: [input] },
      );
      const result = response.results[0];
      if (!result || result.status === 'error') {
        setStatus({
          tone: 'error',
          text: result?.message ?? 'The gift could not be recorded.',
        });
        return;
      }
      const verb = result.status === 'duplicate' ? 'Already recorded' : 'Recorded';
      setStatus({
        tone: 'success',
        text: `${verb}: ${formatMicrosToUsd(validation.entry.amountMicros)} for ${donor!.label}.`,
      });
      setAmount('');
      setOnlineTransactionId('');
      setDonor(null);
      setDonorQuery('');
    } catch {
      setStatus({
        tone: 'error',
        text: 'The gift could not be recorded. Check your connection and try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        padding: 16,
        boxSizing: 'border-box',
        color: colors.foreground,
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 17, fontWeight: 650 }}>
          {isCash ? 'Record Cash Deposit' : 'Record Online Gift'}
        </div>
        <div style={{ marginTop: 4, color: colors.muted, fontSize: 12 }}>
          {isCash
            ? 'Record one donor cash gift and the date it reached the bank.'
            : 'Record one card or ACH gift using the processor reference.'}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <Field label="Donor">
          <div style={{ position: 'relative' }}>
            <input
              aria-label="Donor"
              autoComplete="off"
              placeholder="Search people or organizations"
              value={donorQuery}
              onChange={(event) => {
                setDonor(null);
                setDonorQuery(event.target.value);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              style={inputStyle}
            />
            {donor ? (
              <div
                data-testid="selected-donor-address"
                style={{
                  marginTop: 5,
                  padding: '6px 8px',
                  borderRadius: 6,
                  background: '#eef2ff',
                  color: colors.muted,
                  fontSize: 11,
                  lineHeight: 1.4,
                }}
              >
                {(donor.addressLines ?? []).length > 0
                  ? (donor.addressLines ?? []).map((line) => <div key={line}>{line}</div>)
                  : 'No mailing address on file'}
              </div>
            ) : null}
            {showSuggestions && suggestions.length > 0 ? (
              <div
                style={{
                  position: 'absolute',
                  zIndex: 20,
                  top: 40,
                  right: 0,
                  left: 0,
                  overflow: 'hidden',
                  border: `1px solid ${colors.border}`,
                  borderRadius: 7,
                  background: '#fff',
                  boxShadow: '0 6px 18px rgba(0,0,0,0.1)',
                }}
              >
                {suggestions.map((suggestion) => (
                  <button
                    key={`${suggestion.type}-${suggestion.id}`}
                    data-testid="donor-suggestion"
                    type="button"
                    onMouseDown={() => {
                      setDonor(suggestion);
                      setDonorQuery(suggestion.label);
                      setShowSuggestions(false);
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '8px 10px',
                      border: 0,
                      background: '#fff',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 500 }}>{suggestion.label}</div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label={isCash ? 'Received date' : 'Gift date'}>
            <input
              aria-label={isCash ? 'Received date' : 'Gift date'}
              type="date"
              max={today}
              value={giftDate}
              onChange={(event) => setGiftDate(event.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="Amount ($)">
            <input
              aria-label="Amount ($)"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              style={inputStyle}
            />
          </Field>
        </div>

        {isCash ? (
          <Field label="Bank deposit date">
            <input
              aria-label="Bank deposit date"
              type="date"
              min={giftDate}
              max={today}
              value={depositDate}
              onChange={(event) => setDepositDate(event.target.value)}
              style={inputStyle}
            />
          </Field>
        ) : (
          <>
            <Field label="Payment method">
              <select
                aria-label="Payment method"
                value={method}
                onChange={(event) =>
                  setMethod(event.target.value as PaymentMethodValue)
                }
                style={inputStyle}
              >
                <option value="CREDIT_CARD">Credit Card</option>
                <option value="ACH">ACH</option>
              </select>
            </Field>
            <Field label="Processor transaction ID">
              <input
                aria-label="Processor transaction ID"
                maxLength={120}
                placeholder="Required reference from the giving platform"
                value={onlineTransactionId}
                onChange={(event) => setOnlineTransactionId(event.target.value)}
                style={inputStyle}
              />
            </Field>
          </>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Fund">
            <select
              aria-label="Fund"
              value={fundId}
              onChange={(event) => setFundId(event.target.value)}
              style={inputStyle}
            >
              <option value="">No fund</option>
              {(context?.funds ?? []).map((fund) => (
                <option key={fund.id} value={fund.id}>
                  {fund.name}{fund.isRestricted ? ' (restricted)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Campaign">
            <select
              aria-label="Campaign"
              value={campaignId}
              onChange={(event) => setCampaignId(event.target.value)}
              style={inputStyle}
            >
              <option value="">No campaign</option>
              {(context?.campaigns ?? []).map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {status ? (
          <div
            role="status"
            style={{
              padding: '9px 10px',
              borderRadius: 7,
              background: status.tone === 'success' ? '#ecfdf5' : '#fef2f2',
              color: status.tone === 'success' ? colors.success : colors.danger,
              fontSize: 12,
            }}
          >
            {status.text}
          </div>
        ) : null}

        <button
          type="button"
          disabled={submitting}
          onClick={() => void submit()}
          style={{
            height: 38,
            border: 0,
            borderRadius: 7,
            background: submitting ? '#a5b4fc' : colors.accent,
            color: '#fff',
            fontSize: 13,
            fontWeight: 650,
            cursor: submitting ? 'default' : 'pointer',
          }}
        >
          {submitting
            ? 'Recording…'
            : isCash
              ? 'Record Cash Deposit'
              : 'Record Online Gift'}
        </button>
      </div>
    </div>
  );
};
