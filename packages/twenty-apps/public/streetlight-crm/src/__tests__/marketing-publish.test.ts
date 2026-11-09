import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('src/logic-functions/workspace-gql', () => ({
  gql: vi.fn(),
  metadataGql: vi.fn(),
}));

import socialAgentRole from 'src/roles/social-agent.role';
import {
  LANDING_PAGE_FUND_FIELD_ID,
  LANDING_PAGE_FUNDRAISING_CAMPAIGN_FIELD_ID,
  LANDING_PAGE_GIVE_AMOUNTS_FIELD_ID,
  LANDING_PAGE_PUBLISHED_AT_FIELD_ID,
  LANDING_PAGE_PUBLISHED_BY_FIELD_ID,
  LANDING_PAGE_PUBLISHED_CONTENT_FIELD_ID,
  LANDING_PAGE_PUBLISHED_PHOTOS_FIELD_ID,
  LANDING_PAGE_SECTION_PRIMARY_BUTTON_ACTION_FIELD_ID,
  LANDING_PAGE_SECTION_PRIMARY_BUTTON_URL_FIELD_ID,
  LANDING_PAGE_SECTION_SECONDARY_BUTTON_ACTION_FIELD_ID,
  LANDING_PAGE_SECTION_SECONDARY_BUTTON_URL_FIELD_ID,
  LANDING_PAGE_OBJECT_ID,
  LANDING_PAGE_STATUS_FIELD_ID,
  SOCIAL_POST_APPROVED_AT_FIELD_ID,
  SOCIAL_POST_APPROVED_BY_FIELD_ID,
  SOCIAL_POST_PUBLISH_RESULT_FIELD_ID,
  SOCIAL_POST_STATUS_FIELD_ID,
} from 'src/constants/marketing-identifiers';
import publishSocialPostFunction, {
  publishSocialPost,
} from 'src/logic-functions/publish-social-post.logic-function';
import { gql, metadataGql } from 'src/logic-functions/workspace-gql';
import {
  assertApprovedForPublish,
  buildPostizPayload,
  pickPostizChannels,
  planPlatforms,
  PUBLISH_NETWORKS,
  resolveMediaMimeType,
  type PostizChannel,
  type SocialPostRecord,
} from 'src/shared/marketing/publish';

const POST_ID = '7b1c2f5e-2a5d-4a3b-9b1e-0c6d1f2a3b4c';
const API_KEY = 'example-postiz-key-123';

const CHANNELS: PostizChannel[] = [
  { id: 'ch-fb', identifier: 'facebook', disabled: false },
  { id: 'ch-ig', identifier: 'instagram-standalone', disabled: false },
  { id: 'ch-tt', identifier: 'tiktok', disabled: false },
  { id: 'ch-yt', identifier: 'youtube', disabled: false },
];

const basePost: SocialPostRecord = {
  id: POST_ID,
  name: 'Spring appeal',
  slug: 'spring-appeal',
  status: 'APPROVED',
  approvedById: 'member-1',
  approvedAt: '2026-11-05T10:00:00.000Z',
  scheduledAt: null,
  captionFacebook: null,
  captionInstagram: null,
  captionTiktok: null,
  captionYoutube: null,
};

describe('assertApprovedForPublish', () => {
  it('accepts APPROVED with approver and time', () => {
    expect(assertApprovedForPublish(basePost)).toEqual({ ok: true });
  });

  it('rejects APPROVED without approvedById', () => {
    const result = assertApprovedForPublish({
      ...basePost,
      approvedById: null,
    });

    expect(result.ok).toBe(false);
  });

  it('rejects APPROVED without approvedAt', () => {
    const result = assertApprovedForPublish({ ...basePost, approvedAt: '' });

    expect(result.ok).toBe(false);
  });

  it('rejects AWAITING_APPROVAL even with both values set', () => {
    const result = assertApprovedForPublish({
      ...basePost,
      status: 'AWAITING_APPROVAL',
    });

    expect(result.ok).toBe(false);
  });
});

