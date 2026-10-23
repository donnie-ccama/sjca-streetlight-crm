import { describe, expect, it } from 'vitest';

import {
  gqlEnum,
  serializeOperation,
} from 'src/logic-functions/workspace-gql';

describe('workspace-gql serializer', () => {
  it('serializes a nested query selection with filters', () => {
    const q = serializeOperation('query', 'donationCredits', {
      __args: {
        filter: { creditType: { eq: 'HARD' }, personId: { eq: 'P1' } },
        first: 500,
      },
      edges: { node: { id: true, creditAmount: { amountMicros: true } } },
      pageInfo: { hasNextPage: true },
    });
    expect(q).toBe(
      'query { donationCredits(filter: { creditType: { eq: "HARD" }, personId: { eq: "P1" } }, first: 500) { edges { node { id creditAmount { amountMicros } } } pageInfo { hasNextPage } } }',
    );
  });

  it('serializes mutations with input objects and null', () => {
    const m = serializeOperation('mutation', 'updatePerson', {
      __args: {
        id: 'P1',
        data: {
          lifetimeHardGiving: { amountMicros: '5000000', currencyCode: 'USD' },
          firstGiftDate: null,
        },
      },
      id: true,
    });
    expect(m).toBe(
      'mutation { updatePerson(id: "P1", data: { lifetimeHardGiving: { amountMicros: "5000000", currencyCode: "USD" }, firstGiftDate: null }) { id } }',
    );
  });

  it('renders enum markers unquoted and handles arrays', () => {
    const m = serializeOperation('query', 'fundraisingCampaigns', {
      __args: { filter: { status: { in: [gqlEnum('ACTIVE'), gqlEnum('PLANNED')] } } },
      edges: { node: { id: true } },
    });
    expect(m).toBe(
      'query { fundraisingCampaigns(filter: { status: { in: [ACTIVE, PLANNED] } }) { edges { node { id } } } }',
    );
  });
});
