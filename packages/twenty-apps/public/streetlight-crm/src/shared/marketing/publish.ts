import { buildPostLink } from 'src/shared/marketing/attribution';
import type { Network } from 'src/shared/marketing/types';

export type SocialPostRecord = {
  id: string;
  name: string | null;
  slug: string | null;
  status: string;
  approvedById: string | null;
  approvedAt: string | null;
  scheduledAt: string | null;
  captionFacebook: string | null;
  captionInstagram: string | null;
  captionTiktok: string | null;
  captionYoutube: string | null;
};

export type PublishCheck = { ok: true } | { ok: false; reason: string };

export type PublishNetwork = {
  network: Network;
  platform: string;
  label: string;
  captionField: keyof Pick<
    SocialPostRecord,
    'captionFacebook' | 'captionInstagram' | 'captionTiktok' | 'captionYoutube'
  >;
  requiresMedia: boolean;
  postizIdentifiers: string[];
};

export const PUBLISH_NETWORKS: PublishNetwork[] = [
  {
    network: 'FACEBOOK',
    platform: 'facebook',
    label: 'Facebook',
    captionField: 'captionFacebook',
    requiresMedia: false,
    postizIdentifiers: ['facebook'],
  },
  {
    network: 'INSTAGRAM',
    platform: 'instagram',
    label: 'Instagram',
    captionField: 'captionInstagram',
    requiresMedia: true,
    postizIdentifiers: ['instagram', 'instagram-standalone'],
  },
  {
    network: 'TIKTOK',
    platform: 'tiktok',
    label: 'TikTok',
    captionField: 'captionTiktok',
    requiresMedia: true,
    postizIdentifiers: ['tiktok'],
  },
  {
    network: 'YOUTUBE',
    platform: 'youtube',
    label: 'YouTube',
    captionField: 'captionYoutube',
    requiresMedia: true,
    postizIdentifiers: ['youtube'],
  },
];

// FAILED and APPROVED can be approved again.
export const APPROVABLE_STATUSES = [
  'DRAFT',
  'AWAITING_APPROVAL',
  'APPROVED',
  'FAILED',
];

export const PUBLISH_SOCIAL_POST_ROUTE_PATH = '/social-posts/:id/publish';

export const buildPublishRoutePath = (postId: string): string =>
  `/social-posts/${encodeURIComponent(postId)}/publish`;

const YOUTUBE_TITLE_MAX_LENGTH = 100;

const VIDEO_MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

const IMAGE_MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

const isFilled = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.trim() !== '';

export const assertApprovedForPublish = (post: {
  status: string;
  approvedById: string | null;
  approvedAt: string | null;
}): PublishCheck => {
  if (post.status !== 'APPROVED') {
    return { ok: false, reason: `Status is ${post.status}, not APPROVED` };
  }

  if (!isFilled(post.approvedById)) {
    return { ok: false, reason: 'No approver is recorded' };
  }

  if (!isFilled(post.approvedAt)) {
    return { ok: false, reason: 'No approval time is recorded' };
  }

  return { ok: true };
};

export const captionedNetworks = (post: SocialPostRecord): PublishNetwork[] =>
  PUBLISH_NETWORKS.filter((entry) => isFilled(post[entry.captionField]));

export const planPlatforms = (
  post: SocialPostRecord,
  hasMedia: boolean,
): { networks: PublishNetwork[]; skippedPlatforms: string[] } => {
  const captioned = captionedNetworks(post);
  const networks = captioned.filter(
    (entry) => hasMedia || !entry.requiresMedia,
  );

  return {
    networks,
    skippedPlatforms: captioned
      .filter((entry) => !networks.includes(entry))
      .map((entry) => entry.platform),
  };
};

