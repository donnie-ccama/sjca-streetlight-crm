import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { uploadFileMock } = vi.hoisted(() => ({ uploadFileMock: vi.fn() }));

vi.mock('src/logic-functions/workspace-gql', () => ({
  gql: vi.fn(),
  metadataGql: vi.fn(),
}));

vi.mock('twenty-client-sdk/metadata', () => ({
  MetadataApiClient: class {
    uploadFile = uploadFileMock;
  },
}));

import { LANDING_PAGE_PUBLISHED_PHOTOS_FIELD_ID } from 'src/constants/marketing-identifiers';
import { publishLandingPage } from 'src/logic-functions/landing-page-publish.server';
import publishLandingPageFunction from 'src/logic-functions/publish-landing-page.logic-function';
import { gql, metadataGql } from 'src/logic-functions/workspace-gql';
import type { PublishedContent } from 'src/shared/marketing/sections';

const PAGE_ID = '6f1c2f5e-2a5d-4a3b-9b1e-0c6d1f2a3b4c';
const DRAFT_URL = 'https://crm.example.org/file/FilesField/draft-1?token=t1';
const NEW_DRAFT_URL = 'https://crm.example.org/file/FilesField/draft-2?token=t2';
const PRESIGNED_URL =
  'https://bucket.storage.example.org/draft-1.jpg?X-Amz-Signature=secret-sig';

type SectionNode = Record<string, unknown>;

const sectionNode = (overrides: SectionNode): SectionNode => ({
  id: 'section',
  sectionType: 'STATS',
  position: 1,
  isVisible: true,
  eyebrow: null,
  heading: null,
  text: null,
  photo: null,
  primaryButtonLabel: null,
  primaryButtonAction: null,
  primaryButtonUrl: null,
  secondaryButtonLabel: null,
  secondaryButtonAction: null,
  secondaryButtonUrl: null,
  trustLine: null,
  badgeValue: null,
  badgeText: null,
  items: null,
  smallPrint: null,
  inviteMessage: null,
  ...overrides,
});

const heroWithPhoto = (fileId: string, url: string) =>
  sectionNode({
    id: 'hero',
    sectionType: 'HERO',
    position: 1,
    heading: 'Feed a child',
    photo: [{ fileId, label: 'kids.jpg', url }],
  });

const storyWithPhoto = (fileId: string, url: string) =>
  sectionNode({
    id: 'story',
    sectionType: 'STORY',
    position: 2,
    heading: 'Our story',
    photo: [{ fileId, label: 'story.jpg', url }],
  });

