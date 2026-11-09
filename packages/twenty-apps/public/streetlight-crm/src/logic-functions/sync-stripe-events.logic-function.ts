import { defineLogicFunction } from 'twenty-sdk/define';
import { kv } from 'twenty-sdk/logic-function';

import { SYNC_STRIPE_EVENTS_LOGIC_FUNCTION_ID } from 'src/constants/marketing-identifiers';
import { createGiftContext } from 'src/logic-functions/online-gift.server';
import {
  isStripeEventDone,
  markStripeEventDone,
} from 'src/logic-functions/stripe-event-done.server';
import {
  isStripeConfigured,
  stripeRequest,
} from 'src/logic-functions/stripe-client';
import {
  handleStripeEvent,
  STRIPE_IMPORT_START_KEY,
  type StripeEvent,
} from 'src/logic-functions/stripe-events.server';

const STRIPE_BACKSTOP_LOCK_KEY = 'stripe-backstop-lock';
const TIMEOUT_SECONDS = 300;
const LOCK_TTL_MS = 2 * TIMEOUT_SECONDS * 1000;
const LOOKBACK_SECONDS = 3 * 86_400;
const PAGE_SIZE = 100;
const BACKSTOP_EVENT_TYPES = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'invoice.paid',
  'charge.refunded',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
  'payment_intent.succeeded',
];

export type StripeBackstopSummary = {
  handled: number;
  ignored: number;
  failed: number;
};

type StripeEventPage = { data: StripeEvent[]; has_more: boolean };

const acquireLock = async (now: Date): Promise<boolean> => {
  const lock = await kv.get<{ startedAt?: string }>(STRIPE_BACKSTOP_LOCK_KEY);
  const startedAt = Date.parse(lock?.startedAt ?? '');

  if (!Number.isNaN(startedAt) && now.getTime() - startedAt < LOCK_TTL_MS) {
    return false;
  }

  await kv.set(STRIPE_BACKSTOP_LOCK_KEY, { startedAt: now.toISOString() });

  return true;
};

const listRecentEvents = async (now: Date): Promise<StripeEvent[]> => {
  const createdAfter = Math.floor(now.getTime() / 1000) - LOOKBACK_SECONDS;
  const events: StripeEvent[] = [];
  let startingAfter: string | undefined;

  for (;;) {
    const page = await stripeRequest<StripeEventPage>({
      method: 'GET',
      path: '/v1/events',
      params: {
        types: BACKSTOP_EVENT_TYPES,
        created: { gte: createdAfter },
        limit: PAGE_SIZE,
        starting_after: startingAfter,
      },
    });

    events.push(...page.data);

    if (!page.has_more || page.data.length === 0) break;

    startingAfter = page.data[page.data.length - 1].id;
  }

  return events;
};

export const runStripeBackstop = async (
  now: Date = new Date(),
): Promise<StripeBackstopSummary> => {
  const summary: StripeBackstopSummary = { handled: 0, ignored: 0, failed: 0 };

  if (!isStripeConfigured()) return summary;

  // Without a start the backstop would never run if the webhook never succeeds.
  if (typeof (await kv.get<number>(STRIPE_IMPORT_START_KEY)) !== 'number') {
    await kv.set(STRIPE_IMPORT_START_KEY, Math.floor(now.getTime() / 1000));
    console.warn('Stripe backstop: no import start was set, so it starts now');
  }

  if (!(await acquireLock(now))) {
    console.log('Stripe backstop skipped: another run is in progress');

    return summary;
  }

  try {
    const events = await listRecentEvents(now);
    const context = createGiftContext();

    // Stripe lists newest first. Subscription events must land before later gifts.
    for (const event of events.reverse()) {
      try {
        if (await isStripeEventDone(event.id)) {
          summary.ignored += 1;
          continue;
        }

        const result = await handleStripeEvent(event, context, {
          source: 'backstop',
          nowSeconds: Math.floor(now.getTime() / 1000),
        });

        if (result !== 'deferred') await markStripeEventDone(event.id);

        if (result === 'handled') summary.handled += 1;
        else summary.ignored += 1;
      } catch {
        // The error text can echo donor values, so only the id and type are logged.
        console.error(`Stripe event ${event.id} (${event.type}) failed`);
        summary.failed += 1;
      }
    }

    console.log(
      `Stripe backstop: ${summary.handled} handled, ${summary.ignored} ignored, ${summary.failed} failed`,
    );

    return summary;
  } finally {
    await kv.delete(STRIPE_BACKSTOP_LOCK_KEY);
  }
};

const handler = async () => runStripeBackstop();

export default defineLogicFunction({
  universalIdentifier: SYNC_STRIPE_EVENTS_LOGIC_FUNCTION_ID,
  name: 'sync-stripe-events',
  description:
    'Replays the last 3 days of Stripe events through the webhook handler to catch missed deliveries. Hourly cron; also runnable manually.',
  timeoutSeconds: TIMEOUT_SECONDS,
  handler,
  cronTriggerSettings: {
    pattern: '20 * * * *',
  },
  workflowActionTriggerSettings: {
    label: 'Sync Stripe Events',
    icon: 'IconRefresh',
  },
});
