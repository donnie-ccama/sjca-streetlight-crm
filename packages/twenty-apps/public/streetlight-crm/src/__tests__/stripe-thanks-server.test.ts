import { beforeEach, describe, expect, it, vi } from 'vitest';

const { kvStore, stripeRequestMock } = vi.hoisted(() => ({
  kvStore: new Map<string, unknown>(),
  stripeRequestMock: vi.fn(),
}));

const LIVE_PAGE = {
  id: 'page-1',
  slug: 'spring',
  headline: 'Spring appeal',
  pageType: null,
  body: { markdown: '' },
  heroImage: [],
  giveLabel: 'Give',
  prayLabel: 'Pray',
  volunteerLabel: 'Volunteer',
  prayerList: null,
  publishedContent: null,
  publishedPhotos: [],
  shareImage: [],
  shareDescription: '',
};

vi.mock('src/logic-functions/workspace-gql', () => ({
  gql: vi.fn(),
  rawMutation: vi.fn(),
  gqlEnum: (value: string) => ({ __gqlEnum: value }),
  rawQuery: vi.fn(async (selection: Record<string, unknown>) => {
    const rootName = Object.keys(selection)[0];
    const root = selection[rootName] as {
      __args: { filter: { slug?: { eq: string } } };
    };
    const rows =
      rootName === 'landingPages' &&
      root.__args.filter.slug?.eq === LIVE_PAGE.slug
        ? [LIVE_PAGE]
        : [];

    return { [rootName]: { edges: rows.map((node) => ({ node })) } };
  }),
}));

vi.mock('twenty-sdk/logic-function', () => ({
  kv: {
    get: vi.fn(async (key: string) => kvStore.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      kvStore.set(key, value);
    }),
    delete: vi.fn(async (key: string) => kvStore.delete(key)),
  },
}));

vi.mock('src/logic-functions/stripe-client', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('src/logic-functions/stripe-client')>();

  return { ...original, stripeRequest: stripeRequestMock };
});

import { StripeRequestError } from 'src/logic-functions/stripe-client';
import {
  handleMakeMonthly,
  makeGiftMonthly,
  renderGiftThanksRoute,
} from 'src/logic-functions/stripe-thanks.server';
import { hashIp, RATE_LIMIT_PER_HOUR } from 'src/shared/marketing/spam-guard';

const SESSION_ID = 'cs_test_a1B2c3';
const NOW = new Date('2026-11-06T12:00:00Z');
const CREATED = Math.floor(NOW.getTime() / 1000) - 60 * 60;
const HEADERS = { 'cf-connecting-ip': '203.0.113.7' };

const paidSession = (overrides: Record<string, unknown> = {}) => ({
  id: SESSION_ID,
  mode: 'payment',
  status: 'complete',
  payment_status: 'paid',
  amount_total: 2500,
  currency: 'usd',
  created: CREATED,
  customer: 'cus_1',
  customer_details: { name: 'Ada Lovelace' },
  metadata: { lp_slug: 'spring', utm_source: 'tiktok' },
  payment_intent: { id: 'pi_1', payment_method: 'pm_1' },
  ...overrides,
});

type StripeCall = {
  method: string;
  path: string;
  params?: Record<string, unknown>;
  idempotencyKey?: string;
};

const stripeCalls = (): StripeCall[] =>
  stripeRequestMock.mock.calls.map((call) => call[0] as StripeCall);

const postCalls = (): StripeCall[] =>
  stripeCalls().filter((call) => call.method === 'POST');

let confirmSession: Record<string, unknown> = {};

const answerStripe = (
  session: Record<string, unknown>,
  subscription: () => Promise<unknown> = async () => ({
    id: 'sub_1',
    status: 'active',
  }),
) => {
  stripeRequestMock.mockImplementation(async (call: StripeCall) => {
    if (call.method === 'GET' && call.path.endsWith('/cs_test_new')) {
      return confirmSession;
    }
    if (call.method === 'GET') return session;
    if (call.path === '/v1/prices') return { id: 'price_1' };
    if (call.path === '/v1/subscriptions') return subscription();
    if (call.path === '/v1/checkout/sessions') {
      return { id: 'cs_test_new', url: 'https://checkout.stripe.com/c/new' };
    }

    throw new Error(`Unexpected Stripe call ${call.path}`);
  });
};

