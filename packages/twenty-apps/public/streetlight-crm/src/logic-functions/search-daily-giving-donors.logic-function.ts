import { defineLogicFunction, HTTPMethod } from 'twenty-sdk/define';
import type { RoutePayload } from 'twenty-sdk/logic-function';

import { SEARCH_DONORS_LF_ID, SEARCH_DONORS_ROUTE } from 'src/constants/daily-giving-identifiers';
import { gql } from 'src/logic-functions/workspace-gql';
import {
  formatMailingAddress,
  resolvePersonAddressLines,
  type DonorSuggestion,
} from 'src/shared/donor-suggestions';

// GET /s/daily-giving-donor-search?q=<text> — donor autocomplete for the
// Daily Giving entry form. Searches Person (name sub-fields) and Company
// (name) with a small per-call limit so the widget dropdown stays snappy.
//
// This workspace's Person object has no firstName/lastName fields — the
// name is a single FULL_NAME field, filtered via name.firstName/name.lastName
// with ilike (verified against live data; `contains` is rejected there).
// Auth: isAuthRequired true, like the other Daily Giving routes. The `q`
// text is escaped before inlining; results are capped. Person mailing
// addresses resolve through the primary Household, then an active Household
// Membership, because address is household-level in this workspace.
const escapeInQuery = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/** Builds an escaped ilike pattern; % and _ are neutralized for the user. */
const likePattern = (value: string): string =>
  `%${escapeInQuery(value).replace(/[%_]/g, (m) => `\\${m}`)}%`;

const MIN_QUERY_LENGTH = 2;
const MAX_SUGGESTIONS = 6;

const ADDRESS_FIELDS = `
  addressStreet1
  addressStreet2
  addressCity
  addressState
  addressPostcode
  addressCountry
`;

const handler = async (event: RoutePayload) => {
  const raw = event.queryStringParameters?.q ?? '';
  const q = raw.trim();
  if (q.length < MIN_QUERY_LENGTH) {
    return { suggestions: [] as DonorSuggestion[] };
  }

  const pattern = likePattern(q);
  const data = await gql(
    `query {
      people(first: ${MAX_SUGGESTIONS}, filter: {or: [{name: {firstName: {ilike: "${pattern}"}}}, {name: {lastName: {ilike: "${pattern}"}}}]}) {
        edges {
          node {
            id
            name { firstName lastName }
            primaryHousehold(first: 1) {
              edges {
                node { mailingAddress { ${ADDRESS_FIELDS} } }
              }
            }
            householdMemberships(first: 1, filter: {isActive: {eq: true}}) {
              edges {
                node {
                  isActive
                  household { mailingAddress { ${ADDRESS_FIELDS} } }
                }
              }
            }
          }
        }
      }
      companies(first: ${MAX_SUGGESTIONS}, filter: {name: {ilike: "${pattern}"}}) {
        edges { node { id name address { ${ADDRESS_FIELDS} } } }
      }
    }`,
  );

  const suggestions: DonorSuggestion[] = [];
  for (const edge of data.people?.edges ?? []) {
    const n = edge.node;
    const label = [n.name?.firstName, n.name?.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();
    if (n.id && label) {
      suggestions.push({
        type: 'PERSON',
        id: n.id,
        label,
        addressLines: resolvePersonAddressLines(
          (n.primaryHousehold?.edges ?? []).map((edge: any) => edge.node),
          (n.householdMemberships?.edges ?? []).map(
            (edge: any) => edge.node,
          ),
        ),
      });
    }
  }
  for (const edge of data.companies?.edges ?? []) {
    const n = edge.node;
    if (n.id && n.name) {
      suggestions.push({
        type: 'COMPANY',
        id: n.id,
        label: `${n.name} (org)`,
        addressLines: formatMailingAddress(n.address),
      });
    }
  }

  return { suggestions: suggestions.slice(0, MAX_SUGGESTIONS) };
};

export default defineLogicFunction({
  universalIdentifier: SEARCH_DONORS_LF_ID,
  name: 'search-daily-giving-donors',
  description:
    'Authenticated donor autocomplete for Daily Giving: matches People and Companies by name and returns their mailing address for entry confirmation.',
  timeoutSeconds: 15,
  handler,
  httpRouteTriggerSettings: {
    path: SEARCH_DONORS_ROUTE,
    httpMethod: HTTPMethod.GET,
    isAuthRequired: true,
  },
});
