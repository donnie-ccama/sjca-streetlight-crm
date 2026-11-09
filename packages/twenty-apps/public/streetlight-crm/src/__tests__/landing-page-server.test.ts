import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type StoredRecord = Record<string, unknown> & { id: string };

type Store = {
  landingPages: StoredRecord[];
  socialPosts: StoredRecord[];
  people: StoredRecord[];
  messageListMembers: StoredRecord[];
  responses: StoredRecord[];
  landingPageInvites: StoredRecord[];
};

const {
  store,
  kvStore,
  verifyTurnstileMock,
  stripeRequestMock,
  createStaffTaskMock,
} = vi.hoisted(() => ({
  store: {
    landingPages: [],
    socialPosts: [],
    people: [],
    messageListMembers: [],
    responses: [],
    landingPageInvites: [],
  } as Store,
  kvStore: new Map<string, unknown>(),
  verifyTurnstileMock: vi.fn(),
  stripeRequestMock: vi.fn(),
  createStaffTaskMock: vi.fn(),
}));

type Filter = Record<string, Record<string, unknown> | undefined>;

const enumValue = (value: unknown): unknown =>
  typeof value === 'object' && value !== null && '__gqlEnum' in value
    ? (value as { __gqlEnum: string }).__gqlEnum
    : value;

const matchesFilter = (record: StoredRecord, filter: Filter): boolean =>
  Object.entries(filter).every(([field, condition]) => {
    if (condition === undefined) return true;

    if (field === 'emails') {
      const expected = (condition.primaryEmail as { eq: string }).eq;

      return (
        (record.emails as { primaryEmail: string }).primaryEmail === expected
      );
    }

    if (field === 'phones') {
      const expected = (condition.primaryPhoneNumber as { eq: string }).eq;
      const phones = record.phones as
        | { primaryPhoneNumber: string }
        | undefined;

      return phones?.primaryPhoneNumber === expected;
    }

    if ('is' in condition) {
      return (record[field] ?? null) === null;
    }

    return record[field] === enumValue(condition.eq);
  });

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
      const data = variables.data as Record<string, unknown>;
      const create = /create(\w+)\(/.exec(query);

      if (create !== null) {
        const collectionByType: Record<string, keyof Store> = {
          Person: 'people',
          MessageListMember: 'messageListMembers',
          Response: 'responses',
        };
        const collection = collectionByType[create[1]];
        const id = `${collection}-${store[collection].length + 1}`;

        store[collection].push({ ...data, id });

        return { [`create${create[1]}`]: { id } };
      }

      const update = /update(\w+)\(/.exec(query);

      if (update !== null) {
        const person = store.people.find(
          (record) => record.id === variables.id,
        );

        Object.assign(person ?? {}, data);

        return { [`update${update[1]}`]: { id: variables.id } };
      }

      throw new Error(`Unexpected query: ${query}`);
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

vi.mock('src/logic-functions/staff-task.server', () => ({
  createStaffTask: createStaffTaskMock,
}));

vi.mock('src/logic-functions/stripe-client', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('src/logic-functions/stripe-client')>();

  return { ...original, stripeRequest: stripeRequestMock };
});

import {
  handleBeacon,
  handleCheckout,
  handleFormSubmission,
  renderLandingPageRoute,
} from 'src/logic-functions/landing-page.server';
import { StripeRequestError } from 'src/logic-functions/stripe-client';
import {
  BEACON_RATE_LIMIT_PER_HOUR,
  hashIp,
  RATE_LIMIT_PER_HOUR,
} from 'src/shared/marketing/spam-guard';

const LIVE_PAGE: StoredRecord = {
  id: 'page-1',
  slug: 'spring',
  status: 'LIVE',
  headline: 'Spring appeal',
  body: { markdown: 'Hello' },
  heroImage: [],
  giveLabel: 'Give',
  prayLabel: 'Pray',
  volunteerLabel: 'Volunteer',
  prayerList: { id: 'list-1' },
};

const HEADERS = { 'cf-connecting-ip': '203.0.113.7' };

const prayBody = (overrides: Record<string, unknown> = {}) => ({
  utm_foo: 'dropped',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.org',
  phone: '',
  smsConsent: '',
  website: '',
  turnstileToken: 'token',
  visitorKey: 'visitor-1',
  utm_source: 'instagram',
  utm_campaign: 'post-1',
  ...overrides,
});

const submitPray = (body: unknown = prayBody(), slug = 'spring') =>
  handleFormSubmission({
    type: 'PRAY',
    slug,
    body,
    headers: HEADERS,
    query: {},
  });

beforeEach(() => {
  store.landingPages = [
    { ...LIVE_PAGE },
    { ...LIVE_PAGE, id: 'page-2', slug: 'draft-page', status: 'DRAFT' },
  ];
  store.socialPosts = [{ id: 'post-1', slug: 'post-1' }];
  store.people = [];
  store.messageListMembers = [];
  store.responses = [];
  store.landingPageInvites = [
    { id: 'invite-1', code: 'Ab3dE5gH9k', landingPageId: 'page-1' },
    { id: 'invite-2', code: 'Zz9yY8xX7w', landingPageId: 'page-2' },
  ];
  kvStore.clear();
  verifyTurnstileMock.mockReset();
  verifyTurnstileMock.mockResolvedValue(true);
  vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret');
  vi.stubEnv('TURNSTILE_SITE_KEY', 'site');
  vi.stubEnv('LANDING_PAGE_ORGANIZATION_NAME', 'Example Org');
  vi.stubEnv('LANDING_PAGE_BRAND_COLOR', '#123456');
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_secret');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_secret');
  vi.stubEnv('LANDING_PAGE_BASE_URL', 'https://give.example.org');
  vi.stubEnv('GIVING_CONTACT_EMAIL', '');
  createStaffTaskMock.mockReset();
  createStaffTaskMock.mockResolvedValue(undefined);
  stripeRequestMock.mockReset();
  stripeRequestMock.mockResolvedValue({
    id: 'cs_1',
    url: 'https://checkout.stripe.com/c/pay/cs_1',
  });
});