beforeEach(() => {
  kvStore.clear();
  stripeRequestMock.mockReset();
  vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret');
  vi.stubEnv('TURNSTILE_SITE_KEY', 'site');
  vi.stubEnv('LANDING_PAGE_ORGANIZATION_NAME', 'Example Org');
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_secret');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_secret');
  vi.stubEnv('LANDING_PAGE_BASE_URL', 'https://give.example.org');
});

describe('renderGiftThanksRoute', () => {
  const render = (
    sessionId: string | undefined = SESSION_ID,
    slug = 'spring',
  ) =>
    renderGiftThanksRoute({
      slug,
      query: { session_id: sessionId },
      now: NOW,
    });

  it('shows the thank-you for a paid session from this page', async () => {
    answerStripe(paidSession());

    const page = await render();

    expect(page.status).toBe(200);
    expect(page.body).toContain('Thank you, Ada.');
    expect(page.body).toContain('$25');
    expect(page.body).toContain('Make it monthly?');
    expect(stripeCalls()[0]).toMatchObject({
      method: 'GET',
      path: `/v1/checkout/sessions/${SESSION_ID}`,
    });
  });

  it('hides the monthly ask for a session older than 24 hours', async () => {
    answerStripe(
      paidSession({
        created: Math.floor(NOW.getTime() / 1000) - 24 * 60 * 60 - 1,
      }),
    );

    const page = await render();

    expect(page.body).toContain('Thank you, Ada.');
    expect(page.body).not.toContain('Make it monthly?');
  });

  it('sends no referrer from the thank-you page', async () => {
    answerStripe(paidSession());

    expect((await render()).body).toContain(
      '<meta name="referrer" content="no-referrer">',
    );
  });

  it('shows a monthly thank-you for a complete subscription session', async () => {
    answerStripe(paidSession({ mode: 'subscription', payment_intent: null }));

    const page = await render();

    expect(page.body).toContain('Thank you, Ada.');
    expect(page.body).toContain('monthly gift');
    expect(page.body).not.toContain('Make it monthly?');
  });

  it('says only "Thank you." without a name', async () => {
    answerStripe(paidSession({ customer_details: { name: null } }));

    expect((await render()).body).toContain('Thank you.');
  });

  it('renders the normal page for a session from another page', async () => {
    answerStripe(paidSession({ metadata: { lp_slug: 'other' } }));

    const page = await render();

    expect(page.status).toBe(200);
    expect(page.body).not.toContain('Thank you, Ada.');
    expect(page.body).toContain('Spring appeal');
  });

  it('renders the normal page for an unpaid session that is not complete', async () => {
    answerStripe(paidSession({ status: 'open', payment_status: 'unpaid' }));

    const page = await render();

    expect(page.status).toBe(200);
    expect(page.body).not.toContain('Thank you, Ada.');
  });

  it('says the gift is processing for a complete session with a delayed payment', async () => {
    answerStripe(paidSession({ payment_status: 'unpaid' }));

    const page = await render();

    expect(page.status).toBe(200);
    expect(page.body).toContain('Thank you, Ada.');
    expect(page.body).toContain(
      'Your gift is processing. We will email you when it is complete.',
    );
    expect(page.body).not.toContain('We received your');
    expect(page.body).not.toContain('Make it monthly?');
  });

  it('renders the normal page for a processing session from another page', async () => {
    answerStripe(
      paidSession({ payment_status: 'unpaid', metadata: { lp_slug: 'other' } }),
    );

    expect((await render()).body).not.toContain('Your gift is processing.');
  });

  it('renders the normal page for a bad session id without calling Stripe', async () => {
    const page = await render('cs_test_<script>');

    expect(page.status).toBe(200);
    expect(page.body).not.toContain('Thank you, Ada.');
    expect(stripeRequestMock).not.toHaveBeenCalled();
  });

  it('renders the normal page when Stripe fails and logs no donor data', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    stripeRequestMock.mockRejectedValue(
      new StripeRequestError(404, 'resource_missing', `No ${SESSION_ID}`),
    );

    const page = await render();

    expect(page.status).toBe(200);
    expect(page.body).toContain('Spring appeal');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(SESSION_ID);
    errorSpy.mockRestore();
  });
});

