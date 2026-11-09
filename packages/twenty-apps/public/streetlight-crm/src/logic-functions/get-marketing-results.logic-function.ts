import { defineLogicFunction, HTTPMethod } from 'twenty-sdk/define';
import { Response, type RoutePayload } from 'twenty-sdk/logic-function';

import { GET_MARKETING_RESULTS_LOGIC_FUNCTION_ID } from 'src/constants/marketing-identifiers';
import { buildMarketingResults } from 'src/logic-functions/marketing-results.server';
import { MARKETING_RESULTS_ROUTE_PATH } from 'src/shared/marketing/results';

const handler = async (event: RoutePayload) => {
  // API keys and agents reach auth routes without a user; results name donors, so people only.
  const result = event.userWorkspaceId
    ? await buildMarketingResults(event.queryStringParameters ?? {})
    : { status: 403, body: { error: 'A signed-in person must view results' } };

  return new Response(result.body, {
    status: result.status,
    headers: { 'cache-control': 'no-store' },
  });
};

export default defineLogicFunction({
  universalIdentifier: GET_MARKETING_RESULTS_LOGIC_FUNCTION_ID,
  name: 'get-marketing-results',
  description:
    'Counts the Responses of one Social Post or Landing Page, split by network, with the people behind each count.',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: {
    path: MARKETING_RESULTS_ROUTE_PATH,
    httpMethod: HTTPMethod.GET,
    isAuthRequired: true,
  },
});
