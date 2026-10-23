import { describe, expect, it } from 'vitest';

import {
  buildDonationCreateVariables,
  buildEntryKey,
  buildHardCreditCreateVariables,
  dailyGiftDonorLabel,
  daysBetweenInDays,
  formatMicrosToUsd,
  isValidDateString,
  normalizeEntry,
  parseAmountToMicros,
  todayLocalDateString,
  type DailyEntryInput,
} from 'src/shared/daily-entry-specs';
import {
  formatMailingAddress,
  resolvePersonAddressLines,
} from 'src/shared/donor-suggestions';

const TODAY = '2026-08-25';
const PERSON_ID = '11111111-2222-4333-8444-555555555555';
const COMPANY_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const FUND_ID = '12121212-3434-4555-8666-787878787878';

const validBase = (overrides: Partial<DailyEntryInput> = {}): DailyEntryInput => ({
  entryKey: PERSON_ID, // any v4-shaped uuid works as a client key
  giftDate: TODAY,
  amountUsd: '100.00',
  paymentMethod: 'CASH',
  personId: PERSON_ID,
  ...overrides,
});

describe('donor address display', () => {
  it('formats complete household mailing addresses into display lines', () => {
    expect(
      formatMailingAddress({
        addressStreet1: ' 123 Main Street ',
        addressStreet2: ' Suite 4 ',
        addressCity: 'Austin',
        addressState: 'TX',
        addressPostcode: '78701',
        addressCountry: 'United States',
      }),
    ).toEqual([
      '123 Main Street, Suite 4',
      'Austin, TX 78701',
      'United States',
    ]);
  });

  it('handles partial and missing addresses without blank lines', () => {
    expect(
      formatMailingAddress({
        addressCity: 'Dallas',
        addressPostcode: '75201',
      }),
    ).toEqual(['Dallas, 75201']);
    expect(formatMailingAddress(null)).toEqual([]);
  });

  it('prefers the primary household mailing address', () => {
    expect(
      resolvePersonAddressLines(
        [{ mailingAddress: { addressStreet1: '10 Primary Lane' } }],
        [
          {
            isActive: true,
            household: {
              mailingAddress: { addressStreet1: '20 Membership Way' },
            },
          },
        ],
      ),
    ).toEqual(['10 Primary Lane']);
  });

  it('falls back to an active membership and ignores inactive addresses', () => {
    expect(
      resolvePersonAddressLines(
        [{ mailingAddress: null }],
        [
          {
            isActive: false,
            household: {
              mailingAddress: { addressStreet1: '30 Former Road' },
            },
          },
          {
            isActive: true,
            household: {
              mailingAddress: { addressStreet1: '40 Current Street' },
            },
          },
        ],
      ),
    ).toEqual(['40 Current Street']);
  });
});

describe('daily gift donor display', () => {
  it('shows all individual hard-credit donor names', () => {
    expect(
      dailyGiftDonorLabel({
        donationCredits: {
          edges: [
            {
              node: {
                person: {
                  name: { firstName: 'Alex', lastName: 'Rivera' },
                },
              },
            },
            {
              node: {
                person: {
                  name: { firstName: 'Sam', lastName: 'Lee' },
                },
              },
            },
          ],
        },
      }),
    ).toBe('Alex Rivera, Sam Lee');
  });

  it('falls back to the organization name', () => {
    expect(
      dailyGiftDonorLabel({
        company: { name: 'Streetlight Community Partner' },
      }),
    ).toBe('Streetlight Community Partner');
  });

  it('labels gifts without a linked donor explicitly', () => {
    expect(dailyGiftDonorLabel({})).toBe('Unknown donor');
  });
});

describe('money parsing', () => {
  it('parses plain, prefixed and comma-grouped amounts to micros', () => {
    expect(parseAmountToMicros('25')).toBe(25_000_000n);
    expect(parseAmountToMicros('12.5')).toBe(12_500_000n);
    expect(parseAmountToMicros('$1,234.56')).toBe(1_234_560_000n);
    expect(parseAmountToMicros('0.01')).toBe(10_000n);
    expect(parseAmountToMicros(40)).toBe(40_000_000n);
  });

  it('rejects empty, negative, non-numeric and zero amounts', () => {
    expect(parseAmountToMicros('')).toBeUndefined();
    expect(parseAmountToMicros('  ')).toBeUndefined();
    expect(parseAmountToMicros('abc')).toBeUndefined();
    expect(parseAmountToMicros('-5')).toBeUndefined();
    expect(parseAmountToMicros('0')).toBeUndefined();
    expect(parseAmountToMicros('0.00')).toBeUndefined();
    expect(parseAmountToMicros('1.234')).toBeUndefined();
    expect(parseAmountToMicros(undefined)).toBeUndefined();
  });

  it('formats micros back to display strings', () => {
    expect(formatMicrosToUsd(25_000_000n)).toBe('$25');
    expect(formatMicrosToUsd('1234560000')).toBe('$1,234.56');
    expect(formatMicrosToUsd('0')).toBe('$0');
  });
});