describe('pickPostizChannels', () => {
  const instagram = PUBLISH_NETWORKS.filter(
    (entry) => entry.network === 'INSTAGRAM',
  );
  const facebook = PUBLISH_NETWORKS.filter(
    (entry) => entry.network === 'FACEBOOK',
  );

  it('picks the one channel of each network, standalone Instagram included', () => {
    const result = pickPostizChannels(instagram, CHANNELS);

    expect(result).toEqual({
      ok: true,
      channels: [
        {
          network: instagram[0],
          id: 'ch-ig',
          identifier: 'instagram-standalone',
        },
      ],
    });
  });

  it('ignores disabled channels', () => {
    const result = pickPostizChannels(facebook, [
      { id: 'ch-old', identifier: 'facebook', disabled: true },
      ...CHANNELS,
    ]);

    expect(result.ok && result.channels[0].id).toBe('ch-fb');
  });

  it('fails when a network has no channel', () => {
    expect(pickPostizChannels(instagram, [CHANNELS[0]])).toEqual({
      ok: false,
      reason: 'No Instagram channel is connected in Postiz',
    });
  });

  it('fails when a network has two channels', () => {
    expect(
      pickPostizChannels(facebook, [
        ...CHANNELS,
        { id: 'ch-fb-2', identifier: 'facebook', disabled: false },
      ]),
    ).toEqual({
      ok: false,
      reason:
        'More than one Facebook channel is connected in Postiz. Disconnect the extra one.',
    });
  });
});

describe('buildPostizPayload', () => {
  const MEDIA = [{ id: 'media-1', path: 'https://uploads.postiz.com/a.jpg' }];
  const NOW = new Date('2026-11-07T12:00:00.000Z');
  const build = (
    post: Partial<SocialPostRecord>,
    media: { id: string; path: string }[] = [],
  ) => {
    const full = { ...basePost, ...post };
    const { networks } = planPlatforms(full, media.length > 0);
    const picked = pickPostizChannels(networks, CHANNELS);

    if (!picked.ok) throw new Error(picked.reason);

    return buildPostizPayload({
      post: full,
      baseUrl: 'https://give.example.org/',
      landingPageSlug: 'easter',
      channels: picked.channels,
      media,
      now: NOW,
    });
  };
  const byChannel = (payload: ReturnType<typeof build>, id: string) =>
    payload.posts.find((entry) => entry.integration.id === id);

  it('sends one entry for each captioned network to its channel', () => {
    const payload = build(
      { captionFacebook: 'Facebook text', captionInstagram: 'Instagram text' },
      MEDIA,
    );

    expect(payload.posts.map((entry) => entry.integration.id)).toEqual([
      'ch-fb',
      'ch-ig',
    ]);
  });

  it('ends each caption with its own network link', () => {
    const payload = build(
      { captionFacebook: 'Facebook text', captionInstagram: 'Instagram text' },
      MEDIA,
    );
    const facebookText = byChannel(payload, 'ch-fb')?.value[0].content;
    const instagramText = byChannel(payload, 'ch-ig')?.value[0].content;

    expect(facebookText).toMatch(
      /^Facebook text\n\nhttps:\/\/give\.example\.org\/easter\?utm_source=facebook&/,
    );
    expect(instagramText).toContain('utm_source=instagram');
    expect(instagramText).toContain('utm_campaign=spring-appeal');
  });

  it('sets the settings for each network', () => {
    const payload = build(
      {
        captionFacebook: 'F',
        captionInstagram: 'I',
        captionTiktok: 'T',
        captionYoutube: 'Y',
      },
      MEDIA,
    );

    expect(byChannel(payload, 'ch-fb')?.settings).toEqual({
      __type: 'facebook',
      post_type: 'post',
    });
    expect(byChannel(payload, 'ch-ig')?.settings).toEqual({
      __type: 'instagram-standalone',
      post_type: 'post',
    });
    expect(byChannel(payload, 'ch-yt')?.settings).toEqual({
      __type: 'youtube',
      title: 'Spring appeal',
      type: 'public',
      selfDeclaredMadeForKids: 'no',
    });
    expect(byChannel(payload, 'ch-tt')?.settings).toMatchObject({
      __type: 'tiktok',
      privacy_level: 'PUBLIC_TO_EVERYONE',
      content_posting_method: 'DIRECT_POST',
      comment: true,
      duet: false,
      stitch: false,
    });
  });

  it('cuts the YouTube title at 100 characters', () => {
    const payload = build(
      { name: 'x'.repeat(150), captionYoutube: 'Y' },
      MEDIA,
    );

    expect(byChannel(payload, 'ch-yt')?.settings.title).toBe('x'.repeat(100));
  });

  it('attaches the media to every entry, or none without media', () => {
    expect(
      build({ captionInstagram: 'I' }, MEDIA).posts[0].value[0].image,
    ).toEqual(MEDIA);
    expect(build({ captionFacebook: 'F' }).posts[0].value[0].image).toEqual([]);
  });

  it('posts now without a schedule and on the date with one', () => {
    expect(build({ captionFacebook: 'F' })).toMatchObject({
      type: 'now',
      date: '2026-11-07T12:00:00.000Z',
      shortLink: false,
      tags: [],
    });
    expect(
      build({ captionFacebook: 'F', scheduledAt: '2026-12-01T15:30:00.000Z' }),
    ).toMatchObject({ type: 'schedule', date: '2026-12-01T15:30:00.000Z' });
  });
});

