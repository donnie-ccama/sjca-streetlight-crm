import { defineLogicFunction, HTTPMethod } from 'twenty-sdk/define';
import { Response, type RoutePayload } from 'twenty-sdk/logic-function';

import {
  STRIPE_WEBHOOK_FORWARDED_REQUEST_HEADERS,
  STRIPE_WEBHOOK_LOGIC_FUNCTION_ID,
} from 'src/constants/marketing-identifiers';
import { createGiftContext } from 'src/logic-functions/online-gift.server';
import { handleStripeWebhookRequest } from 'src/logic-functions/stripe-events.server';

const handler = async (event: RoutePayload) => {
  const result = await handleStripeWebhookRequest(
    {
      rawBody: event.rawBody,
      signatureHeader: event.headers?.['stripe-signature'],
    },
    createGiftContext(),
  );

  return new Response(result.body, { status: result.status });
};

export default defineLogicFunction({
  universalIdentifier: STRIPE_WEBHOOK_LOGIC_FUNCTION_ID,
  name: 'stripe-webhook',
  description:
    'Receives Stripe events, checks the signature, and records gifts, refunds, and monthly plans.',
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: {
    path: '/stripe/webhook',
    httpMethod: HTTPMethod.POST,
    isAuthRequired: false,
    forwardedRequestHeaders: STRIPE_WEBHOOK_FORWARDED_REQUEST_HEADERS,
  },
});
