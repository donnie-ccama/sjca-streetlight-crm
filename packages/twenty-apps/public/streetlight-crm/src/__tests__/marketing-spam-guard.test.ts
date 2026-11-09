import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import type { FormInput } from 'src/shared/marketing/form-input';
import {
  RATE_LIMIT_PER_HOUR,
  hashIp,
  isHoneypotFilled,
  isOverRateLimit,
  verifyTurnstileToken,
} from 'src/shared/marketing/spam-guard';

const respondWith = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

const baseInput = {
  turnstileToken: 'tok',
  secretKey: 'secret',
  remoteIp: '1.2.3.4',
};

describe('verifyTurnstileToken', () => {
  it('returns true when Cloudflare reports success', async () => {
    const fetchImpl = respondWith({ success: true });

    expect(await verifyTurnstileToken({ ...baseInput, fetchImpl })).toBe(true);
  });

  it('returns false when Cloudflare reports failure', async () => {
    const fetchImpl = respondWith({ success: false });

    expect(await verifyTurnstileToken({ ...baseInput, fetchImpl })).toBe(
      false,
    );
  });

  it('returns false on network error, non-JSON, and non-2xx', async () => {
    const throwing = vi.fn(async () => {
      throw new Error('network');
    });
    const nonJson = vi.fn(async () => new Response('<html>', { status: 200 }));

    expect(
      await verifyTurnstileToken({ ...baseInput, fetchImpl: throwing }),
    ).toBe(false);
    expect(
      await verifyTurnstileToken({ ...baseInput, fetchImpl: nonJson }),
    ).toBe(false);
    expect(
      await verifyTurnstileToken({
        ...baseInput,
        fetchImpl: respondWith({ success: true }, 500),
      }),
    ).toBe(false);
  });

  it('returns false for an empty secret or token without calling fetch', async () => {
    const fetchImpl = respondWith({ success: true });

    expect(
      await verifyTurnstileToken({ ...baseInput, secretKey: '', fetchImpl }),
    ).toBe(false);
    expect(
      await verifyTurnstileToken({
        ...baseInput,
        turnstileToken: '',
        fetchImpl,
      }),
    ).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts a form-encoded body and omits remoteip when null', async () => {
    const fetchImpl = respondWith({ success: true });

    await verifyTurnstileToken({ ...baseInput, fetchImpl });
    await verifyTurnstileToken({ ...baseInput, remoteIp: null, fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const withoutIp = fetchImpl.mock.calls[1] as unknown as [
      string,
      RequestInit,
    ];

    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(init.method).toBe('POST');
    const params = new URLSearchParams(String(init.body));
    expect(params.get('secret')).toBe('secret');
    expect(params.get('response')).toBe('tok');
    expect(params.get('remoteip')).toBe('1.2.3.4');
    expect(new URLSearchParams(String(withoutIp[1].body)).has('remoteip')).toBe(
      false,
    );
  });
});

describe('isHoneypotFilled', () => {
  const form = (honeypot: string) => ({ honeypot }) as FormInput;

  it('treats any non-empty string, including whitespace, as filled', () => {
    expect(isHoneypotFilled(form(''))).toBe(false);
    expect(isHoneypotFilled(form('bot'))).toBe(true);
    expect(isHoneypotFilled(form('  '))).toBe(true);
  });
});

describe('hashIp', () => {
  it('returns a stable keyed hex digest that depends on the key', () => {
    expect(hashIp('1.2.3.4', 'key-a')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashIp('1.2.3.4', 'key-a')).toBe(hashIp('1.2.3.4', 'key-a'));
    expect(hashIp('1.2.3.4', 'key-a')).not.toBe(hashIp('1.2.3.5', 'key-a'));
    expect(hashIp('1.2.3.4', 'key-a')).not.toBe(hashIp('1.2.3.4', 'key-b'));
  });

  it('is not a plain SHA-256 of the address', () => {
    expect(hashIp('1.2.3.4', 'key-a')).not.toBe(
      createHash('sha256').update('1.2.3.4').digest('hex'),
    );
  });
});

describe('isOverRateLimit', () => {
  it('is true at the limit and false below it', () => {
    expect(RATE_LIMIT_PER_HOUR).toBe(10);
    expect(isOverRateLimit({ recentCount: 10, limitPerHour: 10 })).toBe(true);
    expect(isOverRateLimit({ recentCount: 9, limitPerHour: 10 })).toBe(false);
  });
});
