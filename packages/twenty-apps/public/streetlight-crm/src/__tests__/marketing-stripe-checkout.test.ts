import { describe, expect, it } from 'vitest';

import {
  buildCheckoutSessionParams,
  MAX_GIFT_CENTS,
  MIN_GIFT_CENTS,
  parseCheckoutInput,
} from 'src/shared/marketing/stripe-checkout';

const parse = (overrides: Record<string, unknown> = {}) =>
  parseCheckoutInput({ giftType: 'ONE_TIME', amountCents: 2500, ...overrides });

describe('parseCheckoutInput', () => {
  it('refuses 499 cents', () => {
    expect(parse({ amountCents: 499 })).toEqual({ ok: false });
  });

  it('accepts 500 cents', () => {
    expect(MIN_GIFT_CENTS).toBe(500);
    expect(parse({ amountCents: 500 }).ok).toBe(true);
  });

  it('accepts 5_000_000 cents', () => {
    expect(parse({ amountCents: 5_000_000 }).ok).toBe(true);
    expect(parse({ amountCents: MAX_GIFT_CENTS }).ok).toBe(true);
  });

  it('refuses 100_000_000 cents', () => {
    expect(parse({ amountCents: 100_000_000 })).toEqual({ ok: false });
  });

  it('refuses a fraction, a string, and an unknown gift type', () => {
    expect(parse({ amountCents: 500.5 })).toEqual({ ok: false });
    expect(parse({ amountCents: '2500' })).toEqual({ ok: false });
    expect(parse({ giftType: 'WEEKLY' })).toEqual({ ok: false });
    expect(parseCheckoutInput(null)).toEqual({ ok: false });
  });

  it('keeps only utm keys, capped at 100 characters', () => {
    const result = parse({
      utm: { utm_source: 'x'.repeat(150), utm_foo: 'no', utm_term: 5 },
    });

    expect(result).toMatchObject({
      ok: true,
      value: { utm: { utm_source: 'x'.repeat(100) } },
    });
  });

  it('keeps a valid invite code and drops an invalid one', () => {
    expect(parse({ inviteCode: 'Ab3dE5gH9k' })).toMatchObject({
      value: { inviteCode: 'Ab3dE5gH9k' },
    });
    expect(parse({ inviteCode: 'short' })).toMatchObject({
      value: { inviteCode: null },
    });
  });
});

const base = {
  slug: 'spring',
  baseUrl: 'https://give.example.org',
  organizationName: 'Example Org',
  amountCents: 2500,
  utm: { utm_source: 'instagram', utm_campaign: 'post-1' },
  inviteCode: 'Ab3dE5gH9k',
};

describe('buildCheckoutSessionParams', () => {
  it('builds a one-time payment session', () => {
    const params = buildCheckoutSessionParams({
      ...base,
      giftType: 'ONE_TIME',
    });

    expect(params).toMatchObject({
      mode: 'payment',
      submit_type: 'donate',
      customer_creation: 'always',
      payment_intent_data: {
        setup_future_usage: 'off_session',
        metadata: {
          lp_slug: 'spring',
          invite_code: 'Ab3dE5gH9k',
          utm_source: 'instagram',
          utm_campaign: 'post-1',
        },
      },
      success_url:
        'https://give.example.org/s/lp/spring/thanks?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://give.example.org/spring',
    });
    expect(params).not.toHaveProperty('subscription_data');
    expect(
      (params.line_items as { price_data: Record<string, unknown> }[])[0]
        .price_data,
    ).toEqual({
      currency: 'usd',
      unit_amount: 2500,
      product_data: { name: 'Gift to Example Org' },
    });
  });

  it('strips trailing slashes from the base url', () => {
    const params = buildCheckoutSessionParams({
      ...base,
      baseUrl: 'https://give.example.org/',
      giftType: 'MONTHLY',
    });

    expect(params.success_url).toBe(
      'https://give.example.org/s/lp/spring/thanks?session_id={CHECKOUT_SESSION_ID}',
    );
    expect(params.cancel_url).toBe('https://give.example.org/spring');
  });

  it('builds a monthly subscription session', () => {
    const params = buildCheckoutSessionParams({ ...base, giftType: 'MONTHLY' });

    expect(params).toMatchObject({
      mode: 'subscription',
      subscription_data: { metadata: { lp_slug: 'spring' } },
    });
    expect(params).not.toHaveProperty('payment_intent_data');
    expect(params).not.toHaveProperty('submit_type');
    expect(
      (
        params.line_items as {
          price_data: { recurring: unknown };
        }[]
      )[0].price_data.recurring,
    ).toEqual({ interval: 'month' });
  });

  it('omits empty metadata and falls back to a plain product name', () => {
    const params = buildCheckoutSessionParams({
      ...base,
      organizationName: '',
      utm: { utm_term: '' },
      inviteCode: null,
      giftType: 'ONE_TIME',
    });

    expect(
      (params.payment_intent_data as { metadata: unknown }).metadata,
    ).toEqual({ lp_slug: 'spring' });
    expect(
      (
        params.line_items as {
          price_data: { product_data: { name: string } };
        }[]
      )[0].price_data.product_data.name,
    ).toBe('Gift');
  });
});
