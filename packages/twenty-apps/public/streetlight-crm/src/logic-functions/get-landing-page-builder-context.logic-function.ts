import { defineLogicFunction, HTTPMethod } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import {
  GET_LANDING_PAGE_BUILDER_CONTEXT_LOGIC_FUNCTION_ID,
  GET_LANDING_PAGE_BUILDER_CONTEXT_ROUTE_PATH,
} from 'src/constants/marketing-identifiers';
import { isStripeConfigured } from 'src/logic-functions/stripe-client';

// Front components never receive secret variables, so the builder asks here.
const handler = async () =>
  new Response(
    { giveEnabled: isStripeConfigured() },
    { status: 200, headers: { 'cache-control': 'no-store' } },
  );

export default defineLogicFunction({
  universalIdentifier: GET_LANDING_PAGE_BUILDER_CONTEXT_LOGIC_FUNCTION_ID,
  name: 'get-landing-page-builder-context',
  description:
    'Tells the landing page builder whether Stripe is set up, so the preview shows Give buttons only when the public page does.',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: {
    path: GET_LANDING_PAGE_BUILDER_CONTEXT_ROUTE_PATH,
    httpMethod: HTTPMethod.GET,
    isAuthRequired: true,
  },
});
