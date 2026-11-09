import { describe, expect, it } from 'vitest';

import { parseFormInput } from 'src/shared/marketing/form-input';

const valid = { firstName: 'Ann', lastName: 'Lee', email: 'ann@example.org' };

describe('parseFormInput', () => {
  it('rejects non-objects, missing email, and invalid email', () => {
    expect(parseFormInput('x').ok).toBe(false);
    expect(parseFormInput(null).ok).toBe(false);
    expect(parseFormInput([]).ok).toBe(false);
    expect(parseFormInput({ ...valid, email: '' }).ok).toBe(false);
    expect(parseFormInput({ ...valid, email: 'nope' }).ok).toBe(false);
  });

  it('reads smsConsent as true only for "on" or true', () => {
    const consent = (smsConsent: unknown) => {
      const result = parseFormInput({ ...valid, smsConsent });
      return result.ok && result.value.smsConsent;
    };

    expect(consent('on')).toBe(true);
    expect(consent(true)).toBe(true);
    expect(consent('true')).toBe(false);
    expect(consent('yes')).toBe(false);
    expect(consent(1)).toBe(false);
    expect(consent(undefined)).toBe(false);
  });

  it('reads honeypot, token, phone, and visitorKey', () => {
    const result = parseFormInput({
      ...valid,
      phone: ' ',
      website: 'bot',
      turnstileToken: 't',
      visitorKey: 'abc',
    });

    expect(result.ok && result.value).toMatchObject({
      phone: null,
      honeypot: 'bot',
      turnstileToken: 't',
      visitorKey: 'abc',
    });
  });

  it('drops a visitorKey longer than 64 characters', () => {
    const result = parseFormInput({ ...valid, visitorKey: 'a'.repeat(65) });

    expect(result.ok && result.value.visitorKey).toBe('');
  });
});

describe('parseFormInput hardening', () => {
  it('treats a phone with no digits as null', () => {
    const result = parseFormInput({ ...valid, phone: 'abc' });

    expect(result.ok && result.value.phone).toBeNull();
  });

  it('counts a whitespace-only honeypot as filled', () => {
    const result = parseFormInput({ ...valid, website: '  ' });

    expect(result.ok && result.value.honeypot).toBe('  ');
  });
});
