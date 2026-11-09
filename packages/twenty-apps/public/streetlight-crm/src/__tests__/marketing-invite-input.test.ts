import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  generateRandomCode,
  INVITE_CODE_PATTERN,
  parseInviteInput,
  parseInviteName,
} from 'src/shared/marketing/invite-input';

const inviteBody = (overrides: Record<string, unknown> = {}) => ({
  senderFirstName: 'Ada',
  friendFirstName: 'Grace',
  website: '',
  turnstileToken: 'token',
  visitorKey: 'visitor-1',
  ...overrides,
});

describe('parseInviteName', () => {
  it('accepts names with marks', () => {
    expect(parseInviteName("Mary-Jo O'Neil")).toBe("Mary-Jo O'Neil");
    expect(parseInviteName('José')).toBe('José');
  });

  it('accepts initials and hyphenated names', () => {
    for (const name of ['J. R. Smith', 'Anne-Marie', 'Jr.', 'O’Neil']) {
      expect(parseInviteName(name)).toBe(name);
    }
  });

  it('refuses names that could hold a link', () => {
    for (const name of [
      'a<b',
      'a>b',
      'a/b',
      'a:b',
      'a@b',
      'Mike2',
      'evil.com',
      'Claim prize at evil.com',
      'a.b',
      'x\u202Ey',
      'x\u200By',
    ]) {
      expect(parseInviteName(name)).toBeNull();
    }
  });

  it('refuses empty and long names', () => {
    expect(parseInviteName('  ')).toBeNull();
    expect(parseInviteName('a'.repeat(41))).toBeNull();
    expect(parseInviteName('a'.repeat(40))).toBe('a'.repeat(40));
  });

  it('trims the name and refuses values that are not text', () => {
    expect(parseInviteName('  Ada ')).toBe('Ada');
    expect(parseInviteName(42)).toBeNull();
    expect(parseInviteName(undefined)).toBeNull();
  });
});

describe('parseInviteInput', () => {
  it('reads both names and the guard fields', () => {
    const token = 'A'.repeat(32);

    expect(parseInviteInput(inviteBody({ inviteToken: token }))).toEqual({
      ok: true,
      value: {
        senderFirstName: 'Ada',
        friendFirstName: 'Grace',
        website: '',
        turnstileToken: 'token',
        visitorKey: 'visitor-1',
        inviteToken: token,
      },
    });
  });

  it('refuses a body that is not an object or has a bad name', () => {
    expect(parseInviteInput(null).ok).toBe(false);
    expect(parseInviteInput([]).ok).toBe(false);
    expect(parseInviteInput(inviteBody({ senderFirstName: '' })).ok).toBe(
      false,
    );
    expect(parseInviteInput(inviteBody({ friendFirstName: 'a@b' })).ok).toBe(
      false,
    );
  });

  it('drops a malformed signup token and a long visitor key', () => {
    const parsed = parseInviteInput(
      inviteBody({ inviteToken: 'short', visitorKey: 'v'.repeat(65) }),
    );

    expect(parsed).toMatchObject({
      ok: true,
      value: { inviteToken: '', visitorKey: '' },
    });
  });
});

describe('generateRandomCode', () => {
  it('makes codes from the allowed characters', () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      expect(generateRandomCode(10, randomBytes)).toMatch(INVITE_CODE_PATTERN);
    }
  });

  it('skips biased bytes', () => {
    const bytes = () => new Uint8Array([255, 0, 61, 62]);

    expect(generateRandomCode(3, bytes)).toBe('A9A');
  });
});
