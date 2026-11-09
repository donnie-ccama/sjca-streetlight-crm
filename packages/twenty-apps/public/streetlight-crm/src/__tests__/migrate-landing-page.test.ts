import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
const gqlMock = vi.fn();
const publishMock = vi.fn();

vi.mock('twenty-sdk/logic-function', () => ({
  kv: {
    get: async (key: string) => store.get(key),
    set: async (key: string, value: unknown) => {
      store.set(key, value);
    },
    delete: async (key: string) => store.delete(key),
  },
}));
vi.mock('src/logic-functions/workspace-gql', () => ({
  gql: (...args: unknown[]) => gqlMock(...args),
}));
vi.mock('src/logic-functions/landing-page-publish.server', () => ({
  publishLandingPage: (...args: unknown[]) => publishMock(...args),
}));

import { migrateLandingPages } from 'src/logic-functions/migrate-landing-pages-to-sections.logic-function';
import {
  planMigration,
  type LegacyLandingPage,
} from 'src/shared/marketing/migrate-landing-page';

const legacyPage = (
  overrides: Partial<LegacyLandingPage> = {},
): LegacyLandingPage => ({
  id: 'page-1',
  status: 'LIVE',
  headline: 'Feed a child',
  bodyMarkdown:
    'First **bold** para with [a link](https://x.org).\n\nSecond para.\n\n- item one\n- item two',
  giveLabel: 'Give now',
  prayLabel: 'Join us',
  volunteerLabel: 'Volunteer',
  hasHeroImage: false,
  ...overrides,
});

describe('planMigration', () => {
  it('builds HERO, STORY, JOIN, VOLUNTEER in order', () => {
    const plan = planMigration(legacyPage());

    expect(plan.map((section) => section.sectionType)).toEqual([
      'HERO',
      'STORY',
      'JOIN',
      'VOLUNTEER',
    ]);
    expect(plan.map((section) => section.position)).toEqual([0, 1, 2, 3]);
    expect(plan.every((section) => section.landingPageId === 'page-1')).toBe(
      true,
    );
  });

  it('maps hero fields and strips markdown', () => {
    const [hero, story] = planMigration(legacyPage());

    expect(hero).toMatchObject({
      heading: 'Feed a child',
      text: 'First bold para with a link.',
      primaryButtonLabel: 'Give now',
      primaryButtonAction: 'GIVE',
      secondaryButtonLabel: 'Join the list',
      secondaryButtonAction: 'JOIN',
    });
    expect(story.text).toBe('Second para.\n\nitem one item two');
  });

  it('maps JOIN and VOLUNTEER labels', () => {
    const plan = planMigration(legacyPage());

    expect(plan[2]).toMatchObject({
      heading: 'Join us',
      primaryButtonLabel: 'Join us',
      primaryButtonAction: 'JOIN',
    });
    expect(plan[3]).toMatchObject({
      heading: 'Volunteer',
      primaryButtonLabel: 'Volunteer',
      primaryButtonAction: 'VOLUNTEER',
    });
  });

  it('defaults the give button label', () => {
    const [noLabel] = planMigration(legacyPage({ giveLabel: '' }));

    expect(noLabel).toMatchObject({
      primaryButtonLabel: 'Give',
      primaryButtonAction: 'GIVE',
    });
  });

  it('omits STORY, JOIN, VOLUNTEER and the join button when absent', () => {
    const plan = planMigration(
      legacyPage({
        bodyMarkdown: 'Only one.',
        prayLabel: '',
        volunteerLabel: null,
      }),
    );

    expect(plan.map((section) => section.sectionType)).toEqual(['HERO']);
    expect(plan[0].secondaryButtonLabel).toBeUndefined();
  });
});

const pageNode = (overrides: Record<string, unknown> = {}) => ({
  id: 'page-1',
  status: 'LIVE',
  headline: 'H',
  body: { markdown: 'One.\n\nTwo.' },
  heroImage: null,
  giveLabel: null,
  prayLabel: null,
  volunteerLabel: null,
  ...overrides,
});

const listResponse = (nodes: unknown[]) => ({
  landingPages: {
    edges: nodes.map((node) => ({ node })),
    pageInfo: { hasNextPage: false, endCursor: null },
  },
});
const sectionCount = (count: number) => ({
  landingPageSections: {
    edges: Array.from({ length: count }, () => ({ node: { id: 's' } })),
  },
});

const wireGql = (
  nodes: unknown[],
  sectionsByPage: Record<string, number> = {},
) => {
  gqlMock.mockImplementation(
    async (query: string, variables: Record<string, unknown>) => {
      if (query.includes('createLandingPageSections'))
        return { createLandingPageSections: [] };
      if (query.includes('landingPageSections')) {
        return sectionCount(
          sectionsByPage[variables.landingPageId as string] ?? 0,
        );
      }
      return listResponse(nodes);
    },
  );
};

