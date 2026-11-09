import { describe, expect, it } from 'vitest';

import { buildPostLink, parseAttribution } from 'src/shared/marketing/attribution';

describe('parseAttribution', () => {
  it('maps utm_source and utm_campaign', () => {
    const result = parseAttribution({ utm_source: 'Instagram', utm_campaign: 'back-to-school' });

    expect(result.network).toBe('INSTAGRAM');
    expect(result.socialPostSlug).toBe('back-to-school');
    expect(result.utmRaw.utm_source).toBe('Instagram');
  });

  it('returns NONE and null for an empty query', () => {
    expect(parseAttribution({})).toEqual({ network: 'NONE', socialPostSlug: null, utmRaw: {} });
  });

  it('returns OTHER for an unknown source', () => {
    expect(parseAttribution({ utm_source: 'newsletter' }).network).toBe('OTHER');
  });
});

describe('buildPostLink', () => {
  const base = { landingPageSlug: 'learn-more', socialPostSlug: 'p1', network: 'TIKTOK' as const };

  it('builds the tracked link and avoids a double slash', () => {
    expect(buildPostLink({ ...base, baseUrl: 'https://give.example.org/' })).toBe(
      'https://give.example.org/learn-more?utm_source=tiktok&utm_medium=social&utm_campaign=p1',
    );
    expect(buildPostLink({ ...base, baseUrl: 'https://give.example.org' })).toBe(
      'https://give.example.org/learn-more?utm_source=tiktok&utm_medium=social&utm_campaign=p1',
    );
  });
});

describe('parseAttribution hardening', () => {
  it('ignores inherited property names as sources', () => {
    for (const source of ['constructor', '__proto__', 'toString']) {
      expect(parseAttribution({ utm_source: source }).network).toBe('OTHER');
    }
  });

  it('keeps only the five standard utm keys', () => {
    const result = parseAttribution({
      utm_source: 'x',
      utm_medium: 'm',
      utm_campaign: 'c',
      utm_term: 't',
      utm_content: 'n',
      utm_foo: 'drop',
      ['utm_' + 'k'.repeat(500)]: 'drop',
    });

    expect(Object.keys(result.utmRaw).sort()).toEqual([
      'utm_campaign',
      'utm_content',
      'utm_medium',
      'utm_source',
      'utm_term',
    ]);
  });

  it('caps each utm value at 100 characters', () => {
    const result = parseAttribution({ utm_campaign: 'a'.repeat(150) });

    expect(result.utmRaw.utm_campaign).toHaveLength(100);
    expect(result.socialPostSlug).toHaveLength(100);
  });
});
