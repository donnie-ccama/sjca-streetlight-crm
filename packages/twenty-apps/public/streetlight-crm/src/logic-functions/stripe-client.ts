const STRIPE_API_BASE_URL = 'https://api.stripe.com';
// Pinned so a change to the account default cannot reshape the payloads.
export const STRIPE_API_VERSION = '2025-08-27.basil';

export class StripeRequestError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, code: string | null, message: string) {
    super(message);
    this.name = 'StripeRequestError';
    this.status = status;
    this.code = code;
  }
}

const readEnv = (name: string): string => (process.env[name] ?? '').trim();

export const isStripeConfigured = (): boolean =>
  readEnv('STRIPE_SECRET_KEY') !== '' &&
  readEnv('STRIPE_WEBHOOK_SECRET') !== '';

const appendFormEntries = (
  entries: [string, string][],
  key: string,
  value: unknown,
): void => {
  if (value === undefined || value === null) return;

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      appendFormEntries(entries, `${key}[${index}]`, item),
    );

    return;
  }

  if (typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(value)) {
      appendFormEntries(entries, `${key}[${childKey}]`, childValue);
    }

    return;
  }

  entries.push([key, String(value)]);
};

export const encodeStripeForm = (params: Record<string, unknown>): string => {
  const entries: [string, string][] = [];

  for (const [key, value] of Object.entries(params)) {
    appendFormEntries(entries, key, value);
  }

  return new URLSearchParams(entries).toString();
};

export const stripeRequest = async <TResult>({
  method,
  path,
  params = {},
  idempotencyKey,
}: {
  method: 'GET' | 'POST';
  path: string;
  params?: Record<string, unknown>;
  idempotencyKey?: string;
}): Promise<TResult> => {
  const secretKey = readEnv('STRIPE_SECRET_KEY');

  if (secretKey === '') {
    throw new StripeRequestError(0, null, 'Stripe is not configured');
  }

  const encoded = encodeStripeForm(params);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    'Stripe-Version': STRIPE_API_VERSION,
  };

  if (idempotencyKey !== undefined) headers['Idempotency-Key'] = idempotencyKey;

  let url = `${STRIPE_API_BASE_URL}${path}`;
  let body: string | undefined;

  if (method === 'GET') {
    if (encoded !== '') url += `?${encoded}`;
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = encoded;
  }

  const response = await fetch(url, { method, headers, body });
  const payload = (await response.json().catch(() => null)) as {
    error?: { code?: unknown; message?: unknown };
  } | null;

  if (!response.ok) {
    const code =
      typeof payload?.error?.code === 'string' ? payload.error.code : null;
    const message =
      typeof payload?.error?.message === 'string'
        ? payload.error.message
        : `Stripe API responded HTTP ${response.status}`;

    throw new StripeRequestError(response.status, code, message);
  }

  return payload as TResult;
};