describe('makeGiftMonthly', () => {
  const makeMonthly = (sessionId = SESSION_ID, slug = 'spring') =>
    makeGiftMonthly({ slug, sessionId, now: NOW });

  it('starts a subscription for a paid one-time session under 24 hours old', async () => {
    answerStripe(paidSession());

    expect(await makeMonthly()).toEqual({ status: 'started' });

    const [price, subscription] = postCalls();

    expect(stripeCalls()[0].params).toEqual({ expand: ['payment_intent'] });
    expect(price).toMatchObject({
      path: '/v1/prices',
      idempotencyKey: `make-monthly-price-${SESSION_ID}`,
      params: {
        currency: 'usd',
        unit_amount: 2500,
        recurring: { interval: 'month' },
        product_data: { name: 'Gift to Example Org' },
      },
    });
    expect(subscription).toMatchObject({
      path: '/v1/subscriptions',
      idempotencyKey: `make-monthly-${SESSION_ID}`,
      params: {
        customer: 'cus_1',
        items: [{ price: 'price_1' }],
        default_payment_method: 'pm_1',
        off_session: true,
        payment_behavior: 'error_if_incomplete',
        metadata: {
          lp_slug: 'spring',
          utm_source: 'tiktok',
          made_monthly_from: SESSION_ID,
        },
      },
    });
    expect(kvStore.get(`make-monthly:${SESSION_ID}`)).toBe('sub_1');
  });

  it('refuses a monthly session', async () => {
    answerStripe(paidSession({ mode: 'subscription' }));

    expect(await makeMonthly()).toEqual({ status: 'refused' });
    expect(postCalls()).toEqual([]);
  });

  it('refuses a session from another page', async () => {
    answerStripe(paidSession({ metadata: { lp_slug: 'other' } }));

    expect(await makeMonthly()).toEqual({ status: 'refused' });
    expect(postCalls()).toEqual([]);
  });

  it('refuses a session older than 24 hours', async () => {
    answerStripe(
      paidSession({
        created: Math.floor(NOW.getTime() / 1000) - 24 * 60 * 60 - 1,
      }),
    );

    expect(await makeMonthly()).toEqual({ status: 'refused' });
    expect(postCalls()).toEqual([]);
  });

  it('refuses an unpaid session or one without a saved card', async () => {
    answerStripe(paidSession({ payment_status: 'unpaid' }));
    expect(await makeMonthly()).toEqual({ status: 'refused' });

    answerStripe(paidSession({ payment_intent: { payment_method: null } }));
    expect(await makeMonthly()).toEqual({ status: 'refused' });

    answerStripe(paidSession({ customer: null }));
    expect(await makeMonthly()).toEqual({ status: 'refused' });

    expect(postCalls()).toEqual([]);
  });

  it('two calls start one subscription', async () => {
    answerStripe(paidSession());

    expect(await makeMonthly()).toEqual({ status: 'started' });
    stripeRequestMock.mockClear();

    expect(await makeMonthly()).toEqual({ status: 'started' });
    expect(postCalls()).toEqual([]);
  });

  it('returns a Checkout url when the bank asks the donor to confirm', async () => {
    answerStripe(paidSession(), async () => {
      throw new StripeRequestError(402, 'authentication_required', 'auth');
    });

    expect(await makeMonthly()).toEqual({
      status: 'confirm',
      url: 'https://checkout.stripe.com/c/new',
    });

    const checkout = postCalls().find(
      (call) => call.path === '/v1/checkout/sessions',
    );

    expect(checkout).toMatchObject({
      idempotencyKey: `make-monthly-checkout-${SESSION_ID}`,
      params: {
        mode: 'subscription',
        customer: 'cus_1',
        line_items: [{ price: 'price_1', quantity: 1 }],
        success_url:
          'https://give.example.org/s/lp/spring/thanks?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'https://give.example.org/spring',
        subscription_data: {
          metadata: {
            lp_slug: 'spring',
            utm_source: 'tiktok',
            made_monthly_from: SESSION_ID,
          },
        },
      },
    });
    expect(kvStore.get(`make-monthly:${SESSION_ID}`)).toBe(
      'confirm:cs_test_new',
    );
  });

  describe('after a confirm answer', () => {
    beforeEach(() => {
      kvStore.set(`make-monthly:${SESSION_ID}`, 'confirm:cs_test_new');
    });

    it('returns started once the donor completes the confirm Checkout', async () => {
      confirmSession = {
        id: 'cs_test_new',
        status: 'complete',
        subscription: 'sub_9',
        url: null,
      };
      answerStripe(paidSession());

      expect(await makeMonthly()).toEqual({ status: 'started' });
      expect(postCalls()).toEqual([]);
      expect(kvStore.get(`make-monthly:${SESSION_ID}`)).toBe('sub_9');
    });

    it('returns the same confirm url while the Checkout is open', async () => {
      confirmSession = {
        id: 'cs_test_new',
        status: 'open',
        url: 'https://checkout.stripe.com/c/new',
      };
      answerStripe(paidSession());

      expect(await makeMonthly()).toEqual({
        status: 'confirm',
        url: 'https://checkout.stripe.com/c/new',
      });
      expect(postCalls()).toEqual([]);
    });

    it('makes a new confirm Checkout without a subscription when the old one expired', async () => {
      confirmSession = { id: 'cs_test_new', status: 'expired', url: null };
      answerStripe(paidSession());

      expect(await makeMonthly()).toMatchObject({ status: 'confirm' });
      expect(
        postCalls().some((call) => call.path === '/v1/subscriptions'),
      ).toBe(false);
      expect(
        postCalls().find((call) => call.path === '/v1/checkout/sessions')
          ?.idempotencyKey,
      ).toBe(`make-monthly-checkout-${SESSION_ID}-cs_test_new`);
    });
  });

  it('returns a Checkout url for an incomplete subscription', async () => {
    answerStripe(paidSession(), async () => ({
      id: 'sub_2',
      status: 'incomplete',
    }));

    expect(await makeMonthly()).toMatchObject({ status: 'confirm' });
  });

  it('refuses a malformed session id without calling Stripe', async () => {
    expect(await makeMonthly('pi_123')).toEqual({ status: 'refused' });
    expect(stripeRequestMock).not.toHaveBeenCalled();
  });
});

