import { defineLogicFunction, HTTPMethod } from 'twenty-sdk/define';
import { Response, type RoutePayload } from 'twenty-sdk/logic-function';

import {
  LOG_LANDING_PAGE_VISIT_LOGIC_FUNCTION_ID,
  LANDING_PAGE_FORWARDED_REQUEST_HEADERS,
} from 'src/constants/marketing-identifiers';
import { handleBeacon } from 'src/logic-functions/landing-page.server';

const handler = async (event: RoutePayload) => {
  const result = await handleBeacon({
    type: 'VISIT',
    slug: event.pathParameters.slug ?? '',
    body: event.body,
    headers: event.headers ?? {},
  });

  return new Response(result.body, { status: result.status });
};

export default defineLogicFunction({
  universalIdentifier: LOG_LANDING_PAGE_VISIT_LOGIC_FUNCTION_ID,
  name: 'log-landing-page-visit',
  description: 'Logs a public landing page VISIT beacon as a Response.',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: {
    path: '/lp/:slug/visit',
    httpMethod: HTTPMethod.POST,
    isAuthRequired: false,
    forwardedRequestHeaders: LANDING_PAGE_FORWARDED_REQUEST_HEADERS,
  },
});
