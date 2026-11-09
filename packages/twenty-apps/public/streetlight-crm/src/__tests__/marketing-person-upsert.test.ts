import { describe, expect, it } from 'vitest';

import type { FormInput } from 'src/shared/marketing/form-input';
import { decidePersonUpsert } from 'src/shared/marketing/person-upsert';

const form: FormInput = {
  firstName: 'Ann',
  lastName: 'Lee',
  email: 'ann@example.org',
  phone: null,
  smsConsent: false,
  honeypot: '',
  turnstileToken: 't',
  visitorKey: 'v',
};
const attribution = {
  network: 'TIKTOK' as const,
  socialPostSlug: 'p1',
  utmRaw: {},
};
const now = '2026-11-05T00:00:00.000Z';
const run = (overrides: Partial<Parameters<typeof decidePersonUpsert>[0]>) =>
  decidePersonUpsert({
    form,
    byEmail: null,
    byPhone: null,
    attribution,
    landingPageSlug: 'learn-more',
    now,
    ...overrides,
  });

describe('decidePersonUpsert', () => {
  it('creates a person with acquisition fields and the form consent', () => {
    const result = run({ form: { ...form, smsConsent: true, phone: '(555) 123-4567' } });

    expect(result.kind).toBe('create');
    if (result.kind !== 'create') return;
    expect(result.data).toMatchObject({
      name: { firstName: 'Ann', lastName: 'Lee' },
      emails: { primaryEmail: 'ann@example.org' },
      acquisitionSource: 'p1',
      acquisitionNetwork: 'TIKTOK',
      smsConsent: true,
      smsConsentAt: now,
      smsConsentSource: 'learn-more',
      phones: {
        primaryPhoneNumber: '5551234567',
        primaryPhoneCountryCode: 'US',
        primaryPhoneCallingCode: '+1',
      },
    });
  });

  it('creates with smsConsent false when the box is not ticked (X2)', () => {
    const result = run({});

    expect(result.kind === 'create' && result.data.smsConsent).toBe(false);
    expect(result.kind === 'create' && 'smsConsentAt' in result.data).toBe(false);
  });

  it('never overwrites name, email, or phone of an email match (X3)', () => {
    const result = run({
      byEmail: { id: 'p', phone: '5550000000', smsConsent: true },
      form: { ...form, phone: '5559999999', smsConsent: true },
    });

    expect(result).toEqual({ kind: 'none', id: 'p' });
  });

  it('adds a missing phone to an email match', () => {
    const result = run({
      byEmail: { id: 'p', phone: null, smsConsent: false },
      form: { ...form, phone: '5551234567' },
    });

    expect(result.kind).toBe('update');
    if (result.kind !== 'update') return;
    expect(Object.keys(result.data)).toEqual(['phones']);
  });

  it('does not set consent on an email match when no phone is given (R19)', () => {
    const result = run({
      byEmail: { id: 'p', phone: null, smsConsent: false },
      form: { ...form, smsConsent: true },
    });

    expect(result).toEqual({ kind: 'none', id: 'p' });
  });

  it('does not set consent on an email match with a different phone (R19)', () => {
    const result = run({
      byEmail: { id: 'p', phone: '5550000000', smsConsent: false },
      form: { ...form, phone: '5559999999', smsConsent: true },
    });

    expect(result).toEqual({ kind: 'none', id: 'p' });
  });

  it('sets consent on an email match with the same phone (R19)', () => {
    const result = run({
      byEmail: { id: 'p', phone: '5551234567', smsConsent: false },
      form: { ...form, phone: '+1 (555) 123-4567', smsConsent: true },
    });

    expect(result).toEqual({
      kind: 'update',
      id: 'p',
      data: { smsConsent: true, smsConsentAt: now, smsConsentSource: 'learn-more' },
    });
  });

  it('adds the phone and sets consent on an email match with no phone (R19)', () => {
    const result = run({
      byEmail: { id: 'p', phone: null, smsConsent: false },
      form: { ...form, phone: '(555) 123-4567', smsConsent: true },
    });

    expect(result).toEqual({
      kind: 'update',
      id: 'p',
      data: {
        phones: {
          primaryPhoneNumber: '5551234567',
          primaryPhoneCountryCode: 'US',
          primaryPhoneCallingCode: '+1',
        },
        smsConsent: true,
        smsConsentAt: now,
        smsConsentSource: 'learn-more',
      },
    });
  });

  it('sets consent on a phone match when the box is ticked', () => {
    const result = run({
      byPhone: { id: 'q', phone: '5551234567', smsConsent: false },
      form: { ...form, phone: '555-123-4567', smsConsent: true },
    });

    expect(result.kind === 'update' && result.data.smsConsent).toBe(true);
  });

  it('never sets consent when the box is not ticked, and matches by phone', () => {
    const result = run({ byPhone: { id: 'q', phone: '5551234567', smsConsent: false } });

    expect(result).toEqual({ kind: 'none', id: 'q' });
  });
});