describe('renderLandingPageRoute', () => {
  it.each(['unknown', 'draft-page'])(
    'returns the not found page for slug %s',
    async (slug) => {
      const result = await renderLandingPageRoute({ slug, query: {} });

      expect(result.status).toBe(404);
      expect(result.body).toContain('Page not found');
      expect(result.headers['content-type']).toBe('text/html; charset=utf-8');
    },
  );

  it('renders a LIVE page without recording a visit', async () => {
    const result = await renderLandingPageRoute({
      slug: 'spring',
      query: { utm_source: 'instagram' },
    });

    expect(result.status).toBe(200);
    expect(result.body).toContain('Spring appeal');
    expect(result.headers['cache-control']).toBe('no-store');
    expect(store.responses).toHaveLength(0);
  });
});

describe('renderLandingPageRoute with an invite code', () => {
  const INVITE_CARD = 'class="invite-card"';

  beforeEach(() => {
    store.landingPageInvites = [
      {
        id: 'invite-1',
        code: 'Ab3dE5gH9k',
        landingPageId: 'page-1',
        senderFirstName: 'Sarah',
        friendFirstName: 'Mike',
      },
      {
        id: 'invite-2',
        code: 'Zz9yY8xX7w',
        landingPageId: 'page-2',
        senderFirstName: 'Sarah',
        friendFirstName: 'Mike',
      },
    ];
  });

  it('shows the invite card for a valid code', async () => {
    const result = await renderLandingPageRoute({
      slug: 'spring',
      query: { i: 'Ab3dE5gH9k' },
    });

    expect(result.status).toBe(200);
    expect(result.body).toContain('Mike, Sarah invited you.');
  });

  it('ignores a code from another page', async () => {
    const result = await renderLandingPageRoute({
      slug: 'spring',
      query: { i: 'Zz9yY8xX7w' },
    });

    expect(result.status).toBe(200);
    expect(result.body).not.toContain(INVITE_CARD);
  });

  it('ignores a malformed code', async () => {
    const result = await renderLandingPageRoute({
      slug: 'spring',
      query: { i: 'bad code!' },
    });

    expect(result.status).toBe(200);
    expect(result.body).not.toContain(INVITE_CARD);
  });

  it('renders the page when the invite lookup fails', async () => {
    store.landingPageInvites = null as never;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await renderLandingPageRoute({
      slug: 'spring',
      query: { i: 'Ab3dE5gH9k' },
    });

    expect(result.status).toBe(200);
    expect(result.body).not.toContain(INVITE_CARD);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('Ab3dE5gH9k');
    errorSpy.mockRestore();
  });

  it('keeps no-store on invited pages', async () => {
    const result = await renderLandingPageRoute({
      slug: 'spring',
      query: { i: 'Ab3dE5gH9k' },
    });

    expect(result.headers['cache-control']).toBe('no-store');
  });

  it('returns 404 for an archived page with a code', async () => {
    store.landingPages.push({
      ...LIVE_PAGE,
      id: 'page-3',
      slug: 'old-page',
      status: 'ARCHIVED',
    });

    const result = await renderLandingPageRoute({
      slug: 'old-page',
      query: { i: 'Ab3dE5gH9k' },
    });

    expect(result.status).toBe(404);
  });
});

