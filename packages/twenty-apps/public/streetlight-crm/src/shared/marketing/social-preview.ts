import { buildPostLink } from 'src/shared/marketing/attribution';
import {
  PUBLISH_NETWORKS,
  resolveMediaMimeType,
  type SocialPostRecord,
} from 'src/shared/marketing/publish';

export type MediaKind = 'image' | 'video' | 'none';

export type PreviewNetwork = 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK' | 'YOUTUBE';

export type NetworkPreview = {
  network: PreviewNetwork;
  label: string;
  sends: boolean;
  link: string | null;
  text: string | null;
  characterCount: number;
  warnings: string[];
};

export type SocialPreview = {
  problems: string[];
  networks: NetworkPreview[];
};

export type SocialPreviewInput = {
  post: SocialPostRecord;
  landingPageSlug: string | null;
  baseUrl: string;
  mediaKind: MediaKind;
};

const CAPTION_LIMITS: Record<PreviewNetwork, number> = {
  FACEBOOK: 63206,
  INSTAGRAM: 2200,
  TIKTOK: 2200,
  YOUTUBE: 5000,
};

export const mediaKindFor = (extension: string | null): MediaKind => {
  if (extension === null) return 'none';

  return resolveMediaMimeType({ contentType: null, extension }).startsWith(
    'video/',
  )
    ? 'video'
    : 'image';
};

const findProblems = (input: SocialPreviewInput): string[] => [
  ...(input.landingPageSlug === null
    ? ['The post has no landing page, so it has no link.']
    : []),
  ...(input.post.slug ? [] : ['The post has no slug.']),
  ...(input.baseUrl.trim() === ''
    ? ['LANDING_PAGE_BASE_URL is empty, so the post has no link.']
    : []),
];

// Mirrors planPlatforms and buildPostizPayload, so the preview shows what Approve and Publish sends.
export const buildSocialPreview = (
  input: SocialPreviewInput,
): SocialPreview => {
  const problems = findProblems(input);
  const hasLink = problems.length === 0;

  return {
    problems,
    networks: PUBLISH_NETWORKS.map((entry) => {
      const network = entry.network as PreviewNetwork;
      const caption = (input.post[entry.captionField] ?? '').trim();

      if (caption === '') {
        return {
          network,
          label: entry.label,
          sends: false,
          link: null,
          text: null,
          characterCount: 0,
          warnings: [
            `The ${entry.label} caption is empty. ${entry.label} gets nothing.`,
          ],
        };
      }

      const link = hasLink
        ? buildPostLink({
            baseUrl: input.baseUrl,
            landingPageSlug: input.landingPageSlug ?? '',
            socialPostSlug: input.post.slug ?? '',
            network: entry.network,
          })
        : null;
      const text = link === null ? caption : `${caption}\n\n${link}`;
      const sends = input.mediaKind !== 'none' || !entry.requiresMedia;
      const limit = CAPTION_LIMITS[network];
      const warnings = [
        ...(sends
          ? []
          : [
              `${entry.label} needs a photo or video. ${entry.label} gets nothing.`,
            ]),
        ...(network === 'YOUTUBE' && input.mediaKind === 'image'
          ? [
              'YouTube needs a video. The post has a photo, so YouTube will reject it.',
            ]
          : []),
        ...(network === 'INSTAGRAM'
          ? ['People cannot tap links in an Instagram caption.']
          : []),
        ...(text.length > limit
          ? [
              `The caption and link have ${text.length} characters. ${entry.label} allows ${limit.toLocaleString('en-US')}.`,
            ]
          : []),
      ];

      return {
        network,
        label: entry.label,
        sends,
        link,
        text,
        characterCount: text.length,
        warnings,
      };
    }),
  };
};
