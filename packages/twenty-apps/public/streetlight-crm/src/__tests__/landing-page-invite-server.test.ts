import { beforeEach, describe, expect, it, vi } from 'vitest';

type StoredRecord = Record<string, unknown> & { id: string };

type Store = {
  landingPages: StoredRecord[];
  landingPageInvites: StoredRecord[];
};

const { store, kvStore, verifyTurnstileMock, createInviteFailures } =
  vi.hoisted(() => ({
    store: { landingPages: [], landingPageInvites: [] } as Store,
    kvStore: new Map<string, unknown>(),
    verifyTurnstileMock: vi.fn(),
    createInviteFailures: [] as Error[],
  }));

type Filter = Record<string, Record<string, unknown> | undefined>;

const enumValue = (value: unknown): unknown =>
  typeof value === 'object' && value !== null && '__gqlEnum' in value
    ? (value as { __gqlEnum: string }).__gqlEnum
    : value;

const matchesFilter = (record: StoredRecord, filter: Filter): boolean =>
  Object.entries(filter).every(
    ([field, condition]) =>
      condition === undefined || record[field] === enumValue(condition.eq),
  );

vi.mock('src/logic-functions/workspace-gql', () => {
  const rawQuery = vi.fn(async (selection: Record<string, unknown>) => {
    const rootName = Object.keys(selection)[0] as keyof Store;
    const root = selection[rootName] as { __args: { filter: Filter } };
    const rows = store[rootName].filter((record) =>
      matchesFilter(record, root.__args.filter),
    );

    return { [rootName]: { edges: rows.map((node) => ({ node })) } };
  });

  const gql = vi.fn(
    async (query: string, variables: Record<string, unknown> = {}) => {
      if (!query.includes('createLandingPageInvite(')) {
        throw new Error(`Unexpected query: ${query}`);
      }

      const failure = createInviteFailures.shift();

      if (failure !== undefined) throw failure;

      const data = variables.data as Record<string, unknown>;
      const id = `invite-${store.landingPageInvites.length + 1}`;

      store.landingPageInvites.push({ ...data, id });

      return { createLandingPageInvite: { id } };
    },
  );

  return {
    gql,
    rawQuery,
    rawMutation: vi.fn(),
    gqlEnum: (value: string) => ({ __gqlEnum: value }),
  };
});

vi.mock('twenty-sdk/logic-function', () => ({
  kv: {
    get: vi.fn(async (key: string) => kvStore.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      kvStore.set(key, value);
    }),
    delete: vi.fn(async (key: string) => kvStore.delete(key)),
  },
}));

vi.mock('src/shared/marketing/spam-guard', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('src/shared/marketing/spam-guard')>();

  return { ...original, verifyTurnstileToken: verifyTurnstileMock };
});

import {
  createSignupToken,
  findInviteByCode,
  findInviteIdByCode,
  handleInviteSubmission,
} from 'src/logic-functions/landing-page-invite.server';
import { gql, rawQuery } from 'src/logic-functions/workspace-gql';
import { INVITE_CODE_PATTERN } from 'src/shared/marketing/invite-input';
import { hashIp, RATE_LIMIT_PER_HOUR } from 'src/shared/marketing/spam-guard';

const LIVE_PAGE: StoredRecord = {
  id: 'page-1',
  slug: 'spring',
  status: 'LIVE',
  headline: 'Spring appeal',
};

const HEADERS = { 'cf-connecting-ip': '203.0.113.7' };

const DUPLICATE_ERROR = new Error(
  'A duplicate entry was detected: unique constraint _landingPageInvite.IDX_code was violated',
);

const inviteBody = (overrides: Record<string, unknown> = {}) => ({
  senderFirstName: 'Ada',
  friendFirstName: 'Grace',
  website: '',
  turnstileToken: 'token',
  visitorKey: 'visitor-1',
  utm_source: 'instagram',
  ...overrides,
});

const submitInvite = (body: unknown = inviteBody(), slug = 'spring') =>
  handleInviteSubmission({ slug, body, headers: HEADERS });

