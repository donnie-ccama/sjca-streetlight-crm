import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stripeRequest } from 'src/logic-functions/stripe-client';

const fetchMock = vi.fn();

describe('stripeRequest', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_example');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sends a GET to the single-/v1 URL with the bearer key', async () => {
    await stripeRequest({
      method: 'GET',
      path: '/v1/events',
      params: { limit: 100 },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];

    expect(url).toBe('https://api.stripe.com/v1/events?limit=100');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer sk_test_example');
    expect(init.headers['Stripe-Version']).toBe('2025-08-27.basil');
    expect(init.body).toBeUndefined();
  });

  it('sends a POST form body with its content type and idempotency key', async () => {
    await stripeRequest({
      method: 'POST',
      path: '/v1/refunds',
      params: { charge: 'ch_1', metadata: { source: 'crm' } },
      idempotencyKey: 'key-1',
    });

    const [url, init] = fetchMock.mock.calls[0];

    expect(url).toBe('https://api.stripe.com/v1/refunds');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('charge=ch_1&metadata%5Bsource%5D=crm');
    expect(init.headers['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
    expect(init.headers['Idempotency-Key']).toBe('key-1');
    expect(init.headers['Stripe-Version']).toBe('2025-08-27.basil');
  });
});
