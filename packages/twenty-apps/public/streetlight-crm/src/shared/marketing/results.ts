import type { Network, ResponseType } from 'src/shared/marketing/types';

export type ResultCounts = {
  visits: number;
  giveClicks: number;
  invitedVisits: number;
  invitedGiveClicks: number;
  invitedSignups: number;
  pray: number;
  volunteer: number;
  emailsCaptured: number;
  phonesWithSmsConsent: number;
  newPeople: number;
  gifts: number;
  giftTotalMicros: string;
  giftsFromInvites: number;
  giftTotalFromInvitesMicros: string;
  monthlyPlansStarted: number;
  madeMonthly: number;
  givingQuestions: number;
};

export type PledgeCounts = Pick<
  ResultCounts,
  'monthlyPlansStarted' | 'madeMonthly'
>;

export type ResponseSummaryInput = {
  responseType: ResponseType;
  network: Network;
  isNewPerson: boolean;
  gaveEmail: boolean;
  gavePhone: boolean;
  gaveSmsConsent: boolean;
  donationAmountMicros: string | null;
  donationGiftStatus: string | null;
  inviteId: string | null;
};

export type ResultsResponse = ResponseSummaryInput & {
  personId: string | null;
  personName: string | null;
};

export type ResultsSummary = {
  invitesSent: number;
  total: ResultCounts;
  byNetwork: Record<Network, ResultCounts>;
};

export const NETWORKS: Network[] = [
  'FACEBOOK',
  'INSTAGRAM',
  'TIKTOK',
  'YOUTUBE',
  'OTHER',
  'NONE',
];

export const PEOPLE_LIST_LIMIT = 50;

// VISIT and GIVE_CLICK carry no person, so they have no people list.
export const PEOPLE_COUNT_KEYS = [
  'pray',
  'volunteer',
  'emailsCaptured',
  'phonesWithSmsConsent',
  'newPeople',
  'gifts',
] as const;

export type PeopleCountKey = (typeof PEOPLE_COUNT_KEYS)[number];

// The refund path only flips Donation.giftStatus, so refunded gifts are skipped here.
const isCountedGift = (response: ResponseSummaryInput): boolean =>
  response.responseType === 'GIFT' &&
  response.donationGiftStatus !== 'REFUNDED';

type InvitedCountKey = 'invitedVisits' | 'invitedGiveClicks' | 'invitedSignups';

// Counts that come from Response rows. The plan counts come from Pledges.
type ResponseCountKey =
  | PeopleCountKey
  | 'visits'
  | 'giveClicks'
  | 'giftsFromInvites'
  | 'givingQuestions'
  | InvitedCountKey;

const COUNT_PREDICATES: Record<
  ResponseCountKey,
  (response: ResponseSummaryInput) => boolean
> = {
  visits: (response) => response.responseType === 'VISIT',
  giveClicks: (response) => response.responseType === 'GIVE_CLICK',
  invitedVisits: (response) =>
    response.responseType === 'VISIT' && response.inviteId !== null,
  invitedGiveClicks: (response) =>
    response.responseType === 'GIVE_CLICK' && response.inviteId !== null,
  invitedSignups: (response) =>
    (response.responseType === 'PRAY' ||
      response.responseType === 'VOLUNTEER') &&
    response.inviteId !== null,
  pray: (response) => response.responseType === 'PRAY',
  volunteer: (response) => response.responseType === 'VOLUNTEER',
  emailsCaptured: (response) => response.gaveEmail,
  phonesWithSmsConsent: (response) =>
    response.gavePhone && response.gaveSmsConsent,
  newPeople: (response) => response.isNewPerson,
  gifts: isCountedGift,
  giftsFromInvites: (response) =>
    isCountedGift(response) && response.inviteId !== null,
  givingQuestions: (response) => response.responseType === 'GIVING_QUESTION',
};

const emptyCounts = (): ResultCounts => ({
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
});

const countResponses = (responses: ResponseSummaryInput[]): ResultCounts => {
  const counts = emptyCounts();
  let giftTotalMicros = BigInt(0);
  let giftTotalFromInvitesMicros = BigInt(0);

  for (const response of responses) {
    for (const key of Object.keys(COUNT_PREDICATES) as ResponseCountKey[]) {
      if (COUNT_PREDICATES[key](response)) counts[key] += 1;
    }

    if (isCountedGift(response) && response.donationAmountMicros) {
      giftTotalMicros += BigInt(response.donationAmountMicros);

      if (response.inviteId !== null) {
        giftTotalFromInvitesMicros += BigInt(response.donationAmountMicros);
      }
    }
  }

  counts.giftTotalMicros = giftTotalMicros.toString();
  counts.giftTotalFromInvitesMicros = giftTotalFromInvitesMicros.toString();

  return counts;
};

export const summarizeResponses = (
  responses: ResponseSummaryInput[],
  invitesSent = 0,
  pledgeCounts: PledgeCounts = { monthlyPlansStarted: 0, madeMonthly: 0 },
): ResultsSummary => ({
  invitesSent,
  // Pledges carry no network, so only the total shows them.
  total: { ...countResponses(responses), ...pledgeCounts },
  byNetwork: Object.fromEntries(
    NETWORKS.map((network) => [
      network,
      countResponses(
        responses.filter((response) => response.network === network),
      ),
    ]),
  ) as Record<Network, ResultCounts>,
});

export type ResultsPerson = { id: string; name: string };

export type PeopleList = { total: number; people: ResultsPerson[] };

export type PeopleLists = Record<PeopleCountKey, PeopleList>;

const UNNAMED_PERSON = 'Unnamed person';

const listPeople = (
  responses: ResultsResponse[],
  key: PeopleCountKey,
): PeopleList => {
  const people = new Map<string, ResultsPerson>();

  for (const response of responses) {
    if (response.personId === null || !COUNT_PREDICATES[key](response))
      continue;

    if (!people.has(response.personId)) {
      people.set(response.personId, {
        id: response.personId,
        name: response.personName || UNNAMED_PERSON,
      });
    }
  }

  return {
    total: people.size,
    people: [...people.values()].slice(0, PEOPLE_LIST_LIMIT),
  };
};

const buildLists = (responses: ResultsResponse[]): PeopleLists =>
  Object.fromEntries(
    PEOPLE_COUNT_KEYS.map((key) => [key, listPeople(responses, key)]),
  ) as PeopleLists;

export const buildPeopleLists = (
  responses: ResultsResponse[],
): { total: PeopleLists; byNetwork: Record<Network, PeopleLists> } => ({
  total: buildLists(responses),
  byNetwork: Object.fromEntries(
    NETWORKS.map((network) => [
      network,
      buildLists(responses.filter((response) => response.network === network)),
    ]),
  ) as Record<Network, PeopleLists>,
});

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value);

export const MARKETING_RESULTS_ROUTE_PATH = '/marketing-results';