beforeEach(() => {
  store.landingPages = [
    { ...LIVE_PAGE },
    { ...LIVE_PAGE, id: 'page-2', slug: 'summer' },
    { ...LIVE_PAGE, id: 'page-3', slug: 'draft-page', status: 'DRAFT' },
  ];
  store.landingPageInvites = [];
  createInviteFailures.length = 0;
  kvStore.clear();
  verifyTurnstileMock.mockReset();
  verifyTurnstileMock.mockResolvedValue(true);
  vi.mocked(gql).mockClear();
  vi.mocked(rawQuery).mockClear();
  vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret');
});

describe('handleInviteSubmission', () => {
  it('makes an invite and returns its code', async () => {
    const result = await submitInvite();

    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      ok: true,
      message: 'OK',
      code: expect.stringMatching(INVITE_CODE_PATTERN),
    });
    expect(store.landingPageInvites).toEqual([
      {
        id: 'invite-1',
        name: 'Ada invited Grace',
        code: result.body.code,
        landingPageId: 'page-1',
        senderFirstName: 'Ada',
        friendFirstName: 'Grace',
        senderId: null,
        visitorKey: 'visitor-1',
        ipHash: hashIp('203.0.113.7', 'secret'),
      },
    ]);
  });

  it('answers a filled honeypot with a code and saves nothing', async () => {
    const result = await submitInvite(inviteBody({ website: 'http://spam' }));

    expect(result.status).toBe(200);
    expect(result.body.code).toMatch(INVITE_CODE_PATTERN);
    expect(store.landingPageInvites).toHaveLength(0);
    expect(verifyTurnstileMock).not.toHaveBeenCalled();
  });

  it('fails closed when the Turnstile secret is missing', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');

    expect((await submitInvite()).status).toBe(503);
    expect(store.landingPageInvites).toHaveLength(0);
  });

  it('refuses a bad name', async () => {
    const result = await submitInvite(
      inviteBody({ friendFirstName: 'https://x' }),
    );

    expect(result.status).toBe(400);
    expect(result.body.ok).toBe(false);
    expect(store.landingPageInvites).toHaveLength(0);
  });

  it('refuses a missing Turnstile token', async () => {
    verifyTurnstileMock.mockResolvedValue(false);

    const result = await submitInvite(inviteBody({ turnstileToken: '' }));

    expect(result.status).toBe(400);
    expect(store.landingPageInvites).toHaveLength(0);
  });

  it('stops at the rate limit', async () => {
    for (let attempt = 0; attempt < RATE_LIMIT_PER_HOUR; attempt += 1) {
      expect((await submitInvite()).status).toBe(200);
    }

    expect((await submitInvite()).status).toBe(429);
    expect(store.landingPageInvites).toHaveLength(RATE_LIMIT_PER_HOUR);
  });

  it('refuses an unknown page', async () => {
    expect((await submitInvite(inviteBody(), 'unknown')).status).toBe(404);
    expect((await submitInvite(inviteBody(), 'draft-page')).status).toBe(404);
    expect(store.landingPageInvites).toHaveLength(0);
  });

  it('retries with a new code when the code is taken', async () => {
    createInviteFailures.push(DUPLICATE_ERROR);

    const result = await submitInvite();

    expect(result.status).toBe(200);
    expect(store.landingPageInvites).toHaveLength(1);
    expect(result.body.code).toBe(store.landingPageInvites[0].code);

    const attemptedCodes = vi
      .mocked(gql)
      .mock.calls.map(
        ([, variables]) => (variables?.data as { code: string }).code,
      );

    expect(attemptedCodes).toHaveLength(2);
    expect(attemptedCodes[0]).not.toBe(attemptedCodes[1]);
  });

  it('does not retry on other errors', async () => {
    createInviteFailures.push(new Error('Twenty API responded HTTP 500'));

    const result = await submitInvite();

    expect(result.status).toBe(500);
    expect(vi.mocked(gql)).toHaveBeenCalledTimes(1);
  });

  it('gives up after repeated duplicate codes', async () => {
    createInviteFailures.push(
      DUPLICATE_ERROR,
      DUPLICATE_ERROR,
      DUPLICATE_ERROR,
      DUPLICATE_ERROR,
      DUPLICATE_ERROR,
    );

    const result = await submitInvite();

    expect(result.status).toBe(500);
    expect(vi.mocked(gql)).toHaveBeenCalledTimes(4);
    expect(store.landingPageInvites).toHaveLength(0);
  });

  it('links the sender with a valid signup token and deletes it', async () => {
    const inviteToken = await createSignupToken({
      personId: 'person-1',
      landingPageId: 'page-1',
      now: new Date(),
    });

    expect(inviteToken).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(kvStore.get(`lp-invite-token:${inviteToken}`)).toMatchObject({
      personId: 'person-1',
      landingPageId: 'page-1',
    });

    const result = await submitInvite(inviteBody({ inviteToken }));

    expect(result.status).toBe(200);
    expect(store.landingPageInvites[0].senderId).toBe('person-1');
    expect(kvStore.has(`lp-invite-token:${inviteToken}`)).toBe(false);

    await submitInvite(inviteBody({ inviteToken }));

    expect(store.landingPageInvites[1].senderId).toBeNull();
  });

  it('ignores a signup token from another page or past its time', async () => {
    const otherPageToken = await createSignupToken({
      personId: 'person-1',
      landingPageId: 'page-2',
      now: new Date(),
    });
    const expiredToken = await createSignupToken({
      personId: 'person-1',
      landingPageId: 'page-1',
      now: new Date(Date.now() - 31 * 60 * 1000),
    });

    expect(
      (await submitInvite(inviteBody({ inviteToken: otherPageToken }))).status,
    ).toBe(200);
    expect(
      (await submitInvite(inviteBody({ inviteToken: expiredToken }))).status,
    ).toBe(200);

    expect(store.landingPageInvites).toHaveLength(2);
    expect(store.landingPageInvites.map((invite) => invite.senderId)).toEqual([
      null,
      null,
    ]);
  });

  it('never logs the names, the code, or the IP', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    createInviteFailures.push(
      new Error(
        'Variable "$data" got invalid value "Grace" at "data.friendFirstName"',
      ),
    );

    await submitInvite();

    const logged = JSON.stringify(
      errorSpy.mock.calls.map((call) => call.map(String)),
    );

    expect(logged).not.toContain('Grace');
    expect(logged).not.toContain('Ada');
    expect(logged).not.toContain('203.0.113.7');

    errorSpy.mockRestore();
  });
});