const publishedSection = (overrides: Record<string, unknown> = {}) => ({
  id: 'section-1',
  sectionType: 'STORY',
  eyebrow: '',
  heading: 'Why we serve',
  text: 'Every child eats.',
  photo: null,
  primaryButton: null,
  secondaryButton: null,
  trustLine: '',
  badgeValue: '',
  badgeText: '',
  items: [],
  smallPrint: '',
  ...overrides,
});

describe('renderLandingPageRoute with published content', () => {
  it('renders the published sections', async () => {
    store.landingPages[0].publishedContent = {
      version: 1,
      sections: [publishedSection()],
    };

    const result = await renderLandingPageRoute({ slug: 'spring', query: {} });

    expect(result.status).toBe(200);
    expect(result.body).toContain('Why we serve');
    expect(result.body).toContain('Every child eats.');
    expect(result.headers['cache-control']).toBe('no-store');
  });

  it('maps published photo file ids to https urls and drops other schemes', async () => {
    store.landingPages[0].publishedContent = {
      version: 1,
      sections: [
        publishedSection({
          photo: { fileId: 'file-1', sourceFileId: 'draft-1', altText: 'Kids' },
        }),
        publishedSection({
          id: 'section-2',
          heading: 'Second',
          photo: { fileId: 'file-2', sourceFileId: 'draft-2', altText: 'Bad' },
        }),
      ],
    };
    store.landingPages[0].publishedPhotos = [
      { fileId: 'file-1', url: 'https://files.example.org/file-1?token=a' },
      { fileId: 'file-2', url: 'http://files.example.org/file-2' },
    ];

    const result = await renderLandingPageRoute({ slug: 'spring', query: {} });

    expect(result.body).toContain('https://files.example.org/file-1?token=a');
    expect(result.body).not.toContain('http://files.example.org/file-2');
  });

  it('uses the published title, share text, and share image, not the live ones', async () => {
    store.landingPages[0].headline = 'Live headline edit';
    store.landingPages[0].shareDescription = 'Live share edit';
    store.landingPages[0].shareImage = [
      { fileId: 'share-live', url: 'https://files.example.org/share-live' },
    ];
    store.landingPages[0].publishedContent = {
      version: 1,
      page: {
        title: 'Published title',
        shareDescription: 'Published share text',
        shareImage: {
          fileId: 'share-copy',
          sourceFileId: 'share-1',
          altText: '',
        },
      },
      sections: [publishedSection()],
    };
    store.landingPages[0].publishedPhotos = [
      { fileId: 'share-copy', url: 'https://files.example.org/share-copy' },
    ];

    const result = await renderLandingPageRoute({ slug: 'spring', query: {} });

    expect(result.body).toContain('Published title');
    expect(result.body).toContain('Published share text');
    expect(result.body).toContain('https://files.example.org/share-copy');
    expect(result.body).not.toContain('Live headline edit');
    expect(result.body).not.toContain('Live share edit');
    expect(result.body).not.toContain('share-live');
  });

  it('uses the live share image and description for the fallback when nothing is published', async () => {
    store.landingPages[0].shareDescription = 'Feed a child today';
    store.landingPages[0].shareImage = [
      { fileId: 'share-1', url: 'https://files.example.org/share-1' },
    ];

    const result = await renderLandingPageRoute({ slug: 'spring', query: {} });

    expect(result.body).toContain('Feed a child today');
    expect(result.body).toContain('https://files.example.org/share-1');
  });

  it('reads brand variables from the environment', async () => {
    vi.stubEnv('LANDING_PAGE_TAGLINE', 'Feeding families');
    vi.stubEnv('LANDING_PAGE_MAILING_ADDRESS', '1 Main St');
    vi.stubEnv('LANDING_PAGE_LOGO_URL', 'http://insecure.example.org/logo.png');
    vi.stubEnv('LANDING_PAGE_SITE_URL', 'https://example.org');

    const result = await renderLandingPageRoute({ slug: 'spring', query: {} });

    expect(result.body).toContain('Feeding families');
    expect(result.body).toContain('1 Main St');
    expect(result.body).toContain('https://example.org');
    expect(result.body).not.toContain('insecure.example.org');
  });

  it('renders the fallback with the JOIN form when there is no published content', async () => {
    const result = await renderLandingPageRoute({ slug: 'spring', query: {} });

    expect(result.status).toBe(200);
    expect(result.body).toContain('Spring appeal');
    expect(result.body).toContain('id="join"');
  });

  it('shows the give panel only when Stripe is set up', async () => {
    const live = await renderLandingPageRoute({ slug: 'spring', query: {} });

    expect(live.body).toContain('give-trigger"');
    expect(live.body).toContain('<dialog class="give-panel"');

    vi.stubEnv('STRIPE_SECRET_KEY', '');

    const off = await renderLandingPageRoute({ slug: 'spring', query: {} });

    expect(off.body).not.toContain('give-trigger"');
    expect(off.body).not.toContain('<dialog');
  });

  it('fills the give panel with the page amounts, or the defaults', async () => {
    const defaults = await renderLandingPageRoute({
      slug: 'spring',
      query: {},
    });

    expect(defaults.body).toContain('data-amount="100"');

    store.landingPages[0].giveAmounts = '10, 35, 250';

    const custom = await renderLandingPageRoute({ slug: 'spring', query: {} });

    expect(custom.body).toContain('data-amount="35"');
    expect(custom.body).toContain('data-amount="250"');
  });

  it('shows the giving question link only with a giving contact email', async () => {
    const without = await renderLandingPageRoute({ slug: 'spring', query: {} });

    expect(without.body).not.toContain('id="giving-question-trigger"');

    vi.stubEnv('GIVING_CONTACT_EMAIL', 'giving@example.org');

    const withEmail = await renderLandingPageRoute({
      slug: 'spring',
      query: {},
    });

    expect(withEmail.body).toContain('id="giving-question-trigger"');
    expect(withEmail.body).not.toContain('giving@example.org');
  });

  it('renders the fallback when published content is invalid', async () => {
    store.landingPages[0].publishedContent = { version: 2, sections: [] };

    const result = await renderLandingPageRoute({ slug: 'spring', query: {} });

    expect(result.status).toBe(200);
    expect(result.body).toContain('id="join"');
  });

  it('gives 404 for a DRAFT page even with published content', async () => {
    store.landingPages[1].publishedContent = {
      version: 1,
      sections: [publishedSection()],
    };

    const result = await renderLandingPageRoute({
      slug: 'draft-page',
      query: {},
    });

    expect(result.status).toBe(404);
  });

  it('never queries section records', async () => {
    const { rawQuery } = await import('src/logic-functions/workspace-gql');
    vi.mocked(rawQuery).mockClear();

    await renderLandingPageRoute({ slug: 'spring', query: {} });

    const roots = vi
      .mocked(rawQuery)
      .mock.calls.map(([selection]) => Object.keys(selection)[0]);

    expect(roots.every((root) => root === 'landingPages')).toBe(true);
  });
});

