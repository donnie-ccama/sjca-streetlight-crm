import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('src/logic-functions/workspace-gql', () => ({
  gql: vi.fn(),
}));

import readyForReview from 'src/views/ready-for-review.view';
import socialPostLayout from 'src/page-layouts/social-post.page-layout';
import landingPageLayout from 'src/page-layouts/landing-page.page-layout';
import {
  LANDING_PAGE_OBJECT_ID,
  SOCIAL_POST_OBJECT_ID,
  SOCIAL_POST_READY_FOR_REVIEW_FIELD_ID,
  SOCIAL_POST_STATUS_FIELD_ID,
} from 'src/constants/marketing-identifiers';
import { buildMarketingResults } from 'src/logic-functions/marketing-results.server';
import getMarketingResults from 'src/logic-functions/get-marketing-results.logic-function';
import { gql } from 'src/logic-functions/workspace-gql';
import {
  buildPeopleLists,
  PEOPLE_LIST_LIMIT,
  summarizeResponses,
  type ResultsResponse,
} from 'src/shared/marketing/results';

const base: ResultsResponse = {
  responseType: 'VISIT',
  network: 'FACEBOOK',
  isNewPerson: false,
  gaveEmail: false,
  gavePhone: false,
  gaveSmsConsent: false,
  donationAmountMicros: null,
  donationGiftStatus: null,
  inviteId: null,
  personId: null,
  personName: null,
};

const responses: ResultsResponse[] = [
  { ...base },
  { ...base, network: 'INSTAGRAM' },
  { ...base, responseType: 'GIVE_CLICK', network: 'FACEBOOK' },
  {
    ...base,
    responseType: 'PRAY',
    isNewPerson: true,
    gaveEmail: true,
    gavePhone: true,
    gaveSmsConsent: true,
    personId: 'p1',
    personName: 'Ann Lee',
  },
  {
    ...base,
    responseType: 'VOLUNTEER',
    network: 'INSTAGRAM',
    gaveEmail: true,
    gavePhone: true,
    personId: 'p2',
    personName: 'Bo Ray',
  },
  {
    ...base,
    responseType: 'GIFT',
    network: 'FACEBOOK',
    donationAmountMicros: '25500000',
    personId: 'p1',
    personName: 'Ann Lee',
  },
];

const zero = {
  visits: 0,
  giveClicks: 0,
  invitedVisits: 0,
  invitedGiveClicks: 0,
  invitedSignups: 0,
  pray: 0,
  volunteer: 0,
  emailsCaptured: 0,
  phonesWithSmsConsent: 0,
  newPeople: 0,
  gifts: 0,
  giftTotalMicros: '0',
  giftsFromInvites: 0,
  giftTotalFromInvitesMicros: '0',
  monthlyPlansStarted: 0,
  madeMonthly: 0,
  givingQuestions: 0,
};

