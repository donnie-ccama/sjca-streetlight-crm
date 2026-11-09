export type FormInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  smsConsent: boolean;
  honeypot: string;
  turnstileToken: string;
  visitorKey: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const readString = (value: unknown, maxLength: number): string =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

export const parseFormInput = (
  body: unknown,
): { ok: true; value: FormInput } | { ok: false; error: string } => {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Invalid request body.' };
  }

  const record = body as Record<string, unknown>;
  const email = readString(record.email, 254).toLowerCase();

  if (email === '') {
    return { ok: false, error: 'Email is required.' };
  }

  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: 'Email is not valid.' };
  }

  const rawPhone = readString(record.phone, 32);
  const phone = /\d/.test(rawPhone) ? rawPhone : '';
  const visitorKey = readString(record.visitorKey, 65);

  return {
    ok: true,
    value: {
      firstName: readString(record.firstName, 100),
      lastName: readString(record.lastName, 100),
      email,
      phone: phone === '' ? null : phone,
      smsConsent: record.smsConsent === 'on' || record.smsConsent === true,
      honeypot:
        typeof record.website === 'string' ? record.website.slice(0, 200) : '',
      turnstileToken: readString(record.turnstileToken, 4096),
      visitorKey: visitorKey.length > 64 ? '' : visitorKey,
    },
  };
};