describe('handleFormSubmission', () => {
  it('answers a filled honeypot with ok and saves nothing', async () => {
    const result = await submitPray(prayBody({ website: 'http://spam' }));

    expect(result).toEqual({
      status: 200,
      body: { ok: true, message: expect.any(String) },
    });
    expect(store.people).toHaveLength(0);
    expect(store.responses).toHaveLength(0);
  });

  it('rejects a failed Turnstile check and saves nothing', async () => {
    verifyTurnstileMock.mockResolvedValue(false);

    const result = await submitPray();

    expect(result.status).toBe(400);
    expect(result.body.ok).toBe(false);
    expect(store.people).toHaveLength(0);
    expect(store.responses).toHaveLength(0);
  });

  it('rejects an IP over the hourly limit', async () => {
    for (let attempt = 0; attempt < RATE_LIMIT_PER_HOUR; attempt += 1) {
      expect((await submitPray()).status).toBe(200);
    }

    const result = await submitPray();

    expect(result.status).toBe(429);
    expect(store.responses).toHaveLength(RATE_LIMIT_PER_HOUR);
    expect(
      [...kvStore.keys()].every((key) => !key.includes('203.0.113.7')),
    ).toBe(true);
  });

  it('does not count page views against the form limit', async () => {
    for (let attempt = 0; attempt < RATE_LIMIT_PER_HOUR; attempt += 1) {
      const result = await handleBeacon({
        type: 'VISIT',
        slug: 'spring',
        body: { visitorKey: `visitor-${attempt}` },
        headers: HEADERS,
      });

      expect(result.status).toBe(200);
    }

    expect((await submitPray()).status).toBe(200);
  });

  it('fails closed when the Turnstile secret is missing', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');

    const result = await submitPray();

    expect(result.status).toBe(503);
    expect(result.body.ok).toBe(false);
    expect(store.people).toHaveLength(0);
  });

  it('returns 404 for a page that is not LIVE', async () => {
    const result = await submitPray(prayBody(), 'draft-page');

    expect(result.status).toBe(404);
    expect(store.people).toHaveLength(0);
  });

  it('creates a person, a list member, and a PRAY response for a new visitor', async () => {
    const result = await submitPray();

    expect(result.status).toBe(200);
    expect(store.people).toHaveLength(1);
    expect(store.messageListMembers).toEqual([
      expect.objectContaining({ listId: 'list-1', personId: 'people-1' }),
    ]);
    expect(store.responses).toEqual([
      expect.objectContaining({
        responseType: 'PRAY',
        personId: 'people-1',
        landingPageId: 'page-1',
        socialPostId: 'post-1',
        network: 'INSTAGRAM',
        isNewPerson: true,
        gaveEmail: true,
        gavePhone: false,
        gaveSmsConsent: false,
        visitorKey: 'visitor-1',
        utmRaw: { utm_source: 'instagram', utm_campaign: 'post-1' },
      }),
    ]);
    expect(store.responses[0].ipHash).toBe(hashIp('203.0.113.7', 'secret'));
  });

  it('does not add a second list member for a current member', async () => {
    store.people = [
      {
        id: 'person-9',
        emails: { primaryEmail: 'ada@example.org' },
        phones: { primaryPhoneNumber: '' },
        smsConsent: false,
      },
    ];
    store.messageListMembers = [
      { id: 'member-1', listId: 'list-1', personId: 'person-9' },
    ];

    const result = await submitPray();

    expect(result.status).toBe(200);
    expect(store.people).toHaveLength(1);
    expect(store.messageListMembers).toHaveLength(1);
    expect(store.responses).toEqual([
      expect.objectContaining({ personId: 'person-9', isNewPerson: false }),
    ]);
  });

  it('records gaveSmsConsent only when consent was granted on the Person', async () => {
    store.people = [
      {
        id: 'person-9',
        emails: { primaryEmail: 'ada@example.org' },
        phones: { primaryPhoneNumber: '5550001111' },
        smsConsent: false,
      },
    ];

    await submitPray(prayBody({ phone: '555-999-8888', smsConsent: 'on' }));

    expect(store.people[0].smsConsent).toBe(false);
    expect(store.responses[0]).toMatchObject({
      gavePhone: true,
      gaveSmsConsent: false,
    });

    await submitPray(prayBody({ phone: '555-000-1111', smsConsent: 'on' }));

    expect(store.people[0].smsConsent).toBe(true);
    expect(store.responses[1]).toMatchObject({ gaveSmsConsent: true });
  });

  it('records a VOLUNTEER response without touching the prayer list', async () => {
    const result = await handleFormSubmission({
      type: 'VOLUNTEER',
      slug: 'spring',
      body: prayBody(),
      headers: HEADERS,
      query: {},
    });

    expect(result.status).toBe(200);
    expect(store.messageListMembers).toHaveLength(0);
    expect(store.responses).toEqual([
      expect.objectContaining({ responseType: 'VOLUNTEER' }),
    ]);
  });
});