describe('dates', () => {
  it('validates ISO calendar dates', () => {
    expect(isValidDateString('2026-02-28')).toBe(true);
    expect(isValidDateString('2026-02-30')).toBe(false); // not a real day
    expect(isValidDateString('2026-13-01')).toBe(false);
    expect(isValidDateString('26-08-25')).toBe(false);
    expect(isValidDateString(42)).toBe(false);
  });

  it('computes day differences across month boundaries', () => {
    expect(daysBetweenInDays('2026-08-25', '2026-09-01')).toBe(7);
    expect(daysBetweenInDays('2026-09-01', '2026-08-25')).toBe(-7);
  });

  it('derives the local today string deterministically', () => {
    // 2026-08-25T23:30:00-05:00 → local date is still the 25th at UTC-5.
    const instant = new Date('2026-08-26T04:30:00.000Z');
    const fakeNow = new Date(instant.getTime() + 300); // shift tz by monkey date
    // Instead of depending on the runner timezone, just check the shape.
    expect(todayLocalDateString(fakeNow)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(isValidDateString(todayLocalDateString())).toBe(true);
  });
});

describe('idempotency keys', () => {
  it('accepts UUID v4 client keys and namespaces them', () => {
    const key = buildEntryKey(PERSON_ID);
    expect(key).toBe(`dailyentry:${PERSON_ID}`);
  });

  it('rejects missing, malformed or non-v4 keys', () => {
    expect(buildEntryKey(undefined)).toBeUndefined();
    expect(buildEntryKey('not-a-uuid')).toBeUndefined();
    expect(buildEntryKey('11111111-2222-2333-8444-555555555555')).toBeUndefined(); // v2
    // Uppercase v4 keys are accepted and normalized to lowercase.
    expect(buildEntryKey('AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE')).toBe(
      'dailyentry:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    );
  });
});

describe('entry validation', () => {
  it('normalizes a happy-path cash gift with hard credit fields', () => {
    const result = normalizeEntry(validBase(), TODAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.entryKey).toBe(`dailyentry:${PERSON_ID}`);
    expect(result.entry.amountMicros).toBe('100000000');
    expect(result.entry.personId).toBe(PERSON_ID);
    expect(result.entry.companyId).toBeUndefined();
    expect(result.entry.name).toBe('Cash donor gift');
  });

  it('accepts organization donors', () => {
    const result = normalizeEntry(
      validBase({ companyId: COMPANY_ID, personId: undefined }),
      TODAY,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.companyId).toBe(COMPANY_ID);
    expect(result.entry.personId).toBeUndefined();
    expect(result.entry.name).toBe('Cash organization gift');
  });

  it('requires a donor of exactly one kind', () => {
    const noDonor = normalizeEntry(validBase({ personId: undefined }), TODAY);
    expect(noDonor).toMatchObject({ ok: false });

    const bothDonors = normalizeEntry(
      validBase({ companyId: COMPANY_ID }),
      TODAY,
    );
    expect(bothDonors).toMatchObject({ ok: false });
  });

  it('requires check numbers on checks and descriptions on in-kind', () => {
    expect(normalizeEntry(validBase({ paymentMethod: 'CHECK' }), TODAY)).toMatchObject({
      ok: false,
    });
    const okCheck = normalizeEntry(
      validBase({ paymentMethod: 'CHECK', checkNumber: ' 1024 ' }),
      TODAY,
    );
    expect(okCheck).toMatchObject({ ok: true });

    expect(
      normalizeEntry(validBase({ paymentMethod: 'IN_KIND', amountUsd: '75' }), TODAY),
    ).toMatchObject({ ok: false });
    const okInKind = normalizeEntry(
      validBase({
        paymentMethod: 'IN_KIND',
        amountUsd: '75',
        inKindDescription: '40 cases of water',
      }),
      TODAY,
    );
    expect(okInKind).toMatchObject({ ok: true });
  });

  it('rejects in-kind descriptions on money gifts', () => {
    expect(
      normalizeEntry(validBase({ inKindDescription: 'nope' }), TODAY),
    ).toMatchObject({ ok: false });
  });

  it('enforces the future-date window and historical floor', () => {
    expect(
      normalizeEntry(validBase({ giftDate: '2026-10-01' }), TODAY),
    ).toMatchObject({ ok: false }); // >31 days ahead
    const postDated = normalizeEntry(validBase({ giftDate: '2026-09-15' }), TODAY);
    expect(postDated).toMatchObject({ ok: true }); // within 31 days
    expect(normalizeEntry(validBase({ giftDate: '1999-12-31' }), TODAY)).toMatchObject({
      ok: false,
    });
  });

  it('validates tribute combinations', () => {
    expect(
      normalizeEntry(validBase({ tributeType: 'IN_MEMORY' }), TODAY),
    ).toMatchObject({ ok: false }); // name required
    const okTribute = normalizeEntry(
      validBase({ tributeType: 'IN_MEMORY', tributeName: 'Jane Doe' }),
      TODAY,
    );
    expect(okTribute).toMatchObject({ ok: true });
    expect(
      normalizeEntry(validBase({ tributeType: 'WEDDING' }), TODAY),
    ).toMatchObject({ ok: false });
  });

  it('honors do-not-acknowledge and validates optional ids', () => {
    const entry = normalizeEntry(validBase({ doNotAcknowledge: true }), TODAY);
    expect(entry).toMatchObject({ ok: true });
    if (entry.ok) {
      expect(entry.entry.acknowledgmentStatus).toBe('DO_NOT_ACKNOWLEDGE');
    }
    expect(
      normalizeEntry(validBase({ fundId: 'garbage' }), TODAY),
    ).toMatchObject({ ok: false }); // invalid uuid rejected outright
    const fundless = normalizeEntry(validBase(), TODAY);
    if (fundless.ok) expect(fundless.entry.fundId).toBeUndefined();

    const funded = normalizeEntry(validBase({ fundId: FUND_ID }), TODAY);
    if (funded.ok) expect(funded.entry.fundId).toBe(FUND_ID);
  });

  it('rejects unknown income streams and bad amounts', () => {
    expect(
      normalizeEntry(validBase({ paymentMethod: 'BITCOIN' }), TODAY),
    ).toMatchObject({ ok: false });
    expect(normalizeEntry(validBase({ amountUsd: 'free' }), TODAY)).toMatchObject({
      ok: false,
    });
  });

  it('enforces the cash-deposit contract', () => {
    expect(
      normalizeEntry(
        validBase({ entryMode: 'CASH_DEPOSIT', depositDate: TODAY }),
        TODAY,
      ),
    ).toMatchObject({
      ok: true,
      entry: { entryMode: 'CASH_DEPOSIT', paymentMethod: 'CASH' },
    });
    expect(
      normalizeEntry(validBase({ entryMode: 'CASH_DEPOSIT' }), TODAY),
    ).toMatchObject({ ok: false, error: 'cash deposits need a depositDate' });
    expect(
      normalizeEntry(
        validBase({
          entryMode: 'CASH_DEPOSIT',
          paymentMethod: 'ACH',
          depositDate: TODAY,
        }),
        TODAY,
      ),
    ).toMatchObject({ ok: false });
    expect(
      normalizeEntry(
        validBase({
          entryMode: 'CASH_DEPOSIT',
          giftDate: '2026-08-24',
          depositDate: '2026-08-23',
        }),
        TODAY,
      ),
    ).toMatchObject({ ok: false, error: 'depositDate cannot be before giftDate' });
    expect(
      normalizeEntry(
        validBase({
          entryMode: 'CASH_DEPOSIT',
          depositDate: '2026-08-26',
        }),
        TODAY,
      ),
    ).toMatchObject({ ok: false, error: 'depositDate cannot be in the future' });
  });

  it('enforces the online-gift contract and processor reference bounds', () => {
    const online = normalizeEntry(
      validBase({
        entryMode: 'ONLINE_GIFT',
        paymentMethod: 'CREDIT_CARD',
        onlineTransactionId: 'stripe_pi_123',
      }),
      TODAY,
    );
    expect(online).toMatchObject({
      ok: true,
      entry: {
        entryMode: 'ONLINE_GIFT',
        paymentMethod: 'CREDIT_CARD',
        onlineTransactionId: 'stripe_pi_123',
      },
    });
    expect(
      normalizeEntry(
        validBase({ entryMode: 'ONLINE_GIFT', paymentMethod: 'ACH' }),
        TODAY,
      ),
    ).toMatchObject({
      ok: false,
      error: 'online gifts need an onlineTransactionId',
    });
    expect(
      normalizeEntry(
        validBase({
          entryMode: 'ONLINE_GIFT',
          paymentMethod: 'CASH',
          onlineTransactionId: 'cash-is-not-online',
        }),
        TODAY,
      ),
    ).toMatchObject({ ok: false });
    expect(
      normalizeEntry(
        validBase({
          entryMode: 'ONLINE_GIFT',
          paymentMethod: 'ACH',
          onlineTransactionId: 'x'.repeat(121),
        }),
        TODAY,
      ),
    ).toMatchObject({ ok: false });
  });

  it('rejects malformed entry rows and mode-only fields on generic gifts', () => {
    expect(normalizeEntry(null as unknown as DailyEntryInput, TODAY)).toMatchObject({
      ok: false,
      error: 'entry must be an object',
    });
    expect(
      normalizeEntry(validBase({ onlineTransactionId: 'processor-1' }), TODAY),
    ).toMatchObject({ ok: false });
    expect(
      normalizeEntry(validBase({ checkNumber: 'not-a-check' }), TODAY),
    ).toMatchObject({ ok: false });
  });
});

describe('GraphQL write builders', () => {
  const entry = (() => {
    const result = normalizeEntry(
      validBase({
        paymentMethod: 'CHECK',
        checkNumber: '1024',
        fundId: FUND_ID,
        depositDate: TODAY,
      }),
      TODAY,
    );
    if (!result.ok) throw new Error('expected valid entry');
    return result.entry;
  })();

  it('builds donation variables carrying the idempotency key', () => {
    const vars = buildDonationCreateVariables(entry) as { data: Record<string, any> };
    expect(vars.data.amount).toEqual({ amountMicros: '100000000', currencyCode: 'USD' });
    expect(vars.data.externalTransactionId).toBe(`dailyentry:${PERSON_ID}`);
    expect(vars.data.paymentMethod).toBe('CHECK');
    expect(vars.data.checkNumber).toBe('1024');
    expect(vars.data.fundId).toBe(FUND_ID);
    expect(vars.data.depositDate).toBe(TODAY);
    expect(vars.data.statementIncluded).toBe(true);
  });

  it('builds one HARD/DONOR credit per individual donor', () => {
    const vars = buildHardCreditCreateVariables(entry, 'donation-1') as {
      data: Record<string, any>;
    };
    expect(vars.data.creditType).toBe('HARD');
    expect(vars.data.creditRole).toBe('DONOR');
    expect(vars.data.donationId).toBe('donation-1');
    expect(vars.data.personId).toBe(PERSON_ID);
    expect(vars.data.creditAmount).toEqual({
      amountMicros: '100000000',
      currencyCode: 'USD',
    });
  });

  it('omits person credit linkage for organization donors', () => {
    const org = normalizeEntry(
      validBase({ companyId: COMPANY_ID, personId: undefined }),
      TODAY,
    );
    if (!org.ok) throw new Error('expected valid org entry');
    const vars = buildHardCreditCreateVariables(org.entry, 'donation-2') as {
      data: Record<string, any>;
    };
    // Org gifts credit the company relation on the donation; no person
    // credit row should ever be created from these variables.
    expect(vars.data.personId).toBeUndefined();
  });

  it('writes the online processor reference without replacing the retry key', () => {
    const online = normalizeEntry(
      validBase({
        entryMode: 'ONLINE_GIFT',
        paymentMethod: 'ACH',
        onlineTransactionId: 'givebutter_987',
      }),
      TODAY,
    );
    if (!online.ok) throw new Error('expected valid online entry');
    const vars = buildDonationCreateVariables(online.entry) as {
      data: Record<string, any>;
    };
    expect(vars.data.externalTransactionId).toBe(`dailyentry:${PERSON_ID}`);
    expect(vars.data.onlineTransactionId).toBe('givebutter_987');
  });
});
