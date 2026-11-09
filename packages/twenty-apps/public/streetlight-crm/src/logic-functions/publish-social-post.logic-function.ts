import { defineLogicFunction, HTTPMethod } from 'twenty-sdk/define';
import { Response, type RoutePayload } from 'twenty-sdk/logic-function';

import { PUBLISH_SOCIAL_POST_LOGIC_FUNCTION_ID } from 'src/constants/marketing-identifiers';
import {
  listPostizChannels,
  PostizError,
  sendPostizPost,
  uploadPostizMedia,
  type MediaSource,
} from 'src/logic-functions/postiz-client';
import { gql, metadataGql } from 'src/logic-functions/workspace-gql';
import {
  APPROVABLE_STATUSES,
  assertApprovedForPublish,
  buildPostizPayload,
  captionedNetworks,
  pickPostizChannels,
  planPlatforms,
  PUBLISH_SOCIAL_POST_ROUTE_PATH,
  type PostizMedia,
  type SocialPostRecord,
} from 'src/shared/marketing/publish';

type PublishBody =
  | { ok: true; published: boolean }
  | { ok: false; error: string };

export type PublishOutcome = { status: number; body: PublishBody };

export type PublishRequest = {
  postId: string;
  userWorkspaceId: string | null;
  approve: boolean;
};

type PublishOptions = { fetchImpl?: typeof fetch; now?: Date };

type LoadedPost = {
  post: SocialPostRecord;
  landingPageSlug: string | null;
  media: MediaSource[];
  sendingStartedAt: string | null;
};

type FileNode = { url?: unknown; label?: unknown; extension?: unknown };

const readEnv = (name: string): string => (process.env[name] ?? '').trim();

const outcome = (status: number, body: PublishBody): PublishOutcome => ({
  status,
  body,
});

const refuse = (status: number, error: string): PublishOutcome =>
  outcome(status, { ok: false, error });

const optionalString = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

// FILES URLs can be server-relative; the download needs an absolute address.
const absoluteUrl = (url: string): string =>
  url.startsWith('/')
    ? `${readEnv('TWENTY_API_URL').replace(/\/+$/, '')}${url}`
    : url;

const loadPost = async (postId: string): Promise<LoadedPost | null> => {
  const data = await gql(
    `query ($id: UUID!) {
      socialPosts(filter: { id: { eq: $id } }, first: 1) {
        edges {
          node {
            id name slug status approvedById approvedAt scheduledAt
            captionFacebook captionInstagram captionTiktok captionYoutube
            publishResult
            media { url label extension }
            landingPage { slug }
          }
        }
      }
    }`,
    { id: postId },
  );
  const node = data.socialPosts?.edges?.[0]?.node;

  if (!node) return null;

  const files: FileNode[] = Array.isArray(node.media) ? node.media : [];

  return {
    post: {
      id: node.id,
      name: node.name ?? null,
      slug: node.slug ?? null,
      status: node.status ?? '',
      approvedById: node.approvedById ?? null,
      approvedAt: node.approvedAt ?? null,
      scheduledAt: node.scheduledAt ?? null,
      captionFacebook: node.captionFacebook ?? null,
      captionInstagram: node.captionInstagram ?? null,
      captionTiktok: node.captionTiktok ?? null,
      captionYoutube: node.captionYoutube ?? null,
    },
    landingPageSlug: node.landingPage?.slug || null,
    sendingStartedAt: optionalString(node.publishResult?.sendingStartedAt),
    media: files.flatMap((file) => {
      const url = optionalString(file.url);

      return url === null
        ? []
        : [
            {
              url: absoluteUrl(url),
              label: optionalString(file.label),
              extension: optionalString(file.extension),
            },
          ];
    }),
  };
};

const updatePost = async (postId: string, data: Record<string, unknown>) => {
  await gql(
    `mutation ($id: UUID!, $data: SocialPostUpdateInput!) {
      updateSocialPost(id: $id, data: $data) { id }
    }`,
    { id: postId, data },
  );
};

const fail = async (
  postId: string,
  reason: string,
  extra: Record<string, unknown> = {},
): Promise<PublishOutcome> => {
  await updatePost(postId, {
    status: 'FAILED',
    publishResult: { error: reason, ...extra },
  });
  console.log(`social post ${postId} not published: ${reason}`);

  return refuse(409, reason);
};

// The member comes from the caller's own token, never from the request body (X1).
const findCallerWorkspaceMemberId = async (
  userWorkspaceId: string,
): Promise<string | null> => {
  const data = await metadataGql(
    `query { currentUser { currentUserWorkspace { id } workspaceMember { id } } }`,
  );
  const currentUser = data.currentUser;

  if (currentUser?.currentUserWorkspace?.id !== userWorkspaceId) return null;

  return optionalString(currentUser?.workspaceMember?.id);
};

const findMissingInput = (
  loaded: LoadedPost,
  baseUrl: string,
): string | null => {
  if (loaded.landingPageSlug === null) return 'Post has no landing page';

  if (!loaded.post.slug) return 'Post has no slug';

  if (baseUrl === '') return 'LANDING_PAGE_BASE_URL is empty';

  if (captionedNetworks(loaded.post).length === 0)
    return 'Post has no captions';

  return null;
};

const UNFINISHED_SEND =
  'An earlier send may have reached Postiz. Check Postiz, then approve the post again.';

const uploadAllMedia = async (
  apiKey: string,
  media: MediaSource[],
  fetchImpl: typeof fetch | undefined,
): Promise<PostizMedia[]> => {
  const uploaded: PostizMedia[] = [];

  for (const file of media) {
    uploaded.push(await uploadPostizMedia({ apiKey, media: file, fetchImpl }));
  }

  return uploaded;
};

