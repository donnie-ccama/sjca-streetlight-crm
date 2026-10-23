import { defineLogicFunction, HTTPMethod } from 'twenty-sdk/define';
import type { RoutePayload } from 'twenty-sdk/logic-function';

import { CREATE_DAILY_DONATIONS_LF_ID, CREATE_DAILY_DONATIONS_ROUTE } from 'src/constants/daily-giving-identifiers';
import { BadRequestError, processBatch } from 'src/logic-functions/daily-donations.server';
import { todayLocalDateString } from 'src/shared/daily-entry-specs';

// POST /s/daily-donations — creates a batch of daily gifts (all income
// streams: CHECK, CREDIT_CARD, ACH, WIRE, STOCK, CASH, IN_KIND, OTHER).
//
// Auth: isAuthRequired true. Only signed-in workspace users can reach the
// route; the front component authenticates automatically with the
// per-person token Twenty mints for it (see front-components docs).
//
// Payload: { entries: DailyEntryInput[] } — see src/shared/daily-entry-specs.ts.
// Semantics: idempotent per entry via client entry keys stored on
// donation.externalTransactionId; partial success per row.
const handler = async (event: RoutePayload) => {
  const body = event.body as { entries?: unknown } | null;
  try {
    return await processBatch(body?.entries, todayLocalDateString());
  } catch (error) {
    if (error instanceof BadRequestError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw error;
  }
};

export default defineLogicFunction({
  universalIdentifier: CREATE_DAILY_DONATIONS_LF_ID,
  name: 'create-daily-donations',
  description:
    'Creates a batch of daily donations across all income streams (money and in-kind) with donor hard credits and idempotent resubmission. Backs the Daily Giving page entry form.',
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: {
    path: CREATE_DAILY_DONATIONS_ROUTE,
    httpMethod: HTTPMethod.POST,
    isAuthRequired: true,
  },
});