describe('summarizeResponses', () => {
  it('counts a fixed list of six responses', () => {
    const { total, byNetwork } = summarizeResponses(responses);

    expect(total).toEqual({
      visits: 2,
      giveClicks: 1,
      invitedVisits: 0,
      invitedGiveClicks: 0,
      invitedSignups: 0,
      pray: 1,
      volunteer: 1,
      emailsCaptured: 2,
      phonesWithSmsConsent: 1,
      newPeople: 1,
      gifts: 1,
      giftTotalMicros: '25500000',
      giftsFromInvites: 0,
      giftTotalFromInvitesMicros: '0',
      monthlyPlansStarted: 0,
      madeMonthly: 0,
      givingQuestions: 0,
    });
    expect(byNetwork.FACEBOOK).toEqual({
      ...zero,
      visits: 1,
      giveClicks: 1,
      pray: 1,
      emailsCaptured: 1,
      phonesWithSmsConsent: 1,
      newPeople: 1,
      gifts: 1,
      giftTotalMicros: '25500000',
    });
    expect(byNetwork.INSTAGRAM).toEqual({
      ...zero,
      visits: 1,
      volunteer: 1,
      emailsCaptured: 1,
    });
  });

  it('counts responses that came from invites', () => {
    const invited = (responseType: ResultsResponse['responseType']) => ({
      ...base,
      responseType,
      inviteId: 'invite-1',
    });
    const { total, byNetwork } = summarizeResponses([
      invited('VISIT'),
      invited('VISIT'),
      invited('GIVE_CLICK'),
      invited('PRAY'),
      invited('VOLUNTEER'),
      invited('GIFT'),
      { ...base, responseType: 'PRAY' },
    ]);

    expect(total).toMatchObject({
      invitedVisits: 2,
      invitedGiveClicks: 1,
      invitedSignups: 2,
      visits: 2,
      pray: 2,
    });
    expect(byNetwork.FACEBOOK).toMatchObject({
      invitedVisits: 2,
      invitedGiveClicks: 1,
      invitedSignups: 2,
    });
    expect(byNetwork.NONE.invitedSignups).toBe(0);
  });

  it('counts gifts from invites and their dollars, skipping refunds', () => {
    const gift = (
      inviteId: string | null,
      donationAmountMicros: string,
      donationGiftStatus: string | null = null,
    ): ResultsResponse => ({
      ...base,
      responseType: 'GIFT',
      inviteId,
      donationAmountMicros,
      donationGiftStatus,
    });
    const { total, byNetwork } = summarizeResponses([
      gift('invite-1', '10000000'),
      gift('invite-2', '2500000'),
      gift('invite-3', '9000000', 'REFUNDED'),
      gift(null, '4000000'),
    ]);

    expect(total).toMatchObject({
      gifts: 3,
      giftTotalMicros: '16500000',
      giftsFromInvites: 2,
      giftTotalFromInvitesMicros: '12500000',
    });
    expect(byNetwork.FACEBOOK.giftTotalFromInvitesMicros).toBe('12500000');
  });

  it('counts giving questions', () => {
    const { total, byNetwork } = summarizeResponses([
      { ...base, responseType: 'GIVING_QUESTION' },
      { ...base, responseType: 'GIVING_QUESTION', network: 'TIKTOK' },
      { ...base, responseType: 'PRAY' },
    ]);

    expect(total.givingQuestions).toBe(2);
    expect(byNetwork.TIKTOK.givingQuestions).toBe(1);
  });

  it('takes monthly plan counts from the pledge counts, for the total only', () => {
    const { total, byNetwork } = summarizeResponses([{ ...base }], 0, {
      monthlyPlansStarted: 4,
      madeMonthly: 1,
    });

    expect(total).toMatchObject({ monthlyPlansStarted: 4, madeMonthly: 1 });
    expect(byNetwork.FACEBOOK).toMatchObject({
      monthlyPlansStarted: 0,
      madeMonthly: 0,
    });
  });

  it('gives every network with no responses all-zero counts', () => {
    const { byNetwork } = summarizeResponses(responses);

    for (const network of ['TIKTOK', 'YOUTUBE', 'OTHER', 'NONE'] as const) {
      expect(byNetwork[network]).toEqual(zero);
    }
    expect(summarizeResponses([]).total).toEqual(zero);
  });

  it('adds gift dollars as BigInt micros', () => {
    const gift = (donationAmountMicros: string | null): ResultsResponse => ({
      ...base,
      responseType: 'GIFT',
      donationAmountMicros,
    });
    const { total } = summarizeResponses([
      gift('9007199254740993000000'),
      gift('1000000'),
      gift(null),
    ]);

    expect(total.gifts).toBe(3);
    expect(total.giftTotalMicros).toBe('9007199254740994000000');
  });
});

describe('refunded gifts', () => {
  const gift = (donationGiftStatus: string): ResultsResponse => ({
    ...base,
    responseType: 'GIFT',
    donationAmountMicros: '5000000',
    donationGiftStatus,
    personId: donationGiftStatus,
    personName: donationGiftStatus,
  });

  it('skips REFUNDED gifts in the count, dollars and people list', () => {
    const rows = [gift('PAID'), gift('REFUNDED')];
    const { total } = summarizeResponses(rows);

    expect(total.gifts).toBe(1);
    expect(total.giftTotalMicros).toBe('5000000');
    expect(buildPeopleLists(rows).total.gifts.people).toEqual([
      { id: 'PAID', name: 'PAID' },
    ]);
  });
});