describe('giving question', () => {
  const fetchMock = vi.fn();

  const questionBody = (overrides: Record<string, unknown> = {}) =>
    prayBody({ message: 'How can I give stock?', ...overrides });

  const submitQuestion = (body: unknown = questionBody(), slug = 'spring') =>
    handleFormSubmission({
      type: 'GIVING_QUESTION',
      slug,
      body,
      headers: HEADERS,
      query: {},
    });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('GIVING_CONTACT_EMAIL', 'gifts@example.org');
    vi.stubEnv('RESEND_API_KEY', 're_key');
    vi.stubEnv('VOLUNTEER_EMAIL_FROM', 'Example <hello@example.org>');
  });

  it('returns 404 when GIVING_CONTACT_EMAIL is empty', async () => {
    vi.stubEnv('GIVING_CONTACT_EMAIL', '');

    const result = await submitQuestion();

    expect(result.status).toBe(404);
    expect(store.responses).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 404 for a page that is not LIVE', async () => {
    const result = await submitQuestion(questionBody(), 'draft-page');

    expect(result.status).toBe(404);
    expect(store.responses).toHaveLength(0);
  });

  it('needs a Turnstile token that passes', async () => {
    verifyTurnstileMock.mockResolvedValue(false);

    const result = await submitQuestion();

    expect(result.status).toBe(400);
    expect(store.responses).toHaveLength(0);
    expect(createStaffTaskMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the form rate limit', async () => {
    for (let attempt = 0; attempt < RATE_LIMIT_PER_HOUR; attempt += 1) {
      expect((await submitQuestion()).status).toBe(200);
    }

    expect((await submitQuestion()).status).toBe(429);
  });

  it('rejects a missing message and a message over 1000 characters', async () => {
    expect((await submitQuestion(questionBody({ message: '  ' }))).status).toBe(
      400,
    );
    expect(
      (await submitQuestion(questionBody({ message: 'a'.repeat(1001) })))
        .status,
    ).toBe(400);
    expect(store.responses).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a message of exactly 1000 characters', async () => {
    const result = await submitQuestion(
      questionBody({ message: 'a'.repeat(1000) }),
    );

    expect(result.status).toBe(200);
  });

  it('saves a GIVING_QUESTION response and a staff task on the person', async () => {
    const result = await submitQuestion();

    expect(result).toEqual({
      status: 200,
      body: { ok: true, message: 'Thank you. We will contact you soon.' },
    });
    expect(store.responses).toEqual([
      expect.objectContaining({
        responseType: 'GIVING_QUESTION',
        personId: 'people-1',
        landingPageId: 'page-1',
      }),
    ]);
    expect(createStaffTaskMock).toHaveBeenCalledWith({
      personId: 'people-1',
      title: 'Giving question',
      body: expect.stringContaining('How can I give stock?'),
    });
  });

  it('sends one Resend email to GIVING_CONTACT_EMAIL with reply-to the visitor', async () => {
    await submitQuestion();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    const payload = JSON.parse(init.body);

    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer re_key');
    expect(payload).toMatchObject({
      from: 'Example <hello@example.org>',
      to: 'gifts@example.org',
      reply_to: 'ada@example.org',
      subject: 'Giving question from Ada Lovelace',
    });
    expect(payload.text).toContain('How can I give stock?');
    expect(payload.text).toContain('Spring appeal');
  });

  it('skips the email but still saves when the Resend settings are empty', async () => {
    vi.stubEnv('RESEND_API_KEY', '');

    const result = await submitQuestion();

    expect(result.status).toBe(200);
    expect(store.responses).toHaveLength(1);
    expect(createStaffTaskMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 200 and logs only a status when the email fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await submitQuestion();

    expect(result.status).toBe(200);
    expect(store.responses).toHaveLength(1);
    expect(createStaffTaskMock).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(
      'ada@example.org',
    );
    errorSpy.mockRestore();
  });

  it('answers 200 when the email call throws', async () => {
    fetchMock.mockRejectedValue(new Error('network ada@example.org'));

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await submitQuestion();

    expect(result.status).toBe(200);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(
      'ada@example.org',
    );
    errorSpy.mockRestore();
  });

  it('still sends the email when the task fails', async () => {
    createStaffTaskMock.mockRejectedValue(new Error('task failed'));

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await submitQuestion();

    expect(result.status).toBe(200);
    expect(store.responses).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});

describe('invite tracking', () => {
  it('returns a signup token after a prayer signup', async () => {
    const result = await submitPray();

    expect(result.status).toBe(200);
    expect(result.body.inviteToken).toMatch(/^[A-Za-z0-9]{32}$/);

    const stored = kvStore.get(
      `lp-invite-token:${result.body.inviteToken}`,
    ) as {
      personId: string;
      landingPageId: string;
      expiresAt: string;
    };

    expect(stored).toMatchObject({
      personId: 'people-1',
      landingPageId: 'page-1',
    });
    expect(Date.parse(stored.expiresAt) - Date.now()).toBeGreaterThan(
      29 * 60 * 1000,
    );
    expect(Date.parse(stored.expiresAt) - Date.now()).toBeLessThanOrEqual(
      30 * 60 * 1000,
    );
  });

  it('returns no signup token after a volunteer signup', async () => {
    const result = await handleFormSubmission({
      type: 'VOLUNTEER',
      slug: 'spring',
      body: prayBody(),
      headers: HEADERS,
      query: {},
    });

    expect(result.status).toBe(200);
    expect(result.body.inviteToken).toBeUndefined();
  });

  it('records the invite on a signup from an invited page', async () => {
    await submitPray(prayBody({ inviteCode: 'Ab3dE5gH9k' }));

    expect(store.responses[0]).toMatchObject({ inviteId: 'invite-1' });
  });

  it('records no invite for a code of another page or a bad code', async () => {
    await submitPray(prayBody({ inviteCode: 'Zz9yY8xX7w' }));
    await submitPray(prayBody({ inviteCode: { eq: 'Ab3dE5gH9k' } }));

    expect(store.responses.map((response) => response.inviteId)).toEqual([
      null,
      null,
    ]);
  });

  describe('when the invite lookup fails', () => {
    beforeEach(() => {
      store.landingPageInvites = {
        filter: () => {
          throw new Error('lookup failed for Ab3dE5gH9k');
        },
      } as unknown as StoredRecord[];
    });

    it('still saves the signup without an invite and logs no code', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await submitPray(prayBody({ inviteCode: 'Ab3dE5gH9k' }));

      expect(result.status).toBe(200);
      expect(result.body.inviteToken).toMatch(/^[A-Za-z0-9]{32}$/);
      expect(store.responses[0]).toMatchObject({ inviteId: null });
      expect(consoleError.mock.calls).toEqual([
        ['Landing page invite lookup failed'],
      ]);
      consoleError.mockRestore();
    });

    it('still records beacons without an invite', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const body = { visitorKey: 'visitor-1', inviteCode: 'Ab3dE5gH9k' };

      const visit = await handleBeacon({
        type: 'VISIT',
        slug: 'spring',
        body,
        headers: HEADERS,
      });
      const click = await handleBeacon({
        type: 'GIVE_CLICK',
        slug: 'spring',
        body,
        headers: HEADERS,
      });

      expect([visit.status, click.status]).toEqual([200, 200]);
      expect(store.responses.map((response) => response.inviteId)).toEqual([
        null,
        null,
      ]);
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
        'Ab3dE5gH9k',
      );
      consoleError.mockRestore();
    });
  });

  it('records the invite on visit and give-click beacons', async () => {
    const body = { visitorKey: 'visitor-1', inviteCode: 'Ab3dE5gH9k' };

    await handleBeacon({
      type: 'VISIT',
      slug: 'spring',
      body,
      headers: HEADERS,
    });
    await handleBeacon({
      type: 'GIVE_CLICK',
      slug: 'spring',
      body,
      headers: HEADERS,
    });

    expect(store.responses).toEqual([
      expect.objectContaining({ responseType: 'VISIT', inviteId: 'invite-1' }),
      expect.objectContaining({
        responseType: 'GIVE_CLICK',
        inviteId: 'invite-1',
      }),
    ]);
  });
});

