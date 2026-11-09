import { defineLogicFunction, HTTPMethod } from 'twenty-sdk/define';
import { Response, type RoutePayload } from 'twenty-sdk/logic-function';

import {
  LANDING_PAGE_FORWARDED_REQUEST_HEADERS,
  SUBMIT_LANDING_PAGE_PRAY_LOGIC_FUNCTION_ID,
} from 'src/constants/marketing-identifiers';
import { handleFormSubmission } from 'src/logic-functions/landing-page.server';

const handler = async (event: RoutePayload) => {
  const result = await handleFormSubmission({
    type: 'PRAY',
    slug: event.pathParameters.slug ?? '',
    body: event.body,
    headers: event.headers ?? {},
    query: event.queryStringParameters ?? {},
  });

  return new Response(result.body, { status: result.status });
};

export default defineLogicFunction({
  universalIdentifier: SUBMIT_LANDING_PAGE_PRAY_LOGIC_FUNCTION_ID,
  name: 'submit-landing-page-pray',
  description: 'Saves a public landing page PRAY form as a Person and a Response.',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: {
    path: '/lp/:slug/pray',
    httpMethod: HTTPMethod.POST,
    isAuthRequired: false,
    forwardedRequestHeaders: LANDING_PAGE_FORWARDED_REQUEST_HEADERS,
  },
});
