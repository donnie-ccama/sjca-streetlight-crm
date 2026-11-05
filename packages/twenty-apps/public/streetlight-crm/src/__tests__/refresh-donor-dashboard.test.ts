import { describe, expect, it } from 'vitest';

import { aggregateDonations } from 'src/logic-functions/refresh-donor-dashboard.logic-function';

const gift = (overrides: Record<string, unknown>) => ({
  amount: { amountMicros: '1000000' },
  giftDate: '2026-10-01',
  company: null,
  household: null,
  donationCredits: { edges: [] },
  ...overrides,
});

describe('aggregateDonations', () => {
  it('counts person, company and household donors once each', () => {
    const result = aggregateDonations(
      [
        gift({ donationCredits: { edges: [{ node: { person: { id: 'p1' } } }] } }),
        gift({ company: { id: 'c1' } }),
        gift({ household: { id: 'h1' } }),
        gift({ household: { id: 'h1' } }),
      ],
      '2026-08-01',
    );

    expect(result.individualDonors.size).toBe(1);
    expect(result.companyDonors.size).toBe(1);
    expect(result.householdDonors.size).toBe(1);
    expect(result.activeDonors.size).toBe(3);
    expect(result.monthAgg.get('2026-10')?.donors.size).toBe(3);
    expect(result.totalMicros).toBe(4000000n);
  });

  it('leaves households out of active donors when the gift is older than the cutoff', () => {
    const result = aggregateDonations(
      [gift({ household: { id: 'h1' }, giftDate: '2026-02-01' })],
      '2026-08-01',
    );

    expect(result.householdDonors.size).toBe(1);
    expect(result.activeDonors.size).toBe(0);
  });
});
