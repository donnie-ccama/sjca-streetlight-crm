import type { Network } from 'src/shared/marketing/types';

export type Attribution = {
  network: Network;
  socialPostSlug: string | null;
  utmRaw: Record<string, string>;
};

// The Give link sets utm_content to this prefix plus the landing page slug (R32).
export const LANDING_PAGE_UTM_CONTENT_PREFIX = 'lp-';

const MAX_UTM_VALUE_LENGTH = 100;

const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
];

const NETWORK_BY_SOURCE: Record<string, Network> = {
  facebook: 'FACEBOOK',
  fb: 'FACEBOOK',
  instagram: 'INSTAGRAM',
  ig: 'INSTAGRAM',
  tiktok: 'TIKTOK',
  youtube: 'YOUTUBE',
};

export const parseAttribution = (
  query: Record<string, string | undefined>,
): Attribution => {
  const utmRaw: Record<string, string> = {};

  for (const key of UTM_KEYS) {
    const value = query[key];

    if (typeof value === 'string' && value !== '') {
      utmRaw[key] = value.slice(0, MAX_UTM_VALUE_LENGTH);
    }
  }

  const source = (utmRaw.utm_source ?? '').trim().toLowerCase();
  const network: Network =
    source === '' ? 'NONE' : (Object.prototype.hasOwnProperty.call(NETWORK_BY_SOURCE, source)
        ? NETWORK_BY_SOURCE[source]
        : 'OTHER');

  return { network, socialPostSlug: utmRaw.utm_campaign ?? null, utmRaw };
};

export const buildPostLink = (input: {
  baseUrl: string;
  landingPageSlug: string;
  socialPostSlug: string;
  network: Network;
}): string => {
  const baseUrl = input.baseUrl.replace(/\/+$/, '');
  const params = new URLSearchParams({
    utm_source: input.network.toLowerCase(),
    utm_medium: 'social',
    utm_campaign: input.socialPostSlug,
  });

  return `${baseUrl}/${encodeURIComponent(input.landingPageSlug)}?${params.toString()}`;
};
