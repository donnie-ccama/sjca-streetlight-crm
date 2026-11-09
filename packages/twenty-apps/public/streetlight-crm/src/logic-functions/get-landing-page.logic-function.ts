import { defineLogicFunction, HTTPMethod } from 'twenty-sdk/define';
import { Response, type RoutePayload } from 'twenty-sdk/logic-function';

import {
  GET_LANDING_PAGE_LOGIC_FUNCTION_ID,
  LANDING_PAGE_FORWARDED_REQUEST_HEADERS,
} from 'src/constants/marketing-identifiers';
import { renderLandingPageRoute } from 'src/logic-functions/landing-page.server';

const handler = async (event: RoutePayload) => {
  const page = await renderLandingPageRoute({
    slug: event.pathParameters.slug ?? '',
    query: event.queryStringParameters ?? {},
  });

  return new Response(page.body, { status: page.status, headers: page.headers });
};

export default defineLogicFunction({
  universalIdentifier: GET_LANDING_PAGE_LOGIC_FUNCTION_ID,
  name: 'get-landing-page',
  description: 'Serves a LIVE landing page as public HTML.',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: {
    path: '/lp/:slug',
    httpMethod: HTTPMethod.GET,
    isAuthRequired: false,
    forwardedRequestHeaders: LANDING_PAGE_FORWARDED_REQUEST_HEADERS,
  },
});