describe('findInviteByCode', () => {
  beforeEach(() => {
    store.landingPageInvites = [
      {
        id: 'invite-1',
        code: 'Ab3dE5gH9k',
        landingPageId: 'page-1',
        senderFirstName: 'Ada',
        friendFirstName: 'Grace',
      },
    ];
  });

  it('finds an invite of the same page', async () => {
    expect(await findInviteByCode('Ab3dE5gH9k', 'page-1')).toEqual({
      id: 'invite-1',
      senderFirstName: 'Ada',
      friendFirstName: 'Grace',
    });
    expect(await findInviteIdByCode('Ab3dE5gH9k', 'page-1')).toBe('invite-1');
  });

  it('finds no invite of another page', async () => {
    expect(await findInviteByCode('Ab3dE5gH9k', 'page-2')).toBeNull();
    expect(await findInviteIdByCode('Ab3dE5gH9k', 'page-2')).toBeNull();
  });

  it('looks up no invite for a malformed code', async () => {
    expect(await findInviteIdByCode('abc', 'page-1')).toBeNull();
    expect(await findInviteIdByCode(undefined, 'page-1')).toBeNull();
    expect(await findInviteByCode('Ab3dE5gH9k"', 'page-1')).toBeNull();
    expect(vi.mocked(gql)).toHaveBeenCalledTimes(0);
    expect(vi.mocked(rawQuery)).toHaveBeenCalledTimes(0);
  });
});
