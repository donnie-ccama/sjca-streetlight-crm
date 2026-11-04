import { describe, expect, it } from 'vitest';

import {
  buildMonthlyBars,
  formatCompactUsd,
  formatComputedAt,
  formatShortDate,
  formatUsd,
  percentOf,
  sumGiftCount,
  type MonthlyPoint,
} from 'src/shared/donor-dashboard-specs';

const point = (month: number, micros: string, gifts = 1): MonthlyPoint => ({
  periodLabel: `2026-${String(month).padStart(2, '0')}`,
  sortKey: 202600 + month,
  totalAmountMicros: micros,
  giftCount: gifts,
  donorCount: 1,
});

describe('formatCompactUsd', () => {
  it('abbreviates thousands and millions', () => {
    expect(formatCompactUsd('784120000000')).toBe('$784.1k');
    expect(formatCompactUsd('1250000000000')).toBe('$1.25M');
    expect(formatCompactUsd('387000000')).toBe('$387');
    expect(formatCompactUsd('0')).toBe('$0');
    expect(formatCompactUsd(null)).toBe('—');
  });
});

describe('formatUsd', () => {
  it('groups digits and keeps cents only when present', () => {
    expect(formatUsd('632000000')).toBe('$632');
    expect(formatUsd('84500500000')).toBe('$84,500.50');
    expect(formatUsd(undefined)).toBe('—');
  });
});

describe('formatShortDate', () => {
  it('renders ISO dates as Mon D, YYYY and dashes for null', () => {
    expect(formatShortDate('2020-08-07')).toBe('Aug 7, 2020');
    expect(formatShortDate(null)).toBe('—');
  });
});

describe('formatComputedAt', () => {
  it('renders a timestamp as Mon D, h:mm AM', () => {
    expect(formatComputedAt('2026-11-04T08:15:00.000Z')).toMatch(
      /^Nov [34], \d{1,2}:15 (AM|PM)$/,
    );
    expect(formatComputedAt(null)).toBe('—');
  });
});

describe('percentOf', () => {
  it('rounds to a whole percent and handles zero', () => {
    expect(percentOf(248, 488)).toBe('51%');
    expect(percentOf(5, 0)).toBe('—');
  });
});

describe('sumGiftCount', () => {
  it('adds the gift counts', () => {
    expect(sumGiftCount([point(1, '0', 10), point(2, '0', 162)])).toBe(172);
    expect(sumGiftCount([])).toBe(0);
  });
});

describe('buildMonthlyBars', () => {
  it('always returns 12 bars in month order', () => {
    const bars = buildMonthlyBars([point(10, '133800000000')], 2026, 11);
    expect(bars).toHaveLength(12);
    expect(bars.map((bar) => bar.month)).toEqual([
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ]);
  });

  it('scales the tallest bar to 100 and marks the current month', () => {
    const bars = buildMonthlyBars(
      [point(9, '66900000000'), point(10, '133800000000')],
      2026,
      11,
    );
    expect(bars[9].heightPercent).toBe(100);
    expect(bars[8].heightPercent).toBe(50);
    expect(bars[10].isCurrentMonth).toBe(true);
    expect(bars[9].isCurrentMonth).toBe(false);
  });

  it('marks months without a point as no data', () => {
    const bars = buildMonthlyBars([point(10, '1000000')], 2026, 11);
    expect(bars[0].hasData).toBe(false);
    expect(bars[9].hasData).toBe(true);
  });

  it('does not divide by zero when every month is zero', () => {
    const bars = buildMonthlyBars([point(1, '0'), point(2, '0')], 2026, 2);
    expect(bars.every((bar) => bar.heightPercent === 0)).toBe(true);
  });

  it('ignores points from another year', () => {
    const bars = buildMonthlyBars(
      [{ ...point(3, '5000000'), periodLabel: '2025-03', sortKey: 202503 }],
      2026,
      11,
    );
    expect(bars[2].hasData).toBe(false);
  });
});
