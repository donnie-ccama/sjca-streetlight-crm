import { beforeEach, describe, expect, it, vi } from 'vitest';

const { kvStore, requestMock, handleMock, configuredMock } = vi.hoisted(() => ({
  kvStore: new Map<string, unknown>(),
  requestMock: vi.fn(),
  handleMock: vi.fn(),
  configuredMock: vi.fn(),
}));

vi.mock('twenty-sdk/define', () => ({
  defineLogicFunction: (config: unknown) => config,
}));
vi.mock('twenty-sdk/logic-function', () => ({
  kv: {
    get: async (key: string) => kvStore.get(key),
    set: async (key: string, value: unknown) => {
      kvStore.set(key, value);
    },
    delete: async (key: string) => {
      kvStore.delete(key);
    },
  },
}));
vi.mock('src/logic-functions/stripe-client', () => ({
  stripeRequest: requestMock,
  isStripeConfigured: configuredMock,
}));
vi.mock('src/logic-functions/stripe-events.server', () => ({
  STRIPE_IMPORT_START_KEY: 'stripe-import-start',
  handleStripeEvent: handleMock,
}));
vi.mock('src/logic-functions/online-gift.server', () => ({
  createGiftContext: () => ({ context: true }),
}));

import { runStripeBackstop } from 'src/logic-functions/sync-stripe-events.logic-function';

const NOW = new Date('2026-11-06T12:00:00Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);

const event = (id: string, type = 'invoice.paid') => ({
  id,
  type,
  created: NOW_SECONDS - 100,
  data: { object: {} },
});

describe('runStripeBackstop', () => {
  beforeEach(() => {
    kvStore.clear();
    requestMock.mockReset();
    handleMock.mockReset();
    configuredMock.mockReset();
    configuredMock.mockReturnValue(true);
    kvStore.set('stripe-import-start', NOW_SECONDS - 10 * 86_400);
  });

  it('reads events of the last 3 days through every page, oldest first', async () => {
    requestMock
      .mockResolvedValueOnce({
        data: [event('evt_3'), event('evt_2')],
        has_more: true,
      })
      .mockResolvedValueOnce({ data: [event('evt_1')], has_more: false });
    handleMock.mockResolvedValue('handled');

    const summary = await runStripeBackstop(NOW);

    expect(summary).toEqual({ handled: 3, ignored: 0, failed: 0 });
    expect(requestMock).toHaveBeenCalledTimes(2);

    const firstParams = requestMock.mock.calls[0][0].params;

    expect(requestMock.mock.calls[0][0]).toMatchObject({
      method: 'GET',
      path: '/v1/events',
    });
    expect(firstParams.types).toEqual([
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
      'invoice.paid',
      'charge.refunded',
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'invoice.payment_failed',
      'payment_intent.succeeded',
    ]);
    expect(firstParams.created).toEqual({
      gte: NOW_SECONDS - 3 * 86_400,
    });
    expect(firstParams.limit).toBe(100);
    expect(requestMock.mock.calls[1][0].params.starting_after).toBe('evt_2');
    expect(handleMock.mock.calls[0][2]).toEqual({
      source: 'backstop',
      nowSeconds: NOW_SECONDS,
    });
    expect(handleMock.mock.calls.map(([called]) => called.id)).toEqual([
      'evt_1',
      'evt_2',
      'evt_3',
    ]);
  });

  it('counts events before stripe-import-start as ignored', async () => {
    requestMock.mockResolvedValue({
      data: [event('evt_old'), event('evt_new')],
      has_more: false,
    });
    handleMock
      .mockResolvedValueOnce('handled')
      .mockResolvedValueOnce('skipped-before-start');

    expect(await runStripeBackstop(NOW)).toEqual({
      handled: 1,
      ignored: 1,
      failed: 0,
    });
  });

  it('sets stripe-import-start to now with one warning and runs when it is not set', async () => {
    kvStore.delete('stripe-import-start');
    requestMock.mockResolvedValue({ data: [event('evt_1')], has_more: false });
    handleMock.mockResolvedValue('skipped-before-start');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await runStripeBackstop(NOW)).toEqual({
      handled: 0,
      ignored: 1,
      failed: 0,
    });
    expect(kvStore.get('stripe-import-start')).toBe(NOW_SECONDS);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(handleMock).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('does nothing when Stripe is not configured', async () => {
    configuredMock.mockReturnValue(false);

    expect(await runStripeBackstop(NOW)).toEqual({
      handled: 0,
      ignored: 0,
      failed: 0,
    });
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('one failed event does not stop the run', async () => {
    requestMock.mockResolvedValue({
      data: [event('evt_2'), event('evt_1')],
      has_more: false,
    });
    handleMock
      .mockRejectedValueOnce(new Error('donor@example.com not found'))
      .mockResolvedValueOnce('handled');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await runStripeBackstop(NOW)).toEqual({
      handled: 1,
      ignored: 0,
      failed: 1,
    });
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain('donor@');
    errorSpy.mockRestore();
  });

  it('skips events marked done and marks each finished event done', async () => {
    kvStore.set('stripe-event-done:evt_done', true);
    requestMock.mockResolvedValue({
      data: [
        event('evt_failed'),
        event('evt_waiting', 'payment_intent.succeeded'),
        event('evt_old'),
        event('evt_ignored'),
        event('evt_handled'),
        event('evt_done'),
      ],
      has_more: false,
    });
    handleMock
      .mockResolvedValueOnce('handled')
      .mockResolvedValueOnce('ignored')
      .mockResolvedValueOnce('skipped-before-start')
      .mockResolvedValueOnce('deferred')
      .mockRejectedValueOnce(new Error('write failed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await runStripeBackstop(NOW)).toEqual({
      handled: 1,
      ignored: 4,
      failed: 1,
    });
    expect(handleMock.mock.calls.map(([called]) => called.id)).toEqual([
      'evt_handled',
      'evt_ignored',
      'evt_old',
      'evt_waiting',
      'evt_failed',
    ]);
    expect(kvStore.get('stripe-event-done:evt_handled')).toBe(true);
    expect(kvStore.get('stripe-event-done:evt_ignored')).toBe(true);
    expect(kvStore.get('stripe-event-done:evt_old')).toBe(true);
    expect(kvStore.has('stripe-event-done:evt_waiting')).toBe(false);
    expect(kvStore.has('stripe-event-done:evt_failed')).toBe(false);
  });

  it('passes one context to every event of a run', async () => {
    requestMock.mockResolvedValue({
      data: [event('evt_2'), event('evt_1')],
      has_more: false,
    });
    handleMock.mockResolvedValue('handled');

    await runStripeBackstop(NOW);

    expect(handleMock.mock.calls[0][1]).toBe(handleMock.mock.calls[1][1]);
  });

  it('skips the run while another run holds the lock', async () => {
    kvStore.set('stripe-backstop-lock', { startedAt: NOW.toISOString() });

    expect(await runStripeBackstop(NOW)).toEqual({
      handled: 0,
      ignored: 0,
      failed: 0,
    });
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('releases the lock after a run', async () => {
    requestMock.mockResolvedValue({ data: [], has_more: false });

    await runStripeBackstop(NOW);

    expect(kvStore.has('stripe-backstop-lock')).toBe(false);
  });
});
