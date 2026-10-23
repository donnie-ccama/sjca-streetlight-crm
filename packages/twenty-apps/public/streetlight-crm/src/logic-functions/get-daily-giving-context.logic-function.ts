import { defineLogicFunction, HTTPMethod } from 'twenty-sdk/define';
import type { RoutePayload } from 'twenty-sdk/logic-function';

import { GET_DAILY_CONTEXT_LF_ID, GET_DAILY_CONTEXT_ROUTE } from 'src/constants/daily-giving-identifiers';
import { buildDailyContext, resolveContextDate } from 'src/logic-functions/daily-donations.server';

// GET /s/daily-giving-context?date=yyyy-mm-dd — one round trip powering the
// Daily Giving entry form: active funds, live campaigns, and the selected
// day's entries with running totals (count, amount, in-kind count).
//
// Auth: isAuthRequired true (same model as create-daily-donations). The
// date defaults to the caller's local "today"; invalid values fall back to
// today rather than erroring so the widget always renders.
const handler = async (event: RoutePayload) => {
  const date = resolveContextDate(event.queryStringParameters?.date);
  return buildDailyContext(date);
};

export default defineLogicFunction({
  universalIdentifier: GET_DAILY_CONTEXT_LF_ID,
  name: 'get-daily-giving-context',
  description:
    'Loads everything the Daily Giving form needs: active funds, active campaigns, and the chosen day\'s donations with totals by payment method.',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: {
    path: GET_DAILY_CONTEXT_ROUTE,
    httpMethod: HTTPMethod.GET,
    isAuthRequired: true,
  },
});
