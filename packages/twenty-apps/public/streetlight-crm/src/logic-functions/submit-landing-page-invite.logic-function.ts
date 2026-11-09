import { defineLogicFunction, HTTPMethod } from 'twenty-sdk/define';
import { Response, type RoutePayload } from 'twenty-sdk/logic-function';

import {
  LANDING_PAGE_FORWARDED_REQUEST_HEADERS,
  SUBMIT_LANDING_PAGE_INVITE_LOGIC_FUNCTION_ID,
} from 'src/constants/marketing-identifiers';
import { handleInviteSubmission } from 'src/logic-functions/landing-page-invite.server';

const handler = async (event: RoutePayload) => {
  const result = await handleInviteSubmission({
    slug: event.pathParameters.slug ?? '',
    body: event.body,
    headers: event.headers ?? {},
  });

  return new Response(result.body, { status: result.status });
};

export default defineLogicFunction({
  universalIdentifier: SUBMIT_LANDING_PAGE_INVITE_LOGIC_FUNCTION_ID,
  name: 'submit-landing-page-invite',
  description: 'Saves a public landing page invite and returns its code.',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: {
    path: '/lp/:slug/invite',
    httpMethod: HTTPMethod.POST,
    isAuthRequired: false,
    forwardedRequestHeaders: LANDING_PAGE_FORWARDED_REQUEST_HEADERS,
  },
});
