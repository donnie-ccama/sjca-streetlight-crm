import { beforeEach, describe, expect, it, vi } from 'vitest';

import { processBatch } from 'src/logic-functions/daily-donations.server';
import { gql } from 'src/logic-functions/workspace-gql';

vi.mock('src/logic-functions/workspace-gql', () => ({ gql: vi.fn() }));

const gqlMock = vi.mocked(gql);

const TODAY = '2026-08-25';
const ENTRY_KEY = '11111111-2222-4333-8444-555555555555';
const PERSON_ID = '22222222-3333-4444-8555-666666666666';
const DONATION_ID = '33333333-4444-4555-8666-777777777777';

describe('processBatch mutations', () => {
  beforeEach(() => {
    gqlMock.mockReset();
    gqlMock.mockImplementation(async (query: string) => {
      if (query.includes('createDonationCredit')) {
        return { createDonationCredit: { id: 'credit-id' } };
      }
      if (query.includes('createDonation')) {
        return { createDonation: { id: DONATION_ID } };
      }
      return { donations: { edges: [] } };
    });
  });

  it('declares the workspace schema <Object>CreateInput type names', async () => {
    const response = await processBatch(
      [
        {
          entryKey: ENTRY_KEY,
          giftDate: TODAY,
          amountUsd: '100.00',
          paymentMethod: 'CASH',
          personId: PERSON_ID,
        },
      ],
      TODAY,
    );

    expect(response.summary.created).toBe(1);
    const queries = gqlMock.mock.calls.map(([query]) => query);
    const donationMutation = queries.find((query) =>
      query.includes('createDonation('),
    );
    const creditMutation = queries.find((query) =>
      query.includes('createDonationCredit('),
    );
    expect(donationMutation).toContain('$data: DonationCreateInput!');
    expect(creditMutation).toContain('$data: DonationCreditCreateInput!');
  });
});