describe('handleBeacon', () => {
  const visit = (body: Record<string, unknown>) =>
    handleBeacon({ type: 'VISIT', slug: 'spring', body, headers: HEADERS });

  it('records one VISIT per visitor key, page, and post', async () => {
    const body = { visitorKey: 'visitor-1', utm_campaign: 'post-1' };

    expect((await visit(body)).status).toBe(200);
    expect((await visit(body)).status).toBe(200);

    expect(store.responses).toEqual([
      expect.objectContaining({
        responseType: 'VISIT',
        visitorKey: 'visitor-1',
        socialPostId: 'post-1',
      }),
    ]);
  });

  it('rejects beacons over the higher beacon limit', async () => {
    for (let attempt = 0; attempt < BEACON_RATE_LIMIT_PER_HOUR; attempt += 1) {
      expect((await visit({ visitorKey: `visitor-${attempt}` })).status).toBe(
        200,
      );
    }

    expect((await visit({ visitorKey: 'one-more' })).status).toBe(429);
  });

  it('ignores a visit with no visitor key', async () => {
    const result = await visit({ visitorKey: '' });

    expect(result.status).toBe(200);
    expect(store.responses).toHaveLength(0);
  });

  it('records every GIVE_CLICK without a person', async () => {
    const body = { visitorKey: 'visitor-1' };

    await handleBeacon({
      type: 'GIVE_CLICK',
      slug: 'spring',
      body,
      headers: HEADERS,
    });
    await handleBeacon({
      type: 'GIVE_CLICK',
      slug: 'spring',
      body,
      headers: HEADERS,
    });

    expect(store.responses).toHaveLength(2);
    expect(store.responses[0]).toMatchObject({
      responseType: 'GIVE_CLICK',
      personId: null,
      socialPostId: null,
      network: 'NONE',
    });
  });
});

