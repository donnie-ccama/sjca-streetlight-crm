import { defineLogicFunction, HTTPMethod } from 'twenty-sdk/define';
import { Response, type RoutePayload } from 'twenty-sdk/logic-function';

import {
  CREATE_LANDING_PAGE_CHECKOUT_LOGIC_FUNCTION_ID,
  LANDING_PAGE_FORWARDED_REQUEST_HEADERS,
} from 'src/constants/marketing-identifiers';
import { handleCheckout } from 'src/logic-functions/landing-page.server';

const handler = async (event: RoutePayload) => {
  const result = await handleCheckout({
    slug: event.pathParameters.slug ?? '',
    body: event.body,
    headers: event.headers ?? {},
  });

  return new Response(result.body, { status: result.status });
};

export default defineLogicFunction({
  universalIdentifier: CREATE_LANDING_PAGE_CHECKOUT_LOGIC_FUNCTION_ID,
  name: 'create-landing-page-checkout',
  description:
    'Creates a Stripe Checkout Session for a public landing page gift.',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: {
    path: '/lp/:slug/checkout',
    httpMethod: HTTPMethod.POST,
    isAuthRequired: false,
    forwardedRequestHeaders: LANDING_PAGE_FORWARDED_REQUEST_HEADERS,
  },
});