export const resolveMediaMimeType = (input: {
  contentType: string | null;
  extension: string | null;
}): string => {
  const contentType = (input.contentType ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();

  if (contentType !== '' && contentType !== 'application/octet-stream') {
    return contentType;
  }

  const extension = (input.extension ?? '').replace(/^\./, '').toLowerCase();

  return (
    VIDEO_MIME_TYPES_BY_EXTENSION[extension] ??
    IMAGE_MIME_TYPES_BY_EXTENSION[extension] ??
    'application/octet-stream'
  );
};

export type PostizChannel = {
  id: string;
  identifier: string;
  disabled: boolean;
};

export type PostizMedia = { id: string; path: string };

export type ChosenChannel = {
  network: PublishNetwork;
  id: string;
  identifier: string;
};

export type PostizPostEntry = {
  integration: { id: string };
  value: { content: string; image: PostizMedia[] }[];
  settings: Record<string, unknown>;
};

export type PostizPayload = {
  type: 'now' | 'schedule';
  date: string;
  shortLink: boolean;
  tags: string[];
  posts: PostizPostEntry[];
};

// A post to the wrong account is worse than a stop, so two channels of one type fail.
export const pickPostizChannels = (
  networks: PublishNetwork[],
  channels: PostizChannel[],
): { ok: true; channels: ChosenChannel[] } | { ok: false; reason: string } => {
  const chosen: ChosenChannel[] = [];

  for (const network of networks) {
    const matches = channels.filter(
      (channel) =>
        !channel.disabled &&
        network.postizIdentifiers.includes(channel.identifier),
    );

    if (matches.length === 0) {
      return {
        ok: false,
        reason: `No ${network.label} channel is connected in Postiz`,
      };
    }

    if (matches.length > 1) {
      return {
        ok: false,
        reason: `More than one ${network.label} channel is connected in Postiz. Disconnect the extra one.`,
      };
    }

    chosen.push({
      network,
      id: matches[0].id,
      identifier: matches[0].identifier,
    });
  }

  return { ok: true, channels: chosen };
};

const postizSettings = (
  channel: ChosenChannel,
  post: SocialPostRecord,
): Record<string, unknown> => {
  switch (channel.network.network) {
    case 'FACEBOOK':
      return { __type: 'facebook', post_type: 'post' };
    case 'INSTAGRAM':
      return { __type: channel.identifier, post_type: 'post' };
    case 'YOUTUBE':
      return {
        __type: 'youtube',
        title: (post.name ?? post.slug ?? '').slice(
          0,
          YOUTUBE_TITLE_MAX_LENGTH,
        ),
        type: 'public',
        selfDeclaredMadeForKids: 'no',
      };
    default:
      return {
        __type: 'tiktok',
        privacy_level: 'PUBLIC_TO_EVERYONE',
        duet: false,
        stitch: false,
        comment: true,
        autoAddMusic: 'no',
        brand_content_toggle: false,
        brand_organic_toggle: false,
        content_posting_method: 'DIRECT_POST',
      };
  }
};

export const buildPostizPayload = (input: {
  post: SocialPostRecord;
  baseUrl: string;
  landingPageSlug: string;
  channels: ChosenChannel[];
  media: PostizMedia[];
  now: Date;
}): PostizPayload => {
  const { post } = input;
  const scheduledAt = isFilled(post.scheduledAt) ? post.scheduledAt : null;

  return {
    type: scheduledAt === null ? 'now' : 'schedule',
    date: new Date(scheduledAt ?? input.now).toISOString(),
    shortLink: false,
    tags: [],
    posts: input.channels.map((channel) => {
      const link = buildPostLink({
        baseUrl: input.baseUrl,
        landingPageSlug: input.landingPageSlug,
        socialPostSlug: post.slug ?? '',
        network: channel.network.network,
      });

      return {
        integration: { id: channel.id },
        value: [
          {
            content: `${(post[channel.network.captionField] ?? '').trim()}\n\n${link}`,
            image: input.media,
          },
        ],
        settings: postizSettings(channel, post),
      };
    }),
  };
};
