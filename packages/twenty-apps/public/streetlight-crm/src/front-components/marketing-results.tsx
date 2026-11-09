import { useCallback, useEffect, useRef, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import {
  useRecordId,
  useSelectedObjectMetadata,
} from 'twenty-sdk/front-component';

import { MARKETING_RESULTS_FRONT_COMPONENT_ID } from 'src/constants/marketing-identifiers';
import { CARD_GAP, STYLE } from 'src/shared/daily-giving-styles';
import { formatUsd } from 'src/shared/donor-dashboard-specs';
import {
  MARKETING_RESULTS_ROUTE_PATH,
  NETWORKS,
  PEOPLE_COUNT_KEYS,
  type PeopleCountKey,
  type PeopleLists,
  type ResultCounts,
  type ResultsSummary,
} from 'src/shared/marketing/results';
import type { Network } from 'src/shared/marketing/types';

const api = new RestApiClient();

type MarketingResults = ResultsSummary & {
  people: { total: PeopleLists; byNetwork: Record<Network, PeopleLists> };
};

type Scope = 'ALL' | Network;

const ROUTE_KEY_BY_OBJECT: Record<string, string> = {
  socialPost: 'socialPostId',
  landingPage: 'landingPageId',
};

const NETWORK_LABELS: Record<Network, string> = {
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube',
  OTHER: 'Other',
  NONE: 'No network',
};

type RowReader = (counts: ResultCounts, invitesSent: number) => string;

const ROWS: { label: string; read: RowReader }[] = [
  { label: 'Visits', read: (counts) => String(counts.visits) },
  { label: 'Give clicks', read: (counts) => String(counts.giveClicks) },
  // Invites are not tied to a network, so the by-network columns show a dash.
  {
    label: 'Invites sent',
    read: (_counts, invitesSent) => String(invitesSent),
  },
  {
    label: 'Visits from invites',
    read: (counts) => String(counts.invitedVisits),
  },
  {
    label: 'Give clicks from invites',
    read: (counts) => String(counts.invitedGiveClicks),
  },
  {
    label: 'Signups from invites',
    read: (counts) => String(counts.invitedSignups),
  },
  { label: 'Pray', read: (counts) => String(counts.pray) },
  { label: 'Volunteer', read: (counts) => String(counts.volunteer) },
  { label: 'Emails captured', read: (counts) => String(counts.emailsCaptured) },
  {
    label: 'Phones with SMS consent',
    read: (counts) => String(counts.phonesWithSmsConsent),
  },
  { label: 'New people', read: (counts) => String(counts.newPeople) },
  { label: 'Gifts', read: (counts) => String(counts.gifts) },
  {
    label: 'Gift dollars',
    read: (counts) => formatUsd(counts.giftTotalMicros),
  },
  {
    label: 'Gifts from invites',
    read: (counts) => String(counts.giftsFromInvites),
  },
  {
    label: 'Total from invites',
    read: (counts) => formatUsd(counts.giftTotalFromInvitesMicros),
  },
  {
    label: 'Monthly plans started',
    read: (counts) => String(counts.monthlyPlansStarted),
  },
  { label: 'Gifts made monthly', read: (counts) => String(counts.madeMonthly) },
  {
    label: 'Giving questions',
    read: (counts) => String(counts.givingQuestions),
  },
];

// These come from Pledges or invites, which are not tied to a network.
const TOTAL_ONLY_LABELS = new Set([
  'Invites sent',
  'Monthly plans started',
  'Gifts made monthly',
]);

const PEOPLE_LABELS: Record<PeopleCountKey, string> = {
  pray: 'Pray',
  volunteer: 'Volunteer',
  emailsCaptured: 'Emails captured',
  phonesWithSmsConsent: 'Phones with SMS consent',
  newPeople: 'New people',
  gifts: 'Gifts',
};

const hasActivity = (counts: ResultCounts): boolean =>
  Object.values(counts).some((value) => value !== 0 && value !== '0');

const CountsCard = ({ results }: { results: MarketingResults }) => {
  const networks = NETWORKS.filter((network) =>
    hasActivity(results.byNetwork[network]),
  );

  return (
    <div style={{ ...STYLE.card, marginBottom: CARD_GAP, overflowX: 'auto' }}>
      <div style={STYLE.cardHead}>
        <h2 style={STYLE.cardTitle}>Results</h2>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={STYLE.th} />
            <th style={STYLE.th}>Total</th>
            {networks.map((network) => (
              <th key={network} style={STYLE.th}>
                {NETWORK_LABELS[network]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.label}>
              <td style={STYLE.td}>{row.label}</td>
              <td style={{ ...STYLE.td, fontWeight: 700 }}>
                {row.read(results.total, results.invitesSent)}
              </td>
              {networks.map((network) => (
                <td key={network} style={STYLE.td}>
                  {TOTAL_ONLY_LABELS.has(row.label)
                    ? '-'
                    : row.read(results.byNetwork[network], 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const PeopleCard = ({ results }: { results: MarketingResults }) => {
  const [scope, setScope] = useState<Scope>('ALL');
  const lists =
    scope === 'ALL' ? results.people.total : results.people.byNetwork[scope];

  return (
    <div style={STYLE.card}>
      <div style={STYLE.cardHead}>
        <div>
          <h2 style={STYLE.cardTitle}>People</h2>
          <div style={STYLE.hint}>Visits and give clicks are anonymous</div>
        </div>
        <select
          aria-label="Network"
          value={scope}
          onChange={(event) => setScope(event.target.value as Scope)}
          style={{ ...STYLE.input, width: 'auto' }}
        >
          <option value="ALL">All networks</option>
          {NETWORKS.map((network) => (
            <option key={network} value={network}>
              {NETWORK_LABELS[network]}
            </option>
          ))}
        </select>
      </div>
      {PEOPLE_COUNT_KEYS.map((key) => {
        const list = lists[key];

        return (
          <div key={key} style={{ marginBottom: CARD_GAP }}>
            <div style={STYLE.fieldLabel}>
              {PEOPLE_LABELS[key]} · {list.total}
            </div>
            {list.people.length === 0 ? (
              <div style={STYLE.muted}>No one yet</div>
            ) : (
              <div>
                {list.people.map((person) => (
                  <div key={person.id} style={{ padding: '4px 0' }}>
                    <a
                      href={`/object/person/${person.id}`}
                      style={{ color: 'inherit' }}
                    >
                      {person.name}
                    </a>
                  </div>
                ))}
                {list.total > list.people.length ? (
                  <div style={STYLE.hint}>
                    Showing {list.people.length} of {list.total}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const MarketingResultsView = () => {
  const recordId = useRecordId();
  const objectMetadata = useSelectedObjectMetadata();
  const routeKey = objectMetadata
    ? ROUTE_KEY_BY_OBJECT[objectMetadata.nameSingular]
    : undefined;
  const [results, setResults] = useState<MarketingResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latestRequestId = useRef(0);

  const load = useCallback(async () => {
    if (!recordId || !routeKey) return;

    const requestId = latestRequestId.current + 1;

    latestRequestId.current = requestId;
    setError(null);
    setLoading(true);

    try {
      const data = await api.get<MarketingResults>(
        `/s${MARKETING_RESULTS_ROUTE_PATH}?${routeKey}=${encodeURIComponent(recordId)}`,
      );

      if (requestId === latestRequestId.current) setResults(data);
    } catch (loadError) {
      if (requestId === latestRequestId.current) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'The results could not be loaded',
        );
      }
    } finally {
      if (requestId === latestRequestId.current) setLoading(false);
    }
  }, [recordId, routeKey]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div style={STYLE.root}>
      {error ? (
        <div style={STYLE.alert} role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : null}
      {results ? (
        <>
          <CountsCard results={results} />
          <PeopleCard results={results} />
        </>
      ) : (
        <div style={STYLE.muted}>{loading ? 'Loading results…' : ''}</div>
      )}
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: MARKETING_RESULTS_FRONT_COMPONENT_ID,
  name: 'marketing-results',
  description:
    'Counts of visits, give clicks, prayers, volunteers, contacts, new people and gifts for a Social Post or Landing Page, by network, with the people behind each count.',
  component: MarketingResultsView,
});