describe('buildPeopleLists', () => {
  it('lists each person once per count', () => {
    const lists = buildPeopleLists([...responses, responses[3]]);

    expect(lists.total.pray).toEqual({
      total: 1,
      people: [{ id: 'p1', name: 'Ann Lee' }],
    });
    expect(lists.total.emailsCaptured.total).toBe(2);
    expect(lists.total.gifts.people).toEqual([{ id: 'p1', name: 'Ann Lee' }]);
    expect(lists.byNetwork.INSTAGRAM.volunteer.people).toEqual([
      { id: 'p2', name: 'Bo Ray' },
    ]);
    expect(lists.byNetwork.TIKTOK.pray).toEqual({ total: 0, people: [] });
  });

  it('caps a list at 50 people and keeps the full total', () => {
    const many = Array.from({ length: PEOPLE_LIST_LIMIT + 7 }, (_, index) => ({
      ...base,
      responseType: 'PRAY' as const,
      personId: `p${index}`,
      personName: `Person ${index}`,
    }));
    const { pray } = buildPeopleLists(many).total;

    expect(pray.total).toBe(PEOPLE_LIST_LIMIT + 7);
    expect(pray.people).toHaveLength(50);
  });
});

describe('marketing results route', () => {
  const gqlMock = vi.mocked(gql);
  const postId = '11111111-1111-4111-8111-111111111111';
  const pageId = '22222222-2222-4222-8222-222222222222';

  const node = (
    id: string,
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    id,
    responseType: 'VISIT',
    network: 'FACEBOOK',
    isNewPerson: false,
    gaveEmail: false,
    gavePhone: false,
    gaveSmsConsent: false,
    person: null,
    donation: null,
    ...overrides,
  });

  const connection = (
    nodes: Record<string, unknown>[],
    endCursor: string | null,
  ) => ({
    responses: {
      edges: nodes.map((n) => ({ node: n })),
      pageInfo: { hasNextPage: endCursor !== null, endCursor },
    },
  });

  beforeEach(() => {
    gqlMock.mockReset();
  });

  it('declares an authenticated GET route', () => {
    expect(getMarketingResults.config.httpRouteTriggerSettings).toMatchObject({
      path: '/marketing-results',
      httpMethod: 'GET',
      isAuthRequired: true,
    });
  });

  it('refuses a caller without a signed-in person and reads nothing', async () => {
    const response = await getMarketingResults.config.handler(
      { queryStringParameters: { socialPostId: postId } } as never,
      {} as never,
    );

    expect((response as { status?: number }).status).toBe(403);
    expect(gqlMock).not.toHaveBeenCalled();
  });

  it('answers a signed-in person', async () => {
    gqlMock.mockResolvedValueOnce(connection([node('r1')], null));

    const response = await getMarketingResults.config.handler(
      {
        queryStringParameters: { socialPostId: postId },
        userWorkspaceId: 'user-workspace-1',
      } as never,
      {} as never,
    );

    expect((response as { status?: number }).status).toBe(200);
  });

  it.each([
    ['neither id', {}],
    ['both ids', { socialPostId: postId, landingPageId: pageId }],
    ['a malformed id', { socialPostId: 'not-a-uuid' }],
    ['an injected id', { landingPageId: `${pageId}" }) { x` }],
  ])('answers 400 for %s without querying', async (_label, query) => {
    const result = await buildMarketingResults(query);

    expect(result.status).toBe(400);
    expect(gqlMock).not.toHaveBeenCalled();
  });

  it('pages through every Response of a post and summarizes them', async () => {
    gqlMock
      .mockResolvedValueOnce(
        connection(
          [
            node('r1'),
            node('r2', {
              responseType: 'PRAY',
              person: { id: 'p1', name: { firstName: 'Ann', lastName: 'Lee' } },
            }),
          ],
          'cursor-1',
        ),
      )
      .mockResolvedValueOnce(
        connection(
          [
            node('r3', {
              responseType: 'GIFT',
              person: { id: 'p1', name: { firstName: 'Ann', lastName: 'Lee' } },
              donation: { amount: { amountMicros: '10000000' } },
            }),
          ],
          null,
        ),
      );

    const result = await buildMarketingResults({ socialPostId: postId });

    expect(result.status).toBe(200);
    expect(gqlMock).toHaveBeenCalledTimes(2);
    expect(gqlMock.mock.calls[0][1]).toMatchObject({
      filter: { socialPostId: { eq: postId } },
    });
    expect(gqlMock.mock.calls[1][1]).toMatchObject({ after: 'cursor-1' });
    expect(result.body).toMatchObject({
      total: { visits: 1, pray: 1, gifts: 1, giftTotalMicros: '10000000' },
      people: { total: { gifts: { total: 1 } } },
    });
  });

  it('filters by landing page', async () => {
    gqlMock.mockResolvedValueOnce(connection([], null));

    const result = await buildMarketingResults({ landingPageId: pageId });

    expect(result.status).toBe(200);
    expect(gqlMock.mock.calls[0][1]).toMatchObject({
      filter: { landingPageId: { eq: pageId } },
    });
  });

  it('counts invites sent for a landing page', async () => {
    gqlMock
      .mockResolvedValueOnce(connection([], null))
      .mockResolvedValueOnce({ landingPageInvites: { totalCount: 7 } });

    const result = await buildMarketingResults({ landingPageId: pageId });

    expect(result.body).toMatchObject({ invitesSent: 7 });
    expect(gqlMock.mock.calls[1][1]).toMatchObject({
      filter: { landingPageId: { eq: pageId } },
    });
  });

  it('counts monthly plans started and made monthly for a landing page', async () => {
    gqlMock
      .mockResolvedValueOnce(connection([], null))
      .mockResolvedValueOnce({ landingPageInvites: { totalCount: 0 } })
      .mockResolvedValueOnce({ pledges: { totalCount: 5 } })
      .mockResolvedValueOnce({ pledges: { totalCount: 2 } });

    const result = await buildMarketingResults({ landingPageId: pageId });

    expect(result.body).toMatchObject({
      total: { monthlyPlansStarted: 5, madeMonthly: 2 },
    });
    expect(gqlMock.mock.calls[2][1]).toMatchObject({
      filter: {
        landingPageId: { eq: pageId },
        commitmentType: { eq: 'RECURRING' },
      },
    });
    expect(gqlMock.mock.calls[3][1]).toMatchObject({
      filter: {
        landingPageId: { eq: pageId },
        commitmentType: { eq: 'RECURRING' },
        madeMonthlyFromOneTime: { eq: true },
      },
    });
  });

  it('reports no invites for a social post without querying them', async () => {
    gqlMock.mockResolvedValueOnce(connection([], null));

    const result = await buildMarketingResults({ socialPostId: postId });

    expect(result.body).toMatchObject({ invitesSent: 0 });
    expect(gqlMock).toHaveBeenCalledTimes(1);
  });

  it('answers 500 with a generic message and logs the detail', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

    gqlMock.mockRejectedValueOnce(new Error('boom'));

    const result = await buildMarketingResults({ socialPostId: postId });

    expect(result.status).toBe(500);
    expect(JSON.stringify(result.body)).not.toContain('boom');
    expect(errorLog).toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it('stops paging when the cursor does not advance', async () => {
    gqlMock
      .mockResolvedValueOnce(connection([node('r1')], 'same'))
      .mockResolvedValueOnce(connection([node('r2')], 'same'));

    const result = await buildMarketingResults({ socialPostId: postId });

    expect(result.status).toBe(200);
    expect(gqlMock).toHaveBeenCalledTimes(2);
  });

  it('does not count a refunded gift from the query', async () => {
    gqlMock.mockResolvedValueOnce(
      connection(
        [
          node('r1', {
            responseType: 'GIFT',
            donation: {
              giftStatus: 'REFUNDED',
              amount: { amountMicros: '1000000' },
            },
          }),
        ],
        null,
      ),
    );

    const result = await buildMarketingResults({ socialPostId: postId });

    expect(result.body).toMatchObject({
      total: { gifts: 0, giftTotalMicros: '0' },
    });
  });
});

describe('results views', () => {
  it('filters Ready for Review to DRAFT posts flagged for review', () => {
    const { filters } = readyForReview.config;

    expect(
      filters?.map((filter) => filter.fieldMetadataUniversalIdentifier),
    ).toEqual([
      SOCIAL_POST_STATUS_FIELD_ID,
      SOCIAL_POST_READY_FOR_REVIEW_FIELD_ID,
    ]);
    expect(filters?.map((filter) => filter.value)).toEqual([['DRAFT'], 'true']);
  });

  it('puts the results tab on each record page', () => {
    expect(socialPostLayout.config.objectUniversalIdentifier).toBe(
      SOCIAL_POST_OBJECT_ID,
    );
    expect(landingPageLayout.config.objectUniversalIdentifier).toBe(
      LANDING_PAGE_OBJECT_ID,
    );
  });
});
