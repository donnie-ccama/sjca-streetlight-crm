import { describe, expect, it } from 'vitest';

import { isValidSlug, toSlug } from 'src/shared/marketing/slug';

describe('isValidSlug', () => {
  it.each(['builder-test', 'learn-more', 'give2026', 'a'])('accepts %s', (slug) => {
    expect(isValidSlug(slug)).toBe(true);
  });

  it.each([
    '',
    'How is everything going?',
    'learn more',
    'Learn-More',
    '-learn',
    'learn-',
    'learn--more',
    'learn/more',
    'café',
  ])('rejects %s', (slug) => {
    expect(isValidSlug(slug)).toBe(false);
  });
});

describe('toSlug', () => {
  it('turns a headline into a slug', () => {
    expect(toSlug('How is everything going?')).toBe('how-is-everything-going');
  });

  it('trims and joins runs of spaces and symbols with one dash', () => {
    expect(toSlug('  Learn   more!! / now ')).toBe('learn-more-now');
  });

  it('drops accents', () => {
    expect(toSlug('Café Noël')).toBe('cafe-noel');
  });

  it('returns an empty string when nothing usable is left', () => {
    expect(toSlug('???')).toBe('');
  });

  it('keeps a valid slug as it is', () => {
    expect(toSlug('builder-test')).toBe('builder-test');
  });

  it('cuts a long slug at 60 characters without a dash at the end', () => {
    const slug = toSlug(`${'a'.repeat(59)} bcd`);

    expect(slug).toBe('a'.repeat(59));
    expect(isValidSlug(slug)).toBe(true);
  });
});
