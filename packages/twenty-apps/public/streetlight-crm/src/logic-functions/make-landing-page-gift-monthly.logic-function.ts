import { defineLogicFunction, HTTPMethod } from 'twenty-sdk/define';
import { Response, type RoutePayload } from 'twenty-sdk/logic-function';

import {
  LANDING_PAGE_FORWARDED_REQUEST_HEADERS,
  MAKE_LANDING_PAGE_GIFT_MONTHLY_LOGIC_FUNCTION_ID,
} from 'src/constants/marketing-identifiers';
import { handleMakeMonthly } from 'src/logic-functions/stripe-thanks.server';

const handler = async (event: RoutePayload) => {
  const result = await handleMakeMonthly({
    slug: event.pathParameters.slug ?? '',
    body: event.body,
    headers: event.headers ?? {},
    now: new Date(),
  });

  return new Response(result.body, { status: result.status });
};

export default defineLogicFunction({
  universalIdentifier: MAKE_LANDING_PAGE_GIFT_MONTHLY_LOGIC_FUNCTION_ID,
  name: 'make-landing-page-gift-monthly',
  description:
    'Turns a one-time landing page gift into a monthly Stripe subscription.',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: {
    path: '/lp/:slug/make-monthly',
    httpMethod: HTTPMethod.POST,
    isAuthRequired: false,
    forwardedRequestHeaders: LANDING_PAGE_FORWARDED_REQUEST_HEADERS,
  },
});