describe('publishLandingPage', () => {
  const gqlMock = vi.mocked(gql);
  const metadataGqlMock = vi.mocked(metadataGql);
  const fetchMock = vi.fn();
  const updates: Record<string, unknown>[] = [];
  let page: Record<string, unknown> | null;
  let sections: SectionNode[];

  const lastUpdate = () => updates[updates.length - 1];

  const publishedSections = () =>
    (lastUpdate().publishedContent as PublishedContent).sections;

  beforeEach(() => {
    gqlMock.mockReset();
    metadataGqlMock.mockReset();
    fetchMock.mockReset();
    uploadFileMock.mockReset();
    updates.length = 0;
    page = { id: PAGE_ID, publishedContent: null, publishedPhotos: [] };
    sections = [];
    vi.stubGlobal('fetch', fetchMock);

    gqlMock.mockImplementation(async (query, variables) => {
      if (query.includes('updateLandingPage')) {
        updates.push((variables as { data: Record<string, unknown> }).data);

        return { updateLandingPage: { id: PAGE_ID } };
      }

      return {
        landingPages: { edges: page === null ? [] : [{ node: page }] },
        landingPageSections: {
          edges: sections.map((node) => ({ node })),
          pageInfo: { hasNextPage: false },
        },
      };
    });
    metadataGqlMock.mockResolvedValue({
      currentUser: {
        currentUserWorkspace: { id: 'user-workspace-1' },
        workspaceMember: { id: 'member-caller' },
      },
    });
    fetchMock.mockImplementation(async (url: string) => {
      if (url === DRAFT_URL || url === NEW_DRAFT_URL) {
        return new Response('image-bytes', { status: 200 });
      }

      throw new Error('unexpected fetch');
    });
    uploadFileMock.mockResolvedValue({ id: 'copy-new' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const callRoute = (event: Record<string, unknown>) =>
    publishLandingPageFunction.config.handler(event as never, {} as never) as Promise<{
      status?: number;
      body?: unknown;
    }>;

  it('refuses an API key caller with 403 before any read or write', async () => {
    const response = await callRoute({
      pathParameters: { id: PAGE_ID },
      body: {},
    });

    expect(response.status).toBe(403);
    expect(gqlMock).not.toHaveBeenCalled();
    expect(metadataGqlMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a token user that differs from the route user', async () => {
    metadataGqlMock.mockResolvedValue({
      currentUser: {
        currentUserWorkspace: { id: 'someone-else' },
        workspaceMember: { id: 'member-other' },
      },
    });

    const response = await callRoute({
      pathParameters: { id: PAGE_ID },
      userWorkspaceId: 'user-workspace-1',
    });

    expect(response.status).toBe(403);
    expect(gqlMock).not.toHaveBeenCalled();
  });

  it('refuses an id that is not a UUID with 400', async () => {
    const response = await callRoute({
      pathParameters: { id: 'not-a-uuid' },
      userWorkspaceId: 'user-workspace-1',
    });

    expect(response.status).toBe(400);
    expect(gqlMock).not.toHaveBeenCalled();
  });

  it('writes publishedById from the caller whatever the body says', async () => {
    sections = [sectionNode({ id: 'stats', heading: 'Numbers' })];

    const response = await callRoute({
      pathParameters: { id: PAGE_ID },
      userWorkspaceId: 'user-workspace-1',
      body: {
        publishedById: 'forged-member',
        publishedAt: '2020-01-01T00:00:00.000Z',
      },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true, sectionCount: 1 });
    expect(updates).toHaveLength(1);
    expect(lastUpdate().publishedById).toBe('member-caller');
    expect(lastUpdate().publishedAt).not.toBe('2020-01-01T00:00:00.000Z');
    expect(lastUpdate().publishedAt).toBe(
      (response.body as { publishedAt: string }).publishedAt,
    );
  });

  it('publishes the invite message', async () => {
    sections = [
      sectionNode({
        id: 'invite',
        sectionType: 'INVITE',
        inviteMessage: 'Hi {friend}',
      }),
    ];

    const response = await callRoute({
      pathParameters: { id: PAGE_ID },
      userWorkspaceId: 'user-workspace-1',
    });

    expect(response.status).toBe(200);
    expect(publishedSections()[0].inviteMessage).toBe('Hi {friend}');
  });

  it('publishes only visible sections, in position order', async () => {
    sections = [
      sectionNode({ id: 'third', position: 3, heading: 'Third' }),
      sectionNode({ id: 'hidden', position: 0, isVisible: false }),
      sectionNode({ id: 'first', position: 1, heading: 'First' }),
      sectionNode({ id: 'second', position: 2, heading: 'Second' }),
    ];

    const result = await publishLandingPage({
      landingPageId: PAGE_ID,
      publishedById: null,
    });

    expect(result.status).toBe(200);
    expect(publishedSections().map((section) => section.id)).toEqual([
      'first',
      'second',
      'third',
    ]);
    expect(lastUpdate().publishedById).toBeNull();
    expect(lastUpdate().publishedPhotos).toEqual([]);
  });

  it('returns 404 for a missing page and writes nothing', async () => {
    page = null;

    const result = await publishLandingPage({
      landingPageId: PAGE_ID,
      publishedById: 'member-caller',
    });

    expect(result.status).toBe(404);
    expect(updates).toHaveLength(0);
  });

  it('copies a new draft photo into publishedPhotos', async () => {
    sections = [heroWithPhoto('draft-1', DRAFT_URL)];

    await publishLandingPage({
      landingPageId: PAGE_ID,
      publishedById: 'member-caller',
    });

    expect(fetchMock).toHaveBeenCalledWith(DRAFT_URL, expect.anything());
    expect(uploadFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldMetadataUniversalIdentifier: LANDING_PAGE_PUBLISHED_PHOTOS_FIELD_ID,
      }),
    );
    expect(publishedSections()[0].photo).toEqual({
      fileId: 'copy-new',
      sourceFileId: 'draft-1',
      altText: 'kids.jpg',
    });
    expect(lastUpdate().publishedPhotos).toEqual([
      { fileId: 'copy-new', label: 'kids.jpg' },
    ]);
  });

  it('gives the copy a file name with the draft extension when the label has none', async () => {
    sections = [
      sectionNode({
        id: 'hero',
        sectionType: 'HERO',
        photo: [
          { fileId: 'draft-1', label: 'Ben at Starbucks', extension: '.jpg', url: DRAFT_URL },
        ],
      }),
    ];

    const result = await publishLandingPage({
      landingPageId: PAGE_ID,
      publishedById: 'member-caller',
    });

    expect(result.status).toBe(200);
    expect(uploadFileMock).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'Ben-at-Starbucks.jpg' }),
    );
    expect(publishedSections()[0].photo?.altText).toBe('Ben at Starbucks');
  });

  it('reuses the copy of an unchanged draft photo without an upload', async () => {
    sections = [heroWithPhoto('draft-1', DRAFT_URL)];
    page = {
      id: PAGE_ID,
      publishedContent: {
        version: 1,
        sections: [
          {
            id: 'hero',
            sectionType: 'HERO',
            photo: { fileId: 'copy-1', sourceFileId: 'draft-1', altText: 'kids.jpg' },
          },
        ],
      },
      publishedPhotos: [{ fileId: 'copy-1', label: 'kids.jpg' }],
    };

    await publishLandingPage({
      landingPageId: PAGE_ID,
      publishedById: 'member-caller',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(uploadFileMock).not.toHaveBeenCalled();
    expect(publishedSections()[0].photo?.fileId).toBe('copy-1');
    expect(lastUpdate().publishedPhotos).toEqual([
      { fileId: 'copy-1', label: 'kids.jpg' },
    ]);
  });

  it('gives a changed draft photo a new copy and drops the old copy', async () => {
    sections = [heroWithPhoto('draft-2', NEW_DRAFT_URL)];
    page = {
      id: PAGE_ID,
      publishedContent: {
        version: 1,
        sections: [
          {
            id: 'hero',
            sectionType: 'HERO',
            photo: { fileId: 'copy-1', sourceFileId: 'draft-1', altText: 'kids.jpg' },
          },
        ],
      },
      publishedPhotos: [{ fileId: 'copy-1', label: 'kids.jpg' }],
    };
    uploadFileMock.mockResolvedValue({ id: 'copy-2' });

    await publishLandingPage({
      landingPageId: PAGE_ID,
      publishedById: 'member-caller',
    });

    expect(fetchMock).toHaveBeenCalledWith(NEW_DRAFT_URL, expect.anything());
    expect(uploadFileMock).toHaveBeenCalledTimes(1);
    expect(publishedSections()[0].photo).toMatchObject({
      fileId: 'copy-2',
      sourceFileId: 'draft-2',
    });
    expect(lastUpdate().publishedPhotos).toEqual([
      { fileId: 'copy-2', label: 'kids.jpg' },
    ]);
  });

  it('does not copy a photo of a hidden section', async () => {
    sections = [
      { ...heroWithPhoto('draft-1', DRAFT_URL), isVisible: false },
      sectionNode({ id: 'stats', position: 2 }),
    ];

    await publishLandingPage({
      landingPageId: PAGE_ID,
      publishedById: 'member-caller',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(uploadFileMock).not.toHaveBeenCalled();
    expect(lastUpdate().publishedPhotos).toEqual([]);
  });

  it('returns 500 and writes nothing when the upload fails', async () => {
    sections = [heroWithPhoto('draft-1', DRAFT_URL)];
    uploadFileMock.mockRejectedValue(
      new Error(`upload of ${DRAFT_URL} via ${PRESIGNED_URL} failed`),
    );
    const consoleSpies = (['log', 'info', 'warn', 'error'] as const).map(
      (method) => vi.spyOn(console, method).mockImplementation(() => {}),
    );

    const result = await publishLandingPage({
      landingPageId: PAGE_ID,
      publishedById: 'member-caller',
    });

    expect(result.status).toBe(500);
    expect(result.body).toMatchObject({ ok: false });
    expect(JSON.stringify(result.body)).not.toContain('token=');
    expect(updates).toHaveLength(0);

    const logged = consoleSpies
      .flatMap((spy) => spy.mock.calls.flat())
      .map(String)
      .join(' ');

    expect(logged).not.toContain(DRAFT_URL);
    expect(logged).not.toContain(PRESIGNED_URL);
    expect(logged).not.toContain('token=');
    expect(logged).not.toContain('X-Amz-Signature');
    expect(JSON.stringify(result.body)).not.toContain('X-Amz-Signature');
  });

  it('returns 500 and writes nothing when photo 2 fails after photo 1 uploaded', async () => {
    sections = [
      heroWithPhoto('draft-1', DRAFT_URL),
      storyWithPhoto('draft-2', NEW_DRAFT_URL),
    ];
    uploadFileMock
      .mockResolvedValueOnce({ id: 'copy-1' })
      .mockRejectedValueOnce(new Error('second upload broke'));

    const result = await publishLandingPage({
      landingPageId: PAGE_ID,
      publishedById: 'member-caller',
    });

    expect(uploadFileMock).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(500);
    expect(updates).toHaveLength(0);
  });

  it('reuses an unchanged photo and copies a new one in the same publish', async () => {
    sections = [
      heroWithPhoto('draft-1', DRAFT_URL),
      storyWithPhoto('draft-2', NEW_DRAFT_URL),
    ];
    page = {
      id: PAGE_ID,
      publishedContent: {
        version: 1,
        sections: [
          {
            id: 'hero',
            sectionType: 'HERO',
            photo: { fileId: 'copy-1', sourceFileId: 'draft-1', altText: 'kids.jpg' },
          },
        ],
      },
      publishedPhotos: [{ fileId: 'copy-1', label: 'kids.jpg' }],
    };
    uploadFileMock.mockResolvedValue({ id: 'copy-2' });

    await publishLandingPage({
      landingPageId: PAGE_ID,
      publishedById: 'member-caller',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(NEW_DRAFT_URL, expect.anything());
    expect(publishedSections().map((section) => section.photo?.fileId)).toEqual([
      'copy-1',
      'copy-2',
    ]);
    expect(lastUpdate().publishedPhotos).toEqual([
      { fileId: 'copy-1', label: 'kids.jpg' },
      { fileId: 'copy-2', label: 'story.jpg' },
    ]);
  });

  it('copies afresh when publishedContent names a copy missing from publishedPhotos', async () => {
    sections = [heroWithPhoto('draft-1', DRAFT_URL)];
    page = {
      id: PAGE_ID,
      publishedContent: {
        version: 1,
        sections: [
          {
            id: 'hero',
            sectionType: 'HERO',
            photo: { fileId: 'copy-gone', sourceFileId: 'draft-1', altText: 'kids.jpg' },
          },
        ],
      },
      publishedPhotos: [],
    };

    await publishLandingPage({
      landingPageId: PAGE_ID,
      publishedById: 'member-caller',
    });

    expect(uploadFileMock).toHaveBeenCalledTimes(1);
    expect(publishedSections()[0].photo?.fileId).toBe('copy-new');
    expect(lastUpdate().publishedPhotos).toEqual([
      { fileId: 'copy-new', label: 'kids.jpg' },
    ]);
  });

  const SHARE_URL = 'https://crm.example.org/file/FilesField/share-1?token=t3';

  it('copies the title, share text, and share image into the published copy', async () => {
    sections = [sectionNode({ id: 'stats', heading: 'Numbers' })];
    page = {
      id: PAGE_ID,
      headline: 'Feed a child',
      shareDescription: 'Help us feed kids',
      shareImage: [{ fileId: 'share-1', label: 'share.jpg', url: SHARE_URL }],
      publishedContent: null,
      publishedPhotos: [],
    };
    fetchMock.mockResolvedValue(new Response('image-bytes', { status: 200 }));
    uploadFileMock.mockResolvedValue({ id: 'share-copy' });

    const result = await publishLandingPage({
      landingPageId: PAGE_ID,
      publishedById: 'member-caller',
    });

    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(SHARE_URL, expect.anything());
    expect((lastUpdate().publishedContent as PublishedContent).page).toEqual({
      title: 'Feed a child',
      shareDescription: 'Help us feed kids',
      shareImage: { fileId: 'share-copy', sourceFileId: 'share-1', altText: 'share.jpg' },
    });
    expect(lastUpdate().publishedPhotos).toEqual([
      { fileId: 'share-copy', label: 'share.jpg' },
    ]);
  });

  it('reuses the copy of an unchanged share image without an upload', async () => {
    page = {
      id: PAGE_ID,
      headline: 'Feed a child',
      shareDescription: '',
      shareImage: [{ fileId: 'share-1', label: 'share.jpg', url: SHARE_URL }],
      publishedContent: {
        version: 1,
        page: {
          title: 'Old',
          shareDescription: '',
          shareImage: { fileId: 'share-copy', sourceFileId: 'share-1', altText: 'share.jpg' },
        },
        sections: [],
      },
      publishedPhotos: [{ fileId: 'share-copy', label: 'share.jpg' }],
    };

    await publishLandingPage({
      landingPageId: PAGE_ID,
      publishedById: 'member-caller',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(uploadFileMock).not.toHaveBeenCalled();
    expect((lastUpdate().publishedContent as PublishedContent).page).toMatchObject({
      title: 'Feed a child',
      shareImage: { fileId: 'share-copy', sourceFileId: 'share-1' },
    });
    expect(lastUpdate().publishedPhotos).toEqual([
      { fileId: 'share-copy', label: 'share.jpg' },
    ]);
  });

  it('shares one copy when the share image is also a section photo', async () => {
    sections = [heroWithPhoto('draft-1', DRAFT_URL)];
    page = {
      id: PAGE_ID,
      shareImage: [{ fileId: 'draft-1', label: 'kids.jpg', url: DRAFT_URL }],
      publishedContent: null,
      publishedPhotos: [],
    };

    await publishLandingPage({
      landingPageId: PAGE_ID,
      publishedById: 'member-caller',
    });

    expect(uploadFileMock).toHaveBeenCalledTimes(1);
    expect((lastUpdate().publishedContent as PublishedContent).page.shareImage?.fileId).toBe(
      'copy-new',
    );
    expect(lastUpdate().publishedPhotos).toEqual([
      { fileId: 'copy-new', label: 'kids.jpg' },
    ]);
  });

  it('drops the share image copy when the share image is removed', async () => {
    page = {
      id: PAGE_ID,
      shareImage: [],
      publishedContent: {
        version: 1,
        page: {
          title: '',
          shareDescription: '',
          shareImage: { fileId: 'share-copy', sourceFileId: 'share-1', altText: '' },
        },
        sections: [],
      },
      publishedPhotos: [{ fileId: 'share-copy', label: 'share.jpg' }],
    };

    await publishLandingPage({
      landingPageId: PAGE_ID,
      publishedById: 'member-caller',
    });

    expect((lastUpdate().publishedContent as PublishedContent).page.shareImage).toBeNull();
    expect(lastUpdate().publishedPhotos).toEqual([]);
  });

  it('returns 500 with a plain message when loading the page fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    gqlMock.mockRejectedValue(new Error(`read failed at ${DRAFT_URL}`));

    const result = await publishLandingPage({
      landingPageId: PAGE_ID,
      publishedById: 'member-caller',
    });

    expect(result).toEqual({
      status: 500,
      body: { ok: false, message: 'The page could not be published. Please try again.' },
    });
    expect(errorSpy.mock.calls.flat().map(String).join(' ')).toBe(
      `landing page ${PAGE_ID} not published: page load failed`,
    );
  });

  it('returns 500 with a plain message when the final update fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    sections = [sectionNode({ id: 'stats', heading: 'Numbers' })];
    gqlMock.mockImplementation(async (query) => {
      if (query.includes('updateLandingPage')) throw new Error(`write failed ${DRAFT_URL}`);

      return {
        landingPages: { edges: [{ node: page }] },
        landingPageSections: {
          edges: sections.map((node) => ({ node })),
          pageInfo: { hasNextPage: false },
        },
      };
    });

    const result = await publishLandingPage({
      landingPageId: PAGE_ID,
      publishedById: 'member-caller',
    });

    expect(result).toEqual({
      status: 500,
      body: { ok: false, message: 'The page could not be published. Please try again.' },
    });
    expect(errorSpy.mock.calls.flat().map(String).join(' ')).toBe(
      `landing page ${PAGE_ID} not published: page update failed`,
    );
  });

  describe('storage redirects', () => {
    type Route = () => Response;
    let routes: Record<string, Route>;
    let requested: string[];

    const redirectTo = (location: string): Route => () =>
      new Response(null, { status: 302, headers: { location } });

    beforeEach(() => {
      requested = [];
      routes = {};
      sections = [heroWithPhoto('draft-1', DRAFT_URL)];
      // Mimics fetch: 'manual' returns the 3xx, 'error' rejects it, default follows.
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        requested.push(url);
        const route = routes[url];

        if (!route) throw new Error('unexpected fetch');

        const response = route();
        const location = response.headers.get('location');

        if (location === null || init?.redirect === 'manual') return response;

        if (init?.redirect === 'error') throw new TypeError('fetch failed');

        return fetchMock(location, init);
      });
    });

    const publish = () =>
      publishLandingPage({
        landingPageId: PAGE_ID,
        publishedById: 'member-caller',
      });

    it('follows one https redirect to presigned storage', async () => {
      routes[DRAFT_URL] = redirectTo(PRESIGNED_URL);
      routes[PRESIGNED_URL] = () => new Response('image-bytes', { status: 200 });

      const result = await publish();

      expect(result.status).toBe(200);
      expect(requested).toEqual([DRAFT_URL, PRESIGNED_URL]);
      expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
      expect(fetchMock.mock.calls[1][1]).toMatchObject({ redirect: 'error' });
      expect(uploadFileMock).toHaveBeenCalledTimes(1);
      expect(publishedSections()[0].photo?.fileId).toBe('copy-new');
    });

    it('still downloads a direct 200', async () => {
      routes[DRAFT_URL] = () => new Response('image-bytes', { status: 200 });

      const result = await publish();

      expect(result.status).toBe(200);
      expect(requested).toEqual([DRAFT_URL]);
    });

    it('refuses a redirect to http with 500 and no write', async () => {
      const httpTarget = 'http://storage.example.org/x.jpg';

      routes[DRAFT_URL] = redirectTo(httpTarget);
      routes[httpTarget] = () => new Response('image-bytes', { status: 200 });

      const result = await publish();

      expect(result.status).toBe(500);
      expect(requested).toEqual([DRAFT_URL]);
      expect(uploadFileMock).not.toHaveBeenCalled();
      expect(updates).toHaveLength(0);
    });

    it('refuses a relative redirect with 500 and no write', async () => {
      routes[DRAFT_URL] = redirectTo('/x.jpg');

      const result = await publish();

      expect(result.status).toBe(500);
      expect(requested).toEqual([DRAFT_URL]);
      expect(updates).toHaveLength(0);
    });

    it('refuses a second redirect with 500 and no write', async () => {
      const secondHop = 'https://elsewhere.example.org/x.jpg';

      routes[DRAFT_URL] = redirectTo(PRESIGNED_URL);
      routes[PRESIGNED_URL] = redirectTo(secondHop);
      routes[secondHop] = () => new Response('image-bytes', { status: 200 });

      const result = await publish();

      expect(result.status).toBe(500);
      expect(requested).toEqual([DRAFT_URL, PRESIGNED_URL]);
      expect(uploadFileMock).not.toHaveBeenCalled();
      expect(updates).toHaveLength(0);
    });

    it('refuses a non-2xx from presigned storage with 500', async () => {
      routes[DRAFT_URL] = redirectTo(PRESIGNED_URL);
      routes[PRESIGNED_URL] = () => new Response('', { status: 403 });

      const result = await publish();

      expect(result.status).toBe(500);
      expect(updates).toHaveLength(0);
    });
  });

  it('enforces the 30 MB cap while streaming when content-length is absent', async () => {
    sections = [heroWithPhoto('draft-1', DRAFT_URL)];
    const chunk = new Uint8Array(4 * 1024 * 1024);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += chunk.byteLength;
        controller.enqueue(chunk);

        if (sent > 40 * 1024 * 1024) controller.close();
      },
    });
    const response = new Response(stream, { status: 200 });

    expect(response.headers.get('content-length')).toBeNull();
    fetchMock.mockResolvedValue(response);

    const result = await publishLandingPage({
      landingPageId: PAGE_ID,
      publishedById: 'member-caller',
    });

    expect(result.status).toBe(500);
    expect(sent).toBeLessThanOrEqual(36 * 1024 * 1024);
    expect(uploadFileMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it('returns 500 and writes nothing when the download fails', async () => {
    sections = [heroWithPhoto('draft-1', DRAFT_URL)];
    fetchMock.mockResolvedValue(new Response('', { status: 404 }));

    const result = await publishLandingPage({
      landingPageId: PAGE_ID,
      publishedById: 'member-caller',
    });

    expect(result.status).toBe(500);
    expect(uploadFileMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it('refuses a draft photo url that is not https', async () => {
    sections = [heroWithPhoto('draft-1', 'http://crm.example.org/file/x')];

    const result = await publishLandingPage({
      landingPageId: PAGE_ID,
      publishedById: 'member-caller',
    });

    expect(result.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it('refuses a photo over 30 MB', async () => {
    sections = [heroWithPhoto('draft-1', DRAFT_URL)];
    fetchMock.mockResolvedValue(
      new Response('x', {
        status: 200,
        headers: { 'content-length': String(31 * 1024 * 1024) },
      }),
    );

    const result = await publishLandingPage({
      landingPageId: PAGE_ID,
      publishedById: 'member-caller',
    });

    expect(result.status).toBe(500);
    expect(uploadFileMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });
});
