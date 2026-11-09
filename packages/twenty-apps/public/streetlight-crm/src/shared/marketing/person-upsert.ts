import type { Attribution } from 'src/shared/marketing/attribution';
import type { FormInput } from 'src/shared/marketing/form-input';

export type PersonMatch = {
  id: string;
  phone: string | null;
  smsConsent: boolean;
};

export type PersonUpsertDecision =
  | { kind: 'create'; data: Record<string, unknown> }
  | { kind: 'update'; id: string; data: Record<string, unknown> }
  | { kind: 'none'; id: string };

export const buildPhones = (rawPhone: string) => {
  const digits = rawPhone.replace(/\D/g, '');
  const isNorthAmerican =
    !rawPhone.trim().startsWith('+') &&
    (digits.length === 10 || (digits.length === 11 && digits.startsWith('1')));

  if (isNorthAmerican) {
    return {
      primaryPhoneNumber: digits.slice(-10),
      primaryPhoneCountryCode: 'US',
      primaryPhoneCallingCode: '+1',
    };
  }

  return {
    primaryPhoneNumber: digits,
    primaryPhoneCountryCode: '',
    primaryPhoneCallingCode: '',
  };
};

// Drops a leading North American 1 so "+1 555..." and "555..." compare equal.
const toComparablePhone = (rawPhone: string): string => {
  const digits = rawPhone.replace(/\D/g, '');

  return digits.length === 11 && digits.startsWith('1')
    ? digits.slice(1)
    : digits;
};

export const decidePersonUpsert = (input: {
  form: FormInput;
  byEmail: PersonMatch | null;
  byPhone: PersonMatch | null;
  attribution: Attribution;
  landingPageSlug: string;
  now: string;
}): PersonUpsertDecision => {
  const { form, attribution, landingPageSlug, now } = input;
  const match = input.byEmail ?? input.byPhone;

  if (match === null) {
    const data: Record<string, unknown> = {
      name: { firstName: form.firstName, lastName: form.lastName },
      emails: { primaryEmail: form.email },
      smsConsent: form.smsConsent,
      acquisitionSource: attribution.socialPostSlug ?? landingPageSlug,
      acquisitionNetwork: attribution.network,
    };

    if (form.phone !== null) {
      data.phones = buildPhones(form.phone);
    }

    if (form.smsConsent) {
      data.smsConsentAt = now;
      data.smsConsentSource = landingPageSlug;
    }

    return { kind: 'create', data };
  }

  // Existing people keep their name, email, and phone (spec X3).
  // Consent needs the submitted phone to be the person's phone, so an email alone cannot turn on texts (R19).
  const data: Record<string, unknown> = {};
  const submittedPhones = form.phone === null ? null : buildPhones(form.phone);
  const hasStoredPhone = match.phone !== null && match.phone !== '';
  const addsPhone = submittedPhones !== null && !hasStoredPhone;
  const isSamePhone =
    form.phone !== null &&
    match.phone !== null &&
    hasStoredPhone &&
    toComparablePhone(match.phone) === toComparablePhone(form.phone);

  if (addsPhone) {
    data.phones = submittedPhones;
  }

  if (form.smsConsent && !match.smsConsent && (addsPhone || isSamePhone)) {
    data.smsConsent = true;
    data.smsConsentAt = now;
    data.smsConsentSource = landingPageSlug;
  }

  return Object.keys(data).length === 0
    ? { kind: 'none', id: match.id }
    : { kind: 'update', id: match.id, data };
};
