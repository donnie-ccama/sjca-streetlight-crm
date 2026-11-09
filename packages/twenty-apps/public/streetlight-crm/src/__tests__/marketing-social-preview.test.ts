import { describe, expect, it } from 'vitest';

import type { SocialPostRecord } from 'src/shared/marketing/publish';
import {
  buildSocialPreview,
  mediaKindFor,
  type SocialPreviewInput,
} from 'src/shared/marketing/social-preview';

const basePost: SocialPostRecord = {
  id: 'post-1',
  name: 'Christmas 2026',
  slug: 'christmas-2026-give',
  status: 'DRAFT',
  approvedById: null,
  approvedAt: null,
  scheduledAt: null,
  captionFacebook: 'Facebook text',
  captionInstagram: 'Instagram text',
  captionTiktok: null,
  captionYoutube: '   ',
};

const build = (overrides: Partial<SocialPreviewInput> = {}) =>
  buildSocialPreview({
    post: basePost,
    landingPageSlug: 'christmas',
    baseUrl: 'https://give.example.org/',
    mediaKind: 'image',
    ...overrides,
  });

const network = (
  preview: ReturnType<typeof build>,
  name: 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK' | 'YOUTUBE',
) => {
  const found = preview.networks.find((entry) => entry.network === name);

  if (found === undefined) throw new Error(`missing ${name}`);

  return found;
};

describe('buildSocialPreview', () => {
  it('shows each caption with the link the app adds for that network', () => {
    const facebook = network(build(), 'FACEBOOK');

    expect(facebook.sends).toBe(true);
    expect(facebook.link).toBe(
      'https://give.example.org/christmas?utm_source=facebook&utm_medium=social&utm_campaign=christmas-2026-give',
    );
    expect(facebook.text).toBe(`Facebook text\n\n${facebook.link}`);
  });

  it('lists the four networks in a fixed order', () => {
    expect(build().networks.map((entry) => entry.network)).toEqual([
      'FACEBOOK',
      'INSTAGRAM',
      'TIKTOK',
      'YOUTUBE',
    ]);
  });

  it('skips a network with an empty caption', () => {
    const tiktok = network(build(), 'TIKTOK');
    const youtube = network(build(), 'YOUTUBE');

    expect(tiktok.sends).toBe(false);
    expect(tiktok.text).toBeNull();
    expect(tiktok.warnings).toEqual([
      'The TikTok caption is empty. TikTok gets nothing.',
    ]);
    expect(youtube.sends).toBe(false);
  });

  it('skips a network that needs media when the post has none', () => {
    const instagram = network(build({ mediaKind: 'none' }), 'INSTAGRAM');

    expect(instagram.sends).toBe(false);
    expect(instagram.warnings).toContain(
      'Instagram needs a photo or video. Instagram gets nothing.',
    );
    expect(network(build({ mediaKind: 'none' }), 'FACEBOOK').sends).toBe(true);
  });

  it('warns that YouTube needs a video when the post has a photo', () => {
    const youtube = network(
      build({ post: { ...basePost, captionYoutube: 'YouTube text' } }),
      'YOUTUBE',
    );

    expect(youtube.sends).toBe(true);
    expect(youtube.warnings).toEqual([
      'YouTube needs a video. The post has a photo, so YouTube will reject it.',
    ]);
  });

  it('warns that Instagram links cannot be tapped', () => {
    expect(network(build(), 'INSTAGRAM').warnings).toEqual([
      'People cannot tap links in an Instagram caption.',
    ]);
  });

  it('warns when the caption with its link is over the network limit', () => {
    const instagram = network(
      build({ post: { ...basePost, captionInstagram: 'x'.repeat(2200) } }),
      'INSTAGRAM',
    );

    expect(instagram.characterCount).toBe(instagram.text?.length);
    expect(instagram.warnings).toContain(
      `The caption and link have ${instagram.characterCount} characters. Instagram allows 2,200.`,
    );
  });

  it('reports post problems that stop every network', () => {
    const preview = build({ landingPageSlug: null, baseUrl: '' });

    expect(preview.problems).toEqual([
      'The post has no landing page, so it has no link.',
      'LANDING_PAGE_BASE_URL is empty, so the post has no link.',
    ]);
    expect(network(preview, 'FACEBOOK').link).toBeNull();
    expect(network(preview, 'FACEBOOK').text).toBe('Facebook text');
  });

  it('reports a post with no slug', () => {
    expect(build({ post: { ...basePost, slug: null } }).problems).toContain(
      'The post has no slug.',
    );
  });
});

describe('mediaKindFor', () => {
  it('reads the kind from the file extension', () => {
    expect(mediaKindFor(null)).toBe('none');
    expect(mediaKindFor('.jpg')).toBe('image');
    expect(mediaKindFor('MP4')).toBe('video');
    expect(mediaKindFor('pdf')).toBe('image');
  });
});
