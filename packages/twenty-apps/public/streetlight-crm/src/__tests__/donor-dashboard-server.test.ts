import { describe, expect, it } from 'vitest';

import {
  currentYearMonthly,
  hardCreditDonorNames,
  oldestDateFirst,
  toPendingDonationRow,
  toPersonRow,
  toSnapshot,
} from 'src/logic-functions/donor-dashboard.server';

describe('toSnapshot', () => {
  it('returns null for a missing node and flattens money', () => {
    expect(toSnapshot(null)).toBeNull();
    expect(
      toSnapshot({
        ytdDonors: 488,
        ytdGiving: { amountMicros: '784120000000' },
        individualDonorsYtd: 438,
        companyDonorsYtd: 50,
        activeDonors90d: 248,
        avgGift: { amountMicros: '387000000' },
        computedAt: '2026-11-04T08:15:00.000Z',
      }),
    ).toEqual({
      ytdDonors: 488,
      ytdGivingMicros: '784120000000',
      individualDonorsYtd: 438,
      companyDonorsYtd: 50,
      activeDonors90d: 248,
      avgGiftMicros: '387000000',
      computedAt: '2026-11-04T08:15:00.000Z',
    });
  });
});

describe('toPersonRow', () => {
  it('joins the name and defaults missing money to 0', () => {
    expect(
      toPersonRow({
        id: 'p1',
        name: { firstName: 'Dale', lastName: 'Scott' },
        lastGiftDate: null,
      }),
    ).toEqual({
      id: 'p1',
      name: 'Dale Scott',
      lastGiftDate: null,
      lifetimeHardGivingMicros: '0',
    });
  });
});

describe('toPendingDonationRow', () => {
  it('lists hard-credit donors, then the company, then the donation name', () => {
    const base = {
      id: 'd1',
      name: 'Jimmie Hall 2026-06-03',
      giftDate: '2026-06-03',
      amount: { amountMicros: '632000000' },
    };
    expect(
      toPendingDonationRow({
        ...base,
        donationCredits: {
          edges: [
            {
              node: {
                creditType: 'HARD',
                person: { name: { firstName: 'Jimmie', lastName: 'Hall' } },
              },
            },
          ],
        },
      }).donorNames,
    ).toBe('Jimmie Hall');
    expect(
      toPendingDonationRow({ ...base, company: { name: 'Acme' } }),
    ).toMatchObject({ donorNames: '', companyName: 'Acme' });
    expect(toPendingDonationRow(base)).toMatchObject({
      donorNames: '',
      companyName: '',
      name: 'Jimmie Hall 2026-06-03',
    });
  });
});

describe('hardCreditDonorNames', () => {
  it('skips soft credits and joins with a semicolon', () => {
    expect(
      hardCreditDonorNames({
        id: 'd',
        donationCredits: {
          edges: [
            { node: { creditType: 'HARD', person: { name: { firstName: 'A', lastName: 'One' } } } },
            { node: { creditType: 'SOFT', person: { name: { firstName: 'B', lastName: 'Two' } } } },
            { node: { creditType: 'HARD', person: { name: { firstName: 'C', lastName: 'Three' } } } },
          ],
        },
      }),
    ).toBe('A One; C Three');
  });
});

describe('oldestDateFirst', () => {
  it('sorts nulls last', () => {
    expect(['2021-01-03', null, '2020-08-07'].sort(oldestDateFirst)).toEqual([
      '2020-08-07',
      '2021-01-03',
      null,
    ]);
  });
});

describe('currentYearMonthly', () => {
  it('keeps only the given year, oldest month first', () => {
    const points = currentYearMonthly(
      [
        { periodLabel: '2026-10', sortKey: 202610, totalAmount: { amountMicros: '5' } },
        { periodLabel: '2025-12', sortKey: 202512, totalAmount: { amountMicros: '9' } },
        { periodLabel: '2026-01', sortKey: 202601, totalAmount: { amountMicros: '1' } },
      ],
      2026,
    );
    expect(points.map((point) => point.periodLabel)).toEqual(['2026-01', '2026-10']);
    expect(points[0].totalAmountMicros).toBe('1');
  });
});
