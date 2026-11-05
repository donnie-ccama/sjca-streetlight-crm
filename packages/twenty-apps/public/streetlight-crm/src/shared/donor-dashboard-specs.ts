// Shape of the Donor Dashboard context route and the pure formatters the
// front component draws with. Pure TypeScript only: no React, no DOM, no
// Node built-ins.

export const DASHBOARD_LIST_LIMIT = 5;

export type DashboardSnapshot = {
  ytdDonors: number;
  ytdGivingMicros: string;
  individualDonorsYtd: number;
  companyDonorsYtd: number;
  activeDonors90d: number;
  avgGiftMicros: string;
  computedAt: string;
};

export type MonthlyPoint = {
  periodLabel: string;
  sortKey: number;
  totalAmountMicros: string;
  giftCount: number;
  donorCount: number;
};

export type PersonRow = {
  id: string;
  name: string;
  lastGiftDate: string | null;
  lifetimeHardGivingMicros: string;
};

export type PendingDonationRow = {
  id: string;
  name: string;
  giftDate: string | null;
  amountMicros: string;
  donorNames: string;
  companyName: string;
};

export type DonorDashboardContext = {
  snapshot: DashboardSnapshot | null;
  year: number;
  monthly: MonthlyPoint[];
  lapsed: { total: number; rows: PersonRow[] };
  topDonors: { rows: PersonRow[] };
  acknowledgmentsPending: { total: number; rows: PendingDonationRow[] };
};

export type MonthlyBar = {
  month: string;
  amountMicros: string;
  heightPercent: number;
  isCurrentMonth: boolean;
  hasData: boolean;
};

const EMPTY = '—';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const microsToDollars = (
  micros: string | number | null | undefined,
): number | null => {
  if (micros === null || micros === undefined || micros === '') return null;
  const value = Number(micros);
  return Number.isFinite(value) ? value / 1_000_000 : null;
};

const trimZeros = (value: string): string =>
  value.replace(/\.?0+$/, '');

export const formatCompactUsd = (
  micros: string | number | null | undefined,
): string => {
  const dollars = microsToDollars(micros);
  if (dollars === null) return EMPTY;
  const sign = dollars < 0 ? '-' : '';
  const abs = Math.abs(dollars);
  if (abs >= 1_000_000) return `${sign}$${trimZeros((abs / 1_000_000).toFixed(2))}M`;
  if (abs >= 1_000) return `${sign}$${trimZeros((abs / 1_000).toFixed(1))}k`;
  return `${sign}$${Math.round(abs)}`;
};

export const formatUsd = (
  micros: string | number | null | undefined,
): string => {
  const dollars = microsToDollars(micros);
  if (dollars === null) return EMPTY;
  const hasCents = Math.round(Math.abs(dollars) * 100) % 100 !== 0;
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  });
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const formatShortDate = (iso: string | null | undefined): string => {
  if (!iso) return EMPTY;
  // A bare date is a calendar day, so parse it without a timezone shift.
  const date = DATE_ONLY.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  if (Number.isNaN(date.getTime())) return EMPTY;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const formatComputedAt = (iso: string | null | undefined): string => {
  if (!iso) return EMPTY;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return EMPTY;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export const percentOf = (part: number, whole: number): string =>
  whole > 0 ? `${Math.round((part / whole) * 100)}%` : EMPTY;

export const sumGiftCount = (points: MonthlyPoint[]): number =>
  points.reduce((total, point) => total + (point.giftCount ?? 0), 0);

export const buildMonthlyBars = (
  points: MonthlyPoint[],
  year: number,
  currentMonth: number,
): MonthlyBar[] => {
  const byMonth = new Map<number, MonthlyPoint>();
  for (const point of points) {
    if (Math.floor(point.sortKey / 100) === year) {
      byMonth.set(point.sortKey % 100, point);
    }
  }
  const amounts = MONTH_NAMES.map(
    (_, index) => Number(byMonth.get(index + 1)?.totalAmountMicros ?? 0),
  );
  const max = Math.max(0, ...amounts);
  return MONTH_NAMES.map((month, index) => {
    const point = byMonth.get(index + 1);
    const amount = amounts[index];
    return {
      month,
      amountMicros: point?.totalAmountMicros ?? '0',
      heightPercent: max > 0 ? Math.round((amount / max) * 100) : 0,
      isCurrentMonth: index + 1 === currentMonth,
      hasData: point !== undefined,
    };
  });
};
