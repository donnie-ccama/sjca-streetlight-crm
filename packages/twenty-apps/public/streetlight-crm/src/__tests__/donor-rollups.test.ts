import { describe, expect, it } from 'vitest';

import {
  computeRollup,
  groupRollupsByPerson,
  type CreditRow,
} from 'src/logic-functions/donor-rollups';

const PERSON_A = '11111111-2222-4333-8444-555555555555';
const PERSON_B = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const CURRENT_YEAR = 2026;

const credit = (overrides: Partial<CreditRow>): CreditRow => ({
  personId: PERSON_A,
  amountMicros: '0',
  currencyCode: 'USD',
  ...overrides,
});

describe('computeRollup', () => {
  it('should total giving by calendar year for LYBUNT and SYBUNT', () => {
    const rollup = computeRollup(
      [
        credit({ amountMicros: '100000000', giftDate: '2026-03-01' }),
        credit({ amountMicros: '50000000', giftDate: '2026-09-15' }),
        credit({ amountMicros: '250000000', giftDate: '2025-12-31' }),
        credit({ amountMicros: '75000000', giftDate: '2023-06-01' }),
      ],
      CURRENT_YEAR,
    );

    expect(rollup.lifetimeHardGivingMicros).toBe(475000000n);
    expect(rollup.givingThisYearMicros).toBe(150000000n);
    expect(rollup.givingLastYearMicros).toBe(250000000n);
    expect(rollup.largestGiftMicros).toBe(250000000n);
    expect(rollup.creditCount).toBe(4);
    expect(rollup.firstGiftDate).toBe('2023-06-01');
    expect(rollup.lastGiftDate).toBe('2026-09-15');
    expect(rollup.lastGiftAmountMicros).toBe(50000000n);
  });

  it('should sum same-day gifts into the last gift amount', () => {
    const rollup = computeRollup(
      [
        credit({ amountMicros: '20000000', giftDate: '2026-10-01' }),
        credit({ amountMicros: '30000000', giftDate: '2026-10-01' }),
      ],
      CURRENT_YEAR,
    );

    expect(rollup.lastGiftAmountMicros).toBe(50000000n);
  });

  it('should leave out refunded, written-off, and pending gifts', () => {
    const rollup = computeRollup(
      [
        credit({ amountMicros: '100000000', giftDate: '2026-01-10' }),
        credit({
          amountMicros: '900000000',
          giftDate: '2026-02-10',
          giftStatus: 'REFUNDED',
        }),
        credit({
          amountMicros: '900000000',
          giftDate: '2026-03-10',
          giftStatus: 'WRITTEN_OFF',
        }),
        credit({
          amountMicros: '900000000',
          giftDate: '2026-04-10',
          giftStatus: 'PENDING',
        }),
        credit({
          amountMicros: '40000000',
          giftDate: '2026-05-10',
          giftStatus: 'PAID',
        }),
      ],
      CURRENT_YEAR,
    );

    expect(rollup.lifetimeHardGivingMicros).toBe(140000000n);
    expect(rollup.creditCount).toBe(2);
    expect(rollup.lastGiftDate).toBe('2026-05-10');
  });

  it('should return empty totals when there are no counted gifts', () => {
    const rollup = computeRollup([], CURRENT_YEAR);

    expect(rollup.lifetimeHardGivingMicros).toBe(0n);
    expect(rollup.givingThisYearMicros).toBe(0n);
    expect(rollup.largestGiftMicros).toBe(0n);
    expect(rollup.lastGiftAmountMicros).toBe(0n);
    expect(rollup.creditCount).toBe(0);
    expect(rollup.lastGiftDate).toBeUndefined();
  });
});

describe('groupRollupsByPerson', () => {
  it('should compute one rollup per person', () => {
    const rollups = groupRollupsByPerson(
      [
        credit({ amountMicros: '10000000', giftDate: '2026-01-01' }),
        credit({
          personId: PERSON_B,
          amountMicros: '30000000',
          giftDate: '2025-01-01',
        }),
        credit({ amountMicros: '20000000', giftDate: '2025-05-01' }),
      ],
      CURRENT_YEAR,
    );

    expect(rollups.get(PERSON_A)?.lifetimeHardGivingMicros).toBe(30000000n);
    expect(rollups.get(PERSON_A)?.givingLastYearMicros).toBe(20000000n);
    expect(rollups.get(PERSON_B)?.givingThisYearMicros).toBe(0n);
    expect(rollups.get(PERSON_B)?.givingLastYearMicros).toBe(30000000n);
  });
});