const sendApprovedPost = async (
  loaded: LoadedPost,
  options: PublishOptions,
): Promise<PublishOutcome> => {
  const { post } = loaded;
  const apiKey = readEnv('POSTIZ_API_KEY');

  if (apiKey === '') {
    console.log(
      `social post ${post.id} approved; POSTIZ_API_KEY is empty, post it by hand`,
    );

    return outcome(200, { ok: true, published: false });
  }

  // Postiz has no idempotency key, so a send that stopped halfway is never repeated by itself.
  if (loaded.sendingStartedAt !== null) {
    return fail(post.id, UNFINISHED_SEND, {
      sendingStartedAt: loaded.sendingStartedAt,
    });
  }

  const baseUrl = readEnv('LANDING_PAGE_BASE_URL');
  const missingInput = findMissingInput(loaded, baseUrl);

  if (missingInput !== null) return fail(post.id, missingInput);

  const { networks, skippedPlatforms } = planPlatforms(
    post,
    loaded.media.length > 0,
  );
  const skipped = skippedPlatforms.length > 0 ? { skippedPlatforms } : {};

  if (networks.length === 0) {
    return fail(post.id, 'Every captioned network needs media', skipped);
  }

  let media: PostizMedia[];
  let picked: ReturnType<typeof pickPostizChannels>;

  try {
    picked = pickPostizChannels(
      networks,
      await listPostizChannels({ apiKey, fetchImpl: options.fetchImpl }),
    );
    if (!picked.ok) return fail(post.id, picked.reason);
    media = await uploadAllMedia(apiKey, loaded.media, options.fetchImpl);
  } catch (error) {
    return fail(
      post.id,
      error instanceof PostizError
        ? error.message
        : 'Postiz preparation failed',
    );
  }

  const now = options.now ?? new Date();
  const payload = buildPostizPayload({
    post,
    baseUrl,
    landingPageSlug: loaded.landingPageSlug ?? '',
    channels: picked.channels,
    media,
    now,
  });

  await updatePost(post.id, {
    publishResult: { sendingStartedAt: now.toISOString() },
  });

  let result;

  try {
    result = await sendPostizPost({
      apiKey,
      payload,
      fetchImpl: options.fetchImpl,
    });
  } catch {
    return fail(
      post.id,
      'Could not reach Postiz. Check Postiz before you approve the post again.',
    );
  }

  if (!result.ok) {
    await updatePost(post.id, {
      status: 'FAILED',
      publishResult: {
        error: `Postiz rejected the post (HTTP ${result.status})`,
        reply: result.reply,
      },
    });

    return outcome(502, { ok: false, error: 'Postiz rejected the post' });
  }

  await updatePost(post.id, {
    status: 'PUBLISHED',
    publishResult: { postiz: result.reply, ...skipped },
  });

  return outcome(200, { ok: true, published: true });
};

export const publishSocialPost = async (
  request: PublishRequest,
  options: PublishOptions = {},
): Promise<PublishOutcome> => {
  // API keys and agents reach auth routes without a user; only a signed-in person may publish (X1).
  if (request.userWorkspaceId === null) {
    return refuse(403, 'A signed-in person must publish');
  }

  if (request.postId === '') return refuse(400, 'Missing post id');

  let loaded = await loadPost(request.postId);

  if (loaded === null) return refuse(404, 'Post not found');

  if (loaded.post.status === 'PUBLISHED') {
    return outcome(200, { ok: true, published: true });
  }

  if (request.approve) {
    if (!APPROVABLE_STATUSES.includes(loaded.post.status)) {
      return refuse(409, `A ${loaded.post.status} post cannot be approved`);
    }

    const workspaceMemberId = await findCallerWorkspaceMemberId(
      request.userWorkspaceId,
    );

    if (workspaceMemberId === null) {
      return refuse(403, 'Your workspace member was not found');
    }

    // Approving again after a send that stopped halfway is the person's choice to send again.
    const isCompleteApproval =
      loaded.post.status === 'APPROVED' &&
      assertApprovedForPublish(loaded.post).ok &&
      loaded.sendingStartedAt === null;

    if (!isCompleteApproval) {
      await updatePost(loaded.post.id, {
        status: 'APPROVED',
        approvedById: workspaceMemberId,
        approvedAt: (options.now ?? new Date()).toISOString(),
        publishResult: null,
      });

      loaded = await loadPost(request.postId);

      if (loaded === null) return refuse(404, 'Post not found');
    }
  } else if (loaded.post.status !== 'APPROVED') {
    return refuse(409, `Status is ${loaded.post.status}, not APPROVED`);
  }

  const approval = assertApprovedForPublish(loaded.post);

  if (!approval.ok) return fail(loaded.post.id, approval.reason);

  return sendApprovedPost(loaded, options);
};

const handler = async (event: RoutePayload<{ approve?: unknown }>) => {
  const result = await publishSocialPost({
    postId: (event.pathParameters?.id ?? '').trim(),
    userWorkspaceId: event.userWorkspaceId ?? null,
    approve: event.body?.approve === true,
  });

  return new Response(result.body, {
    status: result.status,
    headers: { 'cache-control': 'no-store' },
  });
};

export default defineLogicFunction({
  universalIdentifier: PUBLISH_SOCIAL_POST_LOGIC_FUNCTION_ID,
  name: 'publish-social-post',
  description:
    'Records the signed-in person as approver and publishes the Social Post through Postiz. Called only by the Approve Social Post command.',
  timeoutSeconds: 120,
  handler,
  httpRouteTriggerSettings: {
    path: PUBLISH_SOCIAL_POST_ROUTE_PATH,
    httpMethod: HTTPMethod.POST,
    isAuthRequired: true,
  },
});