describe('migrateLandingPages', () => {
  beforeEach(() => {
    store.clear();
    gqlMock.mockReset();
    publishMock.mockReset();
    publishMock.mockResolvedValue({ status: 200, body: { ok: true } });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('creates sections, sets the marker first, and publishes a LIVE page', async () => {
    wireGql([pageNode()]);

    const result = await migrateLandingPages();

    expect(store.get('starter-sections:page-1')).toBe(true);
    expect(store.get('migrated:page-1')).toBe(true);
    expect(
      gqlMock.mock.calls.some(([query]) =>
        String(query).includes('createLandingPageSections'),
      ),
    ).toBe(true);
    expect(publishMock).toHaveBeenCalledWith({
      landingPageId: 'page-1',
      publishedById: null,
    });
    expect(result).toMatchObject({ migrated: 1, published: 1, failed: 0 });
  });

  it('does not publish a DRAFT page', async () => {
    wireGql([pageNode({ status: 'DRAFT' })]);

    await migrateLandingPages();

    expect(publishMock).not.toHaveBeenCalled();
  });

  it('skips a page that already has sections', async () => {
    wireGql([pageNode({ publishedAt: '2026-11-01T00:00:00Z' })], {
      'page-1': 2,
    });

    const result = await migrateLandingPages();

    expect(result).toMatchObject({ migrated: 0, skipped: 1 });
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('logs the page id when a hero image is not moved', async () => {
    wireGql([pageNode({ heroImage: [{ fileId: 'f' }] })]);

    await migrateLandingPages();

    expect(console.log).toHaveBeenCalledWith(
      'landing page page-1: hero image not moved, re-upload in the builder',
    );
  });

  it('logs a failure with the page id and continues', async () => {
    const nodes = [pageNode({ id: 'bad' }), pageNode({ id: 'good' })];

    gqlMock.mockImplementation(
      async (query: string, variables: Record<string, unknown>) => {
        if (query.includes('createLandingPageSections')) {
          if (
            (variables.data as { landingPageId: string }[])[0].landingPageId ===
            'bad'
          ) {
            throw new Error('boom');
          }
          return {};
        }
        if (query.includes('landingPageSections')) return sectionCount(0);
        return listResponse(nodes);
      },
    );

    const result = await migrateLandingPages();

    expect(console.error).toHaveBeenCalledWith(
      'landing page bad migration failed: boom',
    );
    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ migrated: 1, failed: 1 });
  });

  it('logs when publish is refused', async () => {
    wireGql([pageNode()]);
    publishMock.mockResolvedValue({
      status: 502,
      body: { ok: false, message: 'x' },
    });

    const result = await migrateLandingPages();

    expect(console.error).toHaveBeenCalledWith(
      'landing page page-1 not published: status 502',
    );
    expect(result).toMatchObject({ failed: 1 });
  });

  it('retries publish once for a migrated LIVE page that was never published', async () => {
    store.set('migrated:page-1', true);
    wireGql([pageNode({ publishedContent: null, publishedAt: null })], {
      'page-1': 2,
    });

    await migrateLandingPages();

    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(
      gqlMock.mock.calls.some(([query]) =>
        String(query).includes('createLandingPageSections'),
      ),
    ).toBe(false);
  });

  it('does not publish a never-published LIVE page with sections and no migrated marker', async () => {
    wireGql([pageNode({ publishedContent: null, publishedAt: null })], {
      'page-1': 2,
    });

    const result = await migrateLandingPages();

    expect(publishMock).not.toHaveBeenCalled();
    expect(
      gqlMock.mock.calls.some(([query]) =>
        String(query).includes('createLandingPageSections'),
      ),
    ).toBe(false);
    expect(result).toMatchObject({ skipped: 1, published: 0 });
  });

  it('does not recreate sections for a published page with zero sections', async () => {
    wireGql([
      pageNode({
        publishedAt: '2026-11-01T00:00:00Z',
        publishedContent: { version: 1 },
      }),
    ]);

    const result = await migrateLandingPages();

    expect(
      gqlMock.mock.calls.some(([query]) =>
        String(query).includes('createLandingPageSections'),
      ),
    ).toBe(false);
    expect(publishMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ migrated: 0, skipped: 1 });
  });

  it('does not touch a page with zero sections and only publishedContent set', async () => {
    wireGql([pageNode({ publishedContent: { version: 1 } })]);

    await migrateLandingPages();

    expect(
      gqlMock.mock.calls.some(([query]) =>
        String(query).includes('createLandingPageSections'),
      ),
    ).toBe(false);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('does not touch a page with sections and publishedAt set', async () => {
    wireGql([pageNode({ publishedAt: '2026-11-01T00:00:00Z' })], {
      'page-1': 2,
    });

    await migrateLandingPages();

    expect(publishMock).not.toHaveBeenCalled();
  });

  it('removes the marker when section creation fails', async () => {
    gqlMock.mockImplementation(async (query: string) => {
      if (query.includes('createLandingPageSections')) throw new Error('boom');
      if (query.includes('landingPageSections')) return sectionCount(0);
      return listResponse([pageNode()]);
    });

    await migrateLandingPages();

    expect(store.has('starter-sections:page-1')).toBe(false);
    expect(store.has('migrated:page-1')).toBe(false);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('is safe to run twice: no duplicate sections, one publish per LIVE page', async () => {
    const created = new Set<string>();
    const published = new Set<string>();

    publishMock.mockImplementation(
      async ({ landingPageId }: { landingPageId: string }) => {
        published.add(landingPageId);
        return { status: 200, body: { ok: true } };
      },
    );
    gqlMock.mockImplementation(
      async (query: string, variables: Record<string, unknown>) => {
        if (query.includes('createLandingPageSections')) {
          for (const row of variables.data as { landingPageId: string }[])
            created.add(row.landingPageId);
          return {};
        }
        if (query.includes('landingPageSections')) {
          return sectionCount(
            created.has(variables.landingPageId as string) ? 1 : 0,
          );
        }
        return listResponse([
          pageNode({
            publishedAt: published.has('page-1')
              ? '2026-11-01T00:00:00Z'
              : null,
            publishedContent: published.has('page-1') ? { version: 1 } : null,
          }),
        ]);
      },
    );

    await migrateLandingPages();
    await migrateLandingPages();

    const createCalls = gqlMock.mock.calls.filter(([query]) =>
      String(query).includes('createLandingPageSections'),
    );

    expect(createCalls).toHaveLength(1);
    expect(publishMock).toHaveBeenCalledTimes(1);
  });
});