describe('handleCheckout', () => {
  const checkout = (
    body: unknown = { giftType: 'MONTHLY', amountCents: 2500 },
    slug = 'spring',
  ) => handleCheckout({ slug, body, headers: HEADERS });

  it('returns only the Stripe url', async () => {
    const response = await checkout();

    expect(response).toEqual({
      status: 200,
      body: { url: 'https://checkout.stripe.com/c/pay/cs_1' },
    });
    expect(stripeRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/v1/checkout/sessions',
        params: expect.objectContaining({ mode: 'subscription' }),
      }),
    );
  });

  it('answers 404 for a page that is not live', async () => {
    expect((await checkout(undefined, 'draft-page')).status).toBe(404);
    expect(stripeRequestMock).not.toHaveBeenCalled();
  });

  it('answers 503 when Stripe is not configured', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');

    expect((await checkout()).status).toBe(503);
  });

  it('answers 503 when the base url is empty', async () => {
    vi.stubEnv('LANDING_PAGE_BASE_URL', '');

    expect((await checkout()).status).toBe(503);
  });

  it('answers 400 for a bad amount', async () => {
    expect(
      (await checkout({ giftType: 'ONE_TIME', amountCents: 100 })).status,
    ).toBe(400);
    expect(stripeRequestMock).not.toHaveBeenCalled();
  });

  it('answers 429 over the rate limit', async () => {
    const ipHash = hashIp('203.0.113.7', 'secret');
    const hourBucket = new Date().toISOString().slice(0, 13);

    kvStore.set(
      `lp-rate:checkout:${ipHash}:${hourBucket}`,
      RATE_LIMIT_PER_HOUR,
    );

    expect((await checkout()).status).toBe(429);
    expect(stripeRequestMock).not.toHaveBeenCalled();
  });

  it('answers 502 and logs only the Stripe code when Stripe fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    stripeRequestMock.mockRejectedValue(
      new StripeRequestError(
        400,
        'amount_too_large',
        'secret detail sk_test_secret',
      ),
    );

    expect((await checkout()).status).toBe(502);
    expect(JSON.stringify(errorSpy.mock.calls)).toContain('amount_too_large');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('secret detail');
    errorSpy.mockRestore();
  });
});

describe('handleCheckout salt', () => {
  it('answers 503 when the address salt is empty', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');

    expect(
      (
        await handleCheckout({
          slug: 'spring',
          body: { giftType: 'MONTHLY', amountCents: 2500 },
          headers: HEADERS,
        })
      ).status,
    ).toBe(503);
  });
});
