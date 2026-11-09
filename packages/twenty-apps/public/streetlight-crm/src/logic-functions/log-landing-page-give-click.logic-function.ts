import { defineLogicFunction, HTTPMethod } from 'twenty-sdk/define';
import { Response, type RoutePayload } from 'twenty-sdk/logic-function';

import {
  LOG_LANDING_PAGE_GIVE_CLICK_LOGIC_FUNCTION_ID,
  LANDING_PAGE_FORWARDED_REQUEST_HEADERS,
} from 'src/constants/marketing-identifiers';
import { handleBeacon } from 'src/logic-functions/landing-page.server';

const handler = async (event: RoutePayload) => {
  const result = await handleBeacon({
    type: 'GIVE_CLICK',
    slug: event.pathParameters.slug ?? '',
    body: event.body,
    headers: event.headers ?? {},
  });

  return new Response(result.body, { status: result.status });
};

export default defineLogicFunction({
  universalIdentifier: LOG_LANDING_PAGE_GIVE_CLICK_LOGIC_FUNCTION_ID,
  name: 'log-landing-page-give-click',
  description: 'Logs a public landing page GIVE_CLICK beacon as a Response.',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: {
    path: '/lp/:slug/give-click',
    httpMethod: HTTPMethod.POST,
    isAuthRequired: false,
    forwardedRequestHeaders: LANDING_PAGE_FORWARDED_REQUEST_HEADERS,
  },
});
