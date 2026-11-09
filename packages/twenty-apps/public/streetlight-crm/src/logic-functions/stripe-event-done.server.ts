import { kv } from 'twenty-sdk/logic-function';

const STRIPE_EVENT_DONE_KEY_PREFIX = 'stripe-event-done:';

export const isStripeEventDone = async (eventId: string): Promise<boolean> =>
  (await kv.get<boolean>(`${STRIPE_EVENT_DONE_KEY_PREFIX}${eventId}`)) === true;

export const markStripeEventDone = (eventId: string): Promise<void> =>
  kv.set(`${STRIPE_EVENT_DONE_KEY_PREFIX}${eventId}`, true);