describe('resolveMediaMimeType', () => {
  it('prefers the content type and falls back to the extension', () => {
    expect(
      resolveMediaMimeType({
        contentType: 'video/mp4; charset=binary',
        extension: null,
      }),
    ).toBe('video/mp4');
    expect(
      resolveMediaMimeType({
        contentType: 'application/octet-stream',
        extension: '.MOV',
      }),
    ).toBe('video/quicktime');
    expect(resolveMediaMimeType({ contentType: null, extension: 'jpg' })).toBe(
      'image/jpeg',
    );
  });
});

describe('social agent role', () => {
  it('can be assigned to API keys and cannot write the approval fields', () => {
    const config = socialAgentRole.config;
    const blocked = (config.fieldPermissions ?? [])
      .filter((permission) => permission.canUpdateFieldValue === false)
      .map((permission) => permission.fieldUniversalIdentifier)
      .sort();

    expect(socialAgentRole.success).toBe(true);
    expect(config.canBeAssignedToApiKeys).toBe(true);
    expect(config.canDestroyAllObjectRecords).toBe(false);
    expect(blocked).toEqual(
      [
        SOCIAL_POST_STATUS_FIELD_ID,
        SOCIAL_POST_APPROVED_BY_FIELD_ID,
        SOCIAL_POST_APPROVED_AT_FIELD_ID,
        SOCIAL_POST_PUBLISH_RESULT_FIELD_ID,
        LANDING_PAGE_STATUS_FIELD_ID,
        LANDING_PAGE_GIVE_AMOUNTS_FIELD_ID,
        LANDING_PAGE_FUND_FIELD_ID,
        LANDING_PAGE_FUNDRAISING_CAMPAIGN_FIELD_ID,
        LANDING_PAGE_PUBLISHED_CONTENT_FIELD_ID,
        LANDING_PAGE_PUBLISHED_PHOTOS_FIELD_ID,
        LANDING_PAGE_PUBLISHED_AT_FIELD_ID,
        LANDING_PAGE_PUBLISHED_BY_FIELD_ID,
        LANDING_PAGE_SECTION_PRIMARY_BUTTON_ACTION_FIELD_ID,
        LANDING_PAGE_SECTION_PRIMARY_BUTTON_URL_FIELD_ID,
        LANDING_PAGE_SECTION_SECONDARY_BUTTON_ACTION_FIELD_ID,
        LANDING_PAGE_SECTION_SECONDARY_BUTTON_URL_FIELD_ID,
      ].sort(),
    );
  });

  it('cannot set a Landing Page LIVE or change its give link', () => {
    const landingPageBlocks = (socialAgentRole.config.fieldPermissions ?? [])
      .filter(
        (permission) =>
          permission.objectUniversalIdentifier === LANDING_PAGE_OBJECT_ID &&
          permission.canUpdateFieldValue === false,
      )
      .map((permission) => permission.fieldUniversalIdentifier)
      .sort();

    expect(landingPageBlocks).toEqual(
      expect.arrayContaining([
        LANDING_PAGE_STATUS_FIELD_ID,
        LANDING_PAGE_GIVE_AMOUNTS_FIELD_ID,
      ]),
    );
  });
});

