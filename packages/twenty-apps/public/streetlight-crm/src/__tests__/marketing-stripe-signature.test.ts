import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { encodeStripeForm } from 'src/logic-functions/stripe-client';
import { verifyStripeSignature } from 'src/shared/marketing/stripe-signature';

const SECRET = 'example_whsec_secret';
const RAW_BODY = '{"id":"evt_test_1"}';
const TIMESTAMP = 1_800_000_000;

const sign = (body: string, secret: string, timestamp: number): string =>
  createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

describe('verifyStripeSignature', () => {
  const valid = sign(RAW_BODY, SECRET, TIMESTAMP);
  const check = (
    overrides: Partial<Parameters<typeof verifyStripeSignature>[0]>,
  ) =>
    verifyStripeSignature({
      rawBody: RAW_BODY,
      header: `t=${TIMESTAMP},v1=${valid}`,
      secret: SECRET,
      nowSeconds: TIMESTAMP,
      ...overrides,
    });

  it('accepts a valid signature', () => {
    expect(check({})).toBe(true);
  });

  it('accepts when the second v1 value matches', () => {
    expect(check({ header: `t=${TIMESTAMP},v1=bad,v1=${valid}` })).toBe(true);
  });

  it('rejects a changed body', () => {
    expect(check({ rawBody: '{"id":"evt_test_2"}' })).toBe(false);
  });

  it('rejects a wrong secret', () => {
    expect(check({ secret: 'whsec_other' })).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(check({ header: '' })).toBe(false);
  });

  it('rejects a timestamp older than 300 seconds', () => {
    expect(check({ nowSeconds: TIMESTAMP + 301 })).toBe(false);
  });
});

describe('encodeStripeForm', () => {
  it('encodes nested params', () => {
    expect(
      encodeStripeForm({
        metadata: { lp_slug: 'a b' },
        line_items: [{ quantity: 1 }],
      }),
    ).toBe('metadata%5Blp_slug%5D=a+b&line_items%5B0%5D%5Bquantity%5D=1');
  });
});
