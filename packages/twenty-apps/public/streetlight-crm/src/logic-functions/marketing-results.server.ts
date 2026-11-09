import { gql } from 'src/logic-functions/workspace-gql';
import { formatFullName } from 'src/shared/dashboard-report-specs';
import {
  buildPeopleLists,
  isUuid,
  type PledgeCounts,
  summarizeResponses,
  type ResultsResponse,
} from 'src/shared/marketing/results';
import type { Network, ResponseType } from 'src/shared/marketing/types';

const PAGE_SIZE = 200;

const RESPONSES_QUERY = `query ($filter: ResponseFilterInput, $after: String) {
  responses(filter: $filter, first: ${PAGE_SIZE}, after: $after) {
    edges {
      node {
        id responseType network inviteId isNewPerson gaveEmail gavePhone gaveSmsConsent
        person { id name { firstName lastName } }
        donation { giftStatus amount { amountMicros } }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const INVITES_COUNT_QUERY = `query ($filter: LandingPageInviteFilterInput) {
  landingPageInvites(filter: $filter) { totalCount }
}`;

const PLEDGES_COUNT_QUERY = `query ($filter: PledgeFilterInput) {
  pledges(filter: $filter) { totalCount }
}`;

type ResponseNode = {
  responseType?: ResponseType | null;
  network?: Network | null;
  inviteId?: string | null;
  isNewPerson?: boolean | null;
  gaveEmail?: boolean | null;
  gavePhone?: boolean | null;
  gaveSmsConsent?: boolean | null;
  person?: {
    id?: string | null;
    name?: { firstName?: string | null; lastName?: string | null } | null;
  } | null;
  donation?: {
    giftStatus?: string | null;
    amount?: { amountMicros?: string | null } | null;
  } | null;
};

export type MarketingResultsOutcome = { status: number; body: unknown };

const toResultsResponse = (node: ResponseNode): ResultsResponse => ({
  responseType: node.responseType ?? 'VISIT',
  network: node.network ?? 'NONE',
  isNewPerson: node.isNewPerson === true,
  gaveEmail: node.gaveEmail === true,
  gavePhone: node.gavePhone === true,
  gaveSmsConsent: node.gaveSmsConsent === true,
  donationAmountMicros: node.donation?.amount?.amountMicros ?? null,
  donationGiftStatus: node.donation?.giftStatus ?? null,
  inviteId: node.inviteId ?? null,
  personId: node.person?.id ?? null,
  personName: formatFullName(node.person?.name) || null,
});

const loadAllResponses = async (
  filter: Record<string, unknown>,
): Promise<ResultsResponse[]> => {
  const rows: ResultsResponse[] = [];
  let after: string | null = null;

  for (;;) {
    const data: Record<string, any> = await gql(RESPONSES_QUERY, {
      filter,
      after,
    });
    const connection = data.responses;

    for (const edge of connection?.edges ?? []) {
      if (edge?.node) rows.push(toResultsResponse(edge.node));
    }

    if (!connection?.pageInfo?.hasNextPage || !connection.pageInfo.endCursor) {
      return rows;
    }

    // A repeated cursor means the server is not advancing; stop instead of looping.
    if (connection.pageInfo.endCursor === after) return rows;

    after = connection.pageInfo.endCursor;
  }
};

const countInvites = async (landingPageId: string): Promise<number> => {
  const data: Record<string, any> = await gql(INVITES_COUNT_QUERY, {
    filter: { landingPageId: { eq: landingPageId } },
  });

  return data?.landingPageInvites?.totalCount ?? 0;
};

const countMonthlyPlans = async (
  landingPageId: string,
): Promise<PledgeCounts> => {
  const filter = {
    landingPageId: { eq: landingPageId },
    commitmentType: { eq: 'RECURRING' },
  };
  const started: Record<string, any> = await gql(PLEDGES_COUNT_QUERY, {
    filter,
  });
  const madeMonthly: Record<string, any> = await gql(PLEDGES_COUNT_QUERY, {
    filter: { ...filter, madeMonthlyFromOneTime: { eq: true } },
  });

  return {
    monthlyPlansStarted: started?.pledges?.totalCount ?? 0,
    madeMonthly: madeMonthly?.pledges?.totalCount ?? 0,
  };
};

const badRequest = (error: string): MarketingResultsOutcome => ({
  status: 400,
  body: { error },
});

export const buildMarketingResults = async (
  query: Record<string, string | undefined>,
): Promise<MarketingResultsOutcome> => {
  const socialPostId = query.socialPostId ?? '';
  const landingPageId = query.landingPageId ?? '';

  if ((socialPostId === '') === (landingPageId === '')) {
    return badRequest('Pass exactly one of socialPostId or landingPageId');
  }

  const [filterKey, id] =
    socialPostId !== ''
      ? ['socialPostId', socialPostId]
      : ['landingPageId', landingPageId];

  if (!isUuid(id)) return badRequest(`${filterKey} must be a UUID`);

  try {
    const responses = await loadAllResponses({ [filterKey]: { eq: id } });

    const invitesSent = landingPageId !== '' ? await countInvites(id) : 0;

    const pledgeCounts =
      landingPageId !== '' ? await countMonthlyPlans(id) : undefined;

    return {
      status: 200,
      body: {
        ...summarizeResponses(responses, invitesSent, pledgeCounts),
        people: buildPeopleLists(responses),
      },
    };
  } catch (error) {
    console.error('marketing results failed', error);

    return { status: 500, body: { error: 'Results could not be loaded' } };
  }
};