describe('handleMakeMonthly', () => {
  const call = (body: unknown = { sessionId: SESSION_ID }) =>
    handleMakeMonthly({ slug: 'spring', body, headers: HEADERS, now: NOW });

  it('answers 200 started', async () => {
    answerStripe(paidSession());

    expect(await call()).toEqual({ status: 200, body: { status: 'started' } });
  });

  it('answers 400 refused for a bad body', async () => {
    expect(await call({ sessionId: 42 })).toEqual({
      status: 400,
      body: { status: 'refused' },
    });
  });

  it('answers 429 over the rate limit', async () => {
    const ipHash = hashIp('203.0.113.7', 'secret');
    const hourBucket = new Date().toISOString().slice(0, 13);

    kvStore.set(
      `lp-rate:makeMonthly:${ipHash}:${hourBucket}`,
      RATE_LIMIT_PER_HOUR,
    );

    expect((await call()).status).toBe(429);
    expect(stripeRequestMock).not.toHaveBeenCalled();
  });

  it('answers 503 when Stripe is not configured', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');

    expect((await call()).status).toBe(503);
  });

  it('answers 502 and logs only the Stripe code when Stripe fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    stripeRequestMock.mockRejectedValue(
      new StripeRequestError(500, 'api_error', `detail ${SESSION_ID}`),
    );

    expect((await call()).status).toBe(502);
    expect(JSON.stringify(errorSpy.mock.calls)).toContain('api_error');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(SESSION_ID);
    errorSpy.mockRestore();
  });
});
