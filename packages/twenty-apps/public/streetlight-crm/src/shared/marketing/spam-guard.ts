import { createHmac } from 'node:crypto';

import type { FormInput } from 'src/shared/marketing/form-input';

export const RATE_LIMIT_PER_HOUR = 10;
// Page views and give clicks are cheap and frequent; a shared network sends many.
export const BEACON_RATE_LIMIT_PER_HOUR = 120;

const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TURNSTILE_TIMEOUT_MS = 5000;

export const verifyTurnstileToken = async ({
  turnstileToken,
  secretKey,
  remoteIp,
  fetchImpl = fetch,
}: {
  turnstileToken: string;
  secretKey: string;
  remoteIp: string | null;
  fetchImpl?: typeof fetch;
}): Promise<boolean> => {
  if (secretKey === '' || turnstileToken === '') {
    return false;
  }

  try {
    const body = new URLSearchParams({
      secret: secretKey,
      response: turnstileToken,
    });

    if (remoteIp !== null && remoteIp !== '') {
      body.set('remoteip', remoteIp);
    }

    const response = await fetchImpl(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
    });

    if (!response.ok) {
      return false;
    }

    const result = (await response.json()) as { success?: unknown };

    return result.success === true;
  } catch {
    return false;
  }
};

// The honeypot is deliberately not trimmed: whitespace-only counts as filled.
export const isHoneypotFilled = (form: FormInput): boolean =>
  form.honeypot !== '';

// Keyed so the small IPv4 space cannot be reversed by hashing every address.
export const hashIp = (ip: string, secretKey: string): string =>
  createHmac('sha256', secretKey).update(ip).digest('hex');

export const isOverRateLimit = ({
  recentCount,
  limitPerHour,
}: {
  recentCount: number;
  limitPerHour: number;
}): boolean => recentCount >= limitPerHour;
