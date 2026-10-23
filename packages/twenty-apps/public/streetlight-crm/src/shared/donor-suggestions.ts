export interface DonorSuggestion {
  type: 'PERSON' | 'COMPANY';
  id: string;
  label: string;
  addressLines: string[];
}

export interface MailingAddressValue {
  addressStreet1?: unknown;
  addressStreet2?: unknown;
  addressCity?: unknown;
  addressState?: unknown;
  addressPostcode?: unknown;
  addressCountry?: unknown;
}

export interface HouseholdAddressCandidate {
  mailingAddress?: MailingAddressValue | null;
}

export interface HouseholdMembershipCandidate {
  isActive?: unknown;
  household?: HouseholdAddressCandidate | null;
}

const cleanPart = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim().replace(/\s+/g, ' ').slice(0, 200);
  return cleaned || undefined;
};

/**
 * Formats only the postal components needed for donor confirmation. Latitude,
 * longitude, and unrelated household data never enter the suggestion payload.
 */
export const formatMailingAddress = (
  value: MailingAddressValue | null | undefined,
): string[] => {
  if (!value) return [];

  const street = [
    cleanPart(value.addressStreet1),
    cleanPart(value.addressStreet2),
  ].filter(Boolean) as string[];
  const city = cleanPart(value.addressCity);
  const state = cleanPart(value.addressState);
  const postcode = cleanPart(value.addressPostcode);
  const country = cleanPart(value.addressCountry);
  const locality = [city, [state, postcode].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');

  return [street.join(', '), locality, country].filter(Boolean) as string[];
};

/**
 * Uses the primary household when it has a mailing address, otherwise the
 * first active household membership. Inactive household data is ignored.
 */
export const resolvePersonAddressLines = (
  primaryHouseholds: HouseholdAddressCandidate[],
  memberships: HouseholdMembershipCandidate[],
): string[] => {
  for (const household of primaryHouseholds) {
    const lines = formatMailingAddress(household.mailingAddress);
    if (lines.length > 0) return lines;
  }

  for (const membership of memberships) {
    if (membership.isActive !== true) continue;
    const lines = formatMailingAddress(membership.household?.mailingAddress);
    if (lines.length > 0) return lines;
  }

  return [];
};