describe('publishSocialPost', () => {
  const gqlMock = vi.mocked(gql);
  const metadataGqlMock = vi.mocked(metadataGql);
  const fetchMock = vi.fn();
  const updates: Record<string, unknown>[] = [];
  const FILE_URL = 'https://files.example.org/m.jpg?token=signed';
  const UPLOADED = { id: 'media-1', path: 'https://uploads.postiz.com/m.jpg' };
  const CHANNELS_URL = 'https://api.postiz.com/public/v1/integrations';
  const UPLOAD_URL = 'https://api.postiz.com/public/v1/upload';
  const POST_URL = 'https://api.postiz.com/public/v1/posts';
  const POSTIZ_REPLY = [{ postId: 'pz-1', integration: 'ch-ig' }];
  let stored: Record<string, unknown> | null;
  let postReply: () => Promise<globalThis.Response>;
  let channelsReply: () => Promise<globalThis.Response>;
  let fileStatus: number;
  let uploadStatus: number;

  const postNode = (overrides: Record<string, unknown> = {}) => ({
    ...basePost,
    captionInstagram: 'Pray with us',
    publishResult: null,
    media: [{ url: FILE_URL, label: 'm.jpg', extension: 'jpg' }],
    landingPage: { slug: 'easter' },
    ...overrides,
  });

  const callsTo = (url: string) =>
    fetchMock.mock.calls.filter(([calledUrl]) => calledUrl === url);

  const sentPayload = () => JSON.parse(callsTo(POST_URL)[0][1].body);

  const lastUpdate = () => updates[updates.length - 1];

  const run = (
    request: Partial<{ userWorkspaceId: string | null; approve: boolean }> = {},
    now?: Date,
  ) =>
    publishSocialPost(
      {
        postId: POST_ID,
        userWorkspaceId: 'user-workspace-1',
        approve: false,
        ...request,
      },
      { now },
    );

  beforeEach(() => {
    gqlMock.mockReset();
    metadataGqlMock.mockReset();
    fetchMock.mockReset();
    updates.length = 0;
    stored = postNode();
    fileStatus = 200;
    uploadStatus = 200;
    channelsReply = async () =>
      new Response(JSON.stringify(CHANNELS), { status: 200 });
    postReply = async () =>
      new Response(JSON.stringify(POSTIZ_REPLY), { status: 200 });
    process.env.POSTIZ_API_KEY = API_KEY;
    process.env.LANDING_PAGE_BASE_URL = 'https://give.example.org';
    vi.stubGlobal('fetch', fetchMock);

    gqlMock.mockImplementation(async (query, variables) => {
      if (query.includes('updateSocialPost')) {
        const data = (variables as { data: Record<string, unknown> }).data;

        updates.push(data);
        stored = stored === null ? null : { ...stored, ...data };

        return { updateSocialPost: { id: POST_ID } };
      }

      return {
        socialPosts: { edges: stored === null ? [] : [{ node: stored }] },
      };
    });
    metadataGqlMock.mockResolvedValue({
      currentUser: {
        currentUserWorkspace: { id: 'user-workspace-1' },
        workspaceMember: { id: 'member-caller' },
      },
    });
    fetchMock.mockImplementation(async (url: string) => {
      if (url === FILE_URL) {
        return new Response('file-bytes', {
          status: fileStatus,
          headers: { 'content-type': 'image/jpeg' },
        });
      }

      if (url === CHANNELS_URL) return channelsReply();

      if (url === UPLOAD_URL) {
        return new Response(JSON.stringify(UPLOADED), { status: uploadStatus });
      }

      if (url === POST_URL) return postReply();

      throw new Error(`unexpected fetch ${url}`);
    });
  });

  afterEach(() => {
    delete process.env.POSTIZ_API_KEY;
    delete process.env.LANDING_PAGE_BASE_URL;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('refuses a caller without a signed-in person and changes nothing', async () => {
    const result = await run({ userWorkspaceId: null, approve: true });

    expect(result.status).toBe(403);
    expect(gqlMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('records the caller as approver whatever the request body says', async () => {
    stored = postNode({
      status: 'DRAFT',
      approvedById: null,
      approvedAt: null,
    });

    const response = await publishSocialPostFunction.config.handler(
      {
        pathParameters: { id: POST_ID },
        userWorkspaceId: 'user-workspace-1',
        body: {
          approve: true,
          approvedById: 'forged-member',
          approvedAt: '2020-01-01T00:00:00.000Z',
          status: 'PUBLISHED',
        },
      } as never,
      {} as never,
    );

    expect((response as { status?: number }).status).toBe(200);
    expect(updates[0]).toMatchObject({
      status: 'APPROVED',
      approvedById: 'member-caller',
      publishResult: null,
    });
    expect(updates[0].approvedAt).not.toBe('2020-01-01T00:00:00.000Z');
    expect(lastUpdate().status).toBe('PUBLISHED');
  });

  it('refuses approval when the token user differs from the route user', async () => {
    stored = postNode({ status: 'DRAFT' });
    metadataGqlMock.mockResolvedValue({
      currentUser: {
        currentUserWorkspace: { id: 'someone-else' },
        workspaceMember: { id: 'member-other' },
      },
    });

    const result = await run({ approve: true });

    expect(result.status).toBe(403);
    expect(updates).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the approval when an APPROVED post is approved again', async () => {
    stored = postNode({ status: 'APPROVED' });

    const result = await run(
      { approve: true },
      new Date('2026-11-07T12:00:00.000Z'),
    );

    expect(result.status).toBe(200);
    expect(updates.some((update) => 'approvedAt' in update)).toBe(false);
    expect(updates.some((update) => 'approvedById' in update)).toBe(false);
    expect(stored).toMatchObject({
      approvedById: 'member-1',
      status: 'PUBLISHED',
    });
  });

  it('records a sending mark before it calls Postiz', async () => {
    let storedWhenSent: unknown;

    postReply = async () => {
      storedWhenSent = stored?.publishResult;

      return new Response(JSON.stringify(POSTIZ_REPLY), { status: 200 });
    };

    await run({}, new Date('2026-11-07T12:00:00.000Z'));

    expect(storedWhenSent).toEqual({
      sendingStartedAt: '2026-11-07T12:00:00.000Z',
    });
  });

  it('does not send again when an earlier send did not finish', async () => {
    stored = postNode({
      publishResult: { sendingStartedAt: '2026-11-07T11:00:00.000Z' },
    });

    const result = await run();

    expect(result.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates).toEqual([
      {
        status: 'FAILED',
        publishResult: {
          error:
            'An earlier send may have reached Postiz. Check Postiz, then approve the post again.',
          sendingStartedAt: '2026-11-07T11:00:00.000Z',
        },
      },
    ]);
  });

  it('sends after a new approval of a post with an unfinished send', async () => {
    stored = postNode({
      publishResult: { sendingStartedAt: '2026-11-07T11:00:00.000Z' },
    });

    const result = await run(
      { approve: true },
      new Date('2026-11-07T12:00:00.000Z'),
    );

    expect(result.body).toEqual({ ok: true, published: true });
    expect(updates[0]).toMatchObject({
      status: 'APPROVED',
      approvedById: 'member-caller',
      approvedAt: '2026-11-07T12:00:00.000Z',
      publishResult: null,
    });
    expect(callsTo(POST_URL)).toHaveLength(1);
  });

  it('answers 409 and writes nothing for a non-APPROVED post without approve', async () => {
    stored = postNode({ status: 'DRAFT' });

    const result = await run();

    expect(result.status).toBe(409);
    expect(updates).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('marks an APPROVED post without an approver FAILED and sends nothing', async () => {
    stored = postNode({ approvedById: null });

    const result = await run();

    expect(result.body.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates).toEqual([
      { status: 'FAILED', publishResult: { error: expect.any(String) } },
    ]);
  });

  it('does not resend a post that is already PUBLISHED, even with approve', async () => {
    stored = postNode({ status: 'PUBLISHED' });

    const result = await run({ approve: true });

    expect(result.body).toEqual({ ok: true, published: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it('leaves the post APPROVED when the Postiz key is empty', async () => {
    process.env.POSTIZ_API_KEY = '  ';

    const result = await run();

    expect(result.body).toEqual({ ok: true, published: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it('returns 404 for an unknown post', async () => {
    stored = null;

    const result = await run();

    expect(result.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uploads media to Postiz and posts it to the chosen channel', async () => {
    const result = await run();

    expect(result.body).toEqual({ ok: true, published: true });
    expect(callsTo(CHANNELS_URL)[0][1].headers.Authorization).toBe(API_KEY);
    expect(callsTo(FILE_URL)).toHaveLength(1);

    const [, uploadInit] = callsTo(UPLOAD_URL)[0];
    const file = (uploadInit.body as FormData).get('file') as File;

    expect(uploadInit.method).toBe('POST');
    expect(uploadInit.headers.Authorization).toBe(API_KEY);
    expect(file.type).toBe('image/jpeg');
    expect(file.name).toBe('m.jpg');
    expect(await file.text()).toBe('file-bytes');

    const sent = sentPayload();

    expect(callsTo(POST_URL)[0][1].headers.Authorization).toBe(API_KEY);
    expect(sent.posts).toHaveLength(1);
    expect(sent.posts[0].integration).toEqual({ id: 'ch-ig' });
    expect(sent.posts[0].value[0].image).toEqual([UPLOADED]);
    expect(lastUpdate()).toEqual({
      status: 'PUBLISHED',
      publishResult: { postiz: POSTIZ_REPLY },
    });
  });

  it('marks FAILED and posts nothing when the media upload fails', async () => {
    uploadStatus = 500;

    const result = await run();

    expect(result.body.ok).toBe(false);
    expect(callsTo(POST_URL)).toHaveLength(0);
    expect(lastUpdate()).toEqual({
      status: 'FAILED',
      publishResult: { error: 'Postiz media upload failed (HTTP 500)' },
    });
  });

  it('marks FAILED when the media file cannot be downloaded', async () => {
    fileStatus = 403;

    const result = await run();

    expect(result.body.ok).toBe(false);
    expect(callsTo(POST_URL)).toHaveLength(0);
    expect(lastUpdate().status).toBe('FAILED');
  });

  it('skips media-only networks without media and records them', async () => {
    stored = postNode({ media: [], captionFacebook: 'Facebook text' });

    await run();

    expect(callsTo(UPLOAD_URL)).toHaveLength(0);
    expect(
      sentPayload().posts.map(
        (entry: { integration: { id: string } }) => entry.integration.id,
      ),
    ).toEqual(['ch-fb']);
    expect(lastUpdate()).toEqual({
      status: 'PUBLISHED',
      publishResult: { postiz: POSTIZ_REPLY, skippedPlatforms: ['instagram'] },
    });
  });

  it('marks FAILED when no captioned network can post without media', async () => {
    stored = postNode({ media: [] });

    const result = await run();

    expect(result.body.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates).toEqual([
      {
        status: 'FAILED',
        publishResult: {
          error: 'Every captioned network needs media',
          skippedPlatforms: ['instagram'],
        },
      },
    ]);
  });

  it('marks FAILED and uploads nothing when a network has no Postiz channel', async () => {
    channelsReply = async () =>
      new Response(JSON.stringify([CHANNELS[0]]), { status: 200 });

    const result = await run();

    expect(result.body.ok).toBe(false);
    expect(callsTo(UPLOAD_URL)).toHaveLength(0);
    expect(callsTo(POST_URL)).toHaveLength(0);
    expect(updates).toEqual([
      {
        status: 'FAILED',
        publishResult: { error: 'No Instagram channel is connected in Postiz' },
      },
    ]);
  });

  it('marks FAILED when Postiz does not return the channels', async () => {
    channelsReply = async () => new Response('{}', { status: 401 });

    const result = await run();

    expect(result.body.ok).toBe(false);
    expect(callsTo(POST_URL)).toHaveLength(0);
    expect(updates).toEqual([
      {
        status: 'FAILED',
        publishResult: {
          error: 'Postiz did not return the channels (HTTP 401)',
        },
      },
    ]);
  });

  it('marks FAILED with the reply when Postiz rejects the post', async () => {
    const reply = { message: 'bad media' };

    postReply = async () =>
      new Response(JSON.stringify(reply), { status: 400 });

    const result = await run();

    expect(result.status).toBe(502);
    expect(lastUpdate()).toEqual({
      status: 'FAILED',
      publishResult: { error: 'Postiz rejected the post (HTTP 400)', reply },
    });
  });

  it('marks FAILED with a short reason on a network error and never logs the key', async () => {
    postReply = async () => {
      throw new Error(`socket closed ${API_KEY}`);
    };
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await run();

    expect(result.body.ok).toBe(false);
    expect(lastUpdate()).toEqual({
      status: 'FAILED',
      publishResult: {
        error:
          'Could not reach Postiz. Check Postiz before you approve the post again.',
      },
    });
    expect(JSON.stringify(result)).not.toContain(API_KEY);

    const logged = [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map(String)
      .join(' ');

    expect(logged).not.toContain(API_KEY);
  });

  it('marks FAILED when the post has no landing page', async () => {
    stored = postNode({ landingPage: null });

    const result = await run();

    expect(result.body.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates[0].status).toBe('FAILED');
  });
});
