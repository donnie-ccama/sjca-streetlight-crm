import { defineLogicFunction, HTTPMethod } from 'twenty-sdk/define';
import { Response, type RoutePayload } from 'twenty-sdk/logic-function';

import {
  GET_LANDING_PAGE_THANKS_LOGIC_FUNCTION_ID,
  LANDING_PAGE_FORWARDED_REQUEST_HEADERS,
} from 'src/constants/marketing-identifiers';
import { renderGiftThanksRoute } from 'src/logic-functions/stripe-thanks.server';

const handler = async (event: RoutePayload) => {
  const page = await renderGiftThanksRoute({
    slug: event.pathParameters.slug ?? '',
    query: event.queryStringParameters ?? {},
    now: new Date(),
  });

  return new Response(page.body, {
    status: page.status,
    headers: page.headers,
  });
};

export default defineLogicFunction({
  universalIdentifier: GET_LANDING_PAGE_THANKS_LOGIC_FUNCTION_ID,
  name: 'get-landing-page-thanks',
  description: 'Serves the thank-you page after a Stripe Checkout gift.',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: {
    path: '/lp/:slug/thanks',
    httpMethod: HTTPMethod.GET,
    isAuthRequired: false,
    forwardedRequestHeaders: LANDING_PAGE_FORWARDED_REQUEST_HEADERS,
  },
});
