import { describe, expect, it } from 'vitest';

import {
  buildDraftPreview,
  buildPublishedPreview,
  BUSY_BEFORE_PUBLISH_MESSAGE,
  giveWarning,
  isEditingLocked,
  saveBlock,
  shouldAutosave,
  shouldShowTypePicker,
  toAbsoluteUrl,
  toDraftRecords,
} from 'src/front-components/landing-page-builder/preview-content';
import {
  builderReducer,
  createBuilderState,
  listSectionProblems,
  type BuilderSection,
} from 'src/front-components/landing-page-builder/use-builder-state';
import {
  buildPublishedContent,
  draftDiffersFromPublished,
  type LandingPageSectionRecord,
  type PublishedPhoto,
} from 'src/shared/marketing/sections';
import { parseAttribution } from 'src/shared/marketing/attribution';
import { renderSectionPage } from 'src/shared/marketing/landing-page-sections-html';

const makeRecord = (
  overrides: Partial<LandingPageSectionRecord> = {},
): LandingPageSectionRecord => ({
  id: 'section-1',
  sectionType: 'HERO',
  position: 0,
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

const draftSections = (): BuilderSection[] =>
  createBuilderState([
    makeRecord({
      id: 'hero',
      position: 0,
      heading: 'Feed a child',
      photo: [
        {
          fileId: 'draft-file',
          label: 'A child',
          url: 'https://files.example.org/a.jpg',
        },
      ],
      primaryButtonLabel: 'Give',
      primaryButtonAction: 'GIVE',
    }),
    makeRecord({
      id: 'hidden',
      sectionType: 'STORY',
      position: 1,
      isVisible: false,
      heading: 'Hidden',
    }),
    makeRecord({
      id: 'story',
      sectionType: 'STORY',
      position: 2,
      heading: 'Story',
      photo: [{ fileId: 'no-url-file', label: '', url: undefined }],
    }),
  ]).sections;

const LIVE_PAGE = {
  title: 'Live title',
  shareDescription: 'Live share',
  shareImageUrl: '/file/share-live?token=x',
};

describe('buildDraftPreview', () => {
  it('uses the live title, share text, and share image', () => {
    expect(
      buildDraftPreview(draftSections(), 'https://crm.example.org', LIVE_PAGE)
        .page,
    ).toEqual({
      title: 'Live title',
      shareDescription: 'Live share',
      shareImageUrl: 'https://crm.example.org/file/share-live?token=x',
    });
  });

  it('shows the visible draft sections in order', () => {
    const preview = buildDraftPreview(draftSections(), '', LIVE_PAGE);

    expect(preview.sections.map((section) => section.id)).toEqual([
      'hero',
      'story',
    ]);
    expect(preview.sections[0].heading).toBe('Feed a child');
  });

  it('keys photo urls by the draft file id and skips photos without a url', () => {
    const preview = buildDraftPreview(draftSections(), '', LIVE_PAGE);

    expect(preview.sections[0].photo).toEqual({
      fileId: 'draft-file',
      sourceFileId: 'draft-file',
      altText: 'A child',
    });
    expect(preview.photoUrls).toEqual({
      'draft-file': 'https://files.example.org/a.jpg',
    });
  });

  it('follows the unsaved order and edits in state', () => {
    const loaded = { ...createBuilderState([]), sections: draftSections() };
    const state = builderReducer(
      builderReducer(loaded, { type: 'move', id: 'story', toIndex: 0 }),
      { type: 'edit', id: 'hero', patch: { heading: 'Changed' } },
    );
    const preview = buildDraftPreview(state.sections, '', LIVE_PAGE);

    expect(preview.sections.map((section) => section.id)).toEqual([
      'story',
      'hero',
    ]);
    expect(preview.sections[1].heading).toBe('Changed');
  });
});

const DRAFT_PAGE = { title: '', shareDescription: '', shareImageFileId: null };

describe('toDraftRecords', () => {
  it('matches published content built from the same records', () => {
    const records = [
      makeRecord({
        id: 'hero',
        position: 0,
        heading: 'Feed',
        photo: [{ fileId: 'draft-file', label: 'Alt' }],
        primaryButtonLabel: 'Give',
        primaryButtonAction: 'GIVE',
      }),
      makeRecord({
        id: 'join',
        sectionType: 'JOIN',
        position: 1,
        primaryButtonLabel: 'Join us',
      }),
    ];
    const photos = new Map<string, PublishedPhoto | null>([
      ['hero', { fileId: 'copy', sourceFileId: 'draft-file', altText: 'Alt' }],
    ]);
    const published = buildPublishedContent(
      [{ ...records[0] }, { ...records[1], primaryButtonAction: 'JOIN' }],
      photos,
    );
    const draft = toDraftRecords(createBuilderState(records).sections);

    expect(draftDiffersFromPublished(draft, published, DRAFT_PAGE)).toBe(false);
    expect(
      draftDiffersFromPublished(
        toDraftRecords(
          builderReducer(createBuilderState(records), {
            type: 'edit',
            id: 'hero',
            patch: { heading: 'New' },
          }).sections,
        ),
        published,
        DRAFT_PAGE,
      ),
    ).toBe(true);
  });
});

describe('buildPublishedPreview', () => {
  it('reads published content and keys photo urls by the copy file id', () => {
    const preview = buildPublishedPreview(
      {
        version: 1,
        sections: [
          {
            id: 'hero',
            sectionType: 'HERO',
            heading: 'Live',
            photo: { fileId: 'copy', sourceFileId: 'draft-file', altText: '' },
          },
        ],
      },
      [{ fileId: 'copy', url: 'https://files.example.org/copy.jpg' }],
      '',
      LIVE_PAGE,
    );

    expect(preview.sections.map((section) => section.heading)).toEqual([
      'Live',
    ]);
    expect(preview.photoUrls).toEqual({
      copy: 'https://files.example.org/copy.jpg',
    });
  });

  it('uses the published title, share text, and share image copy', () => {
    const preview = buildPublishedPreview(
      {
        version: 1,
        page: {
          title: 'Published title',
          shareDescription: 'Published share',
          shareImage: {
            fileId: 'share-copy',
            sourceFileId: 'share-1',
            altText: '',
          },
        },
        sections: [],
      },
      [
        {
          fileId: 'share-copy',
          url: 'https://files.example.org/share-copy.jpg',
        },
      ],
      '',
      LIVE_PAGE,
    );

    expect(preview.page).toEqual({
      title: 'Published title',
      shareDescription: 'Published share',
      shareImageUrl: 'https://files.example.org/share-copy.jpg',
    });
  });

  it('falls back to the live page fields when nothing valid is published', () => {
    expect(buildPublishedPreview(null, [], '', LIVE_PAGE).page).toEqual({
      ...LIVE_PAGE,
      shareImageUrl: null,
    });
  });

  it('shows no sections for missing or broken content', () => {
    expect(buildPublishedPreview(null, [], '', LIVE_PAGE).sections).toEqual([]);
    expect(
      buildPublishedPreview({ version: 2 }, [], '', LIVE_PAGE).sections,
    ).toEqual([]);
  });
});

describe('shouldAutosave', () => {
  const ready = {
    isDirty: true,
    isSaving: false,
    isUploading: false,
    isPublishing: false,
    problemCount: 0,
    failedAtThisEdit: false,
  };

  it('saves when edits are waiting and nothing blocks it', () => {
    expect(shouldAutosave(ready)).toBe(true);
  });

  it.each([
    ['nothing changed', { isDirty: false }],
    ['a save is running', { isSaving: true }],
    ['a photo is uploading', { isUploading: true }],
    ['a publish is running', { isPublishing: true }],
    ['a section has a problem', { problemCount: 1 }],
    ['the last autosave of this edit failed', { failedAtThisEdit: true }],
  ])('waits when %s', (_label, override) => {
    expect(shouldAutosave({ ...ready, ...override })).toBe(false);
  });
});

describe('isEditingLocked', () => {
  it('locks editing during a manual save or a publish, not during autosave', () => {
    expect(isEditingLocked({ saveMode: null, isPublishing: false })).toBe(
      false,
    );
    expect(isEditingLocked({ saveMode: 'auto', isPublishing: false })).toBe(
      false,
    );
    expect(isEditingLocked({ saveMode: 'manual', isPublishing: false })).toBe(
      true,
    );
    expect(isEditingLocked({ saveMode: null, isPublishing: true })).toBe(true);
  });
});

describe('saveBlock', () => {
  it('lets a save run when nothing else is running', () => {
    expect(
      saveBlock({ isSaving: false, isUploading: false, beforePublish: true }),
    ).toEqual({
      isBlocked: false,
      message: null,
    });
  });

  it('tells the person to wait when a publish meets a running save or upload', () => {
    expect(
      saveBlock({ isSaving: true, isUploading: false, beforePublish: true }),
    ).toEqual({
      isBlocked: true,
      message: BUSY_BEFORE_PUBLISH_MESSAGE,
    });
    expect(
      saveBlock({ isSaving: false, isUploading: true, beforePublish: true })
        .message,
    ).toBe('Please wait for the save or upload to finish, then publish again.');
  });

  it('blocks a plain save quietly', () => {
    expect(
      saveBlock({ isSaving: true, isUploading: false, beforePublish: false }),
    ).toEqual({
      isBlocked: true,
      message: null,
    });
  });
});

describe('toAbsoluteUrl', () => {
  it('resolves a relative file url against the CRM api origin', () => {
    expect(toAbsoluteUrl('/file/abc?token=x', 'https://crm.example.org')).toBe(
      'https://crm.example.org/file/abc?token=x',
    );
  });

  it('keeps absolute urls and drops urls it cannot resolve', () => {
    expect(
      toAbsoluteUrl('https://cdn.example.org/a.jpg', 'https://crm.example.org'),
    ).toBe('https://cdn.example.org/a.jpg');
    expect(toAbsoluteUrl('/file/abc', '')).toBeNull();
  });

  it('makes relative draft and published photo urls absolute', () => {
    const sections = createBuilderState([
      makeRecord({
        id: 'hero',
        photo: [{ fileId: 'f', label: '', url: '/file/f' }],
      }),
    ]).sections;

    expect(
      buildDraftPreview(sections, 'https://crm.example.org', LIVE_PAGE)
        .photoUrls,
    ).toEqual({
      f: 'https://crm.example.org/file/f',
    });
    expect(
      buildPublishedPreview(
        null,
        [{ fileId: 'c', url: '/file/c' }],
        'https://crm.example.org',
        LIVE_PAGE,
      ).photoUrls,
    ).toEqual({ c: 'https://crm.example.org/file/c' });
  });
});

describe('listSectionProblems', () => {
  it('names the section each problem belongs to', () => {
    const sections = createBuilderState([
      makeRecord({
        id: 'hero',
        heading: 'Feed',
        primaryButtonLabel: 'More',
        primaryButtonAction: 'LINK',
        primaryButtonUrl: { primaryLinkUrl: 'http://x.org' },
      }),
    ]).sections;

    expect(listSectionProblems(sections)).toEqual([
      {
        sectionId: 'hero',
        message:
          'Top banner (Hero) "Feed": the main button link must start with https://',
      },
    ]);
  });
});

describe('shouldShowTypePicker', () => {
  const ready = { pageType: null, sectionCount: 0, isLoading: false };

  it('shows for a loaded page with no type and no sections', () => {
    expect(shouldShowTypePicker(ready)).toBe(true);
  });

  it('hides while loading, with a type, or with sections', () => {
    expect(shouldShowTypePicker({ ...ready, isLoading: true })).toBe(false);
    expect(shouldShowTypePicker({ ...ready, pageType: 'ONE_STEP' })).toBe(
      false,
    );
    expect(shouldShowTypePicker({ ...ready, pageType: 'TWO_STEP' })).toBe(
      false,
    );
    expect(shouldShowTypePicker({ ...ready, sectionCount: 1 })).toBe(false);
  });
});

describe('the draft preview of a Two-Step page', () => {
  const sections = createBuilderState([
    makeRecord({ id: 'hero', heading: 'Pray' }),
    makeRecord({ id: 'join', sectionType: 'JOIN', position: 1 }),
    makeRecord({
      id: 'thanks',
      sectionType: 'THANKS',
      position: 2,
      primaryButtonLabel: 'Give',
      primaryButtonAction: 'GIVE',
      items: [{ amount: '15' }],
    }),
    makeRecord({
      id: 'invite',
      sectionType: 'INVITE',
      position: 3,
      inviteMessage: '{friend}, come see.',
    }),
  ]).sections;
  const render = (previewShowsThanks: boolean, giveEnabled = true) => {
    const content = buildDraftPreview(sections, '', LIVE_PAGE);

    return renderSectionPage({
      slug: 'pray',
      title: content.page.title,
      shareDescription: content.page.shareDescription,
      shareImageUrl: content.page.shareImageUrl,
      organizationName: 'Org',
      tagline: '',
      logoUrl: null,
      siteUrl: null,
      mailingAddress: '',
      pageType: 'TWO_STEP',
      giveEnabled,
      giveAmounts: [25, 50, 100],
      givingQuestionEnabled: false,
      turnstileSiteKey: '',
      attribution: parseAttribution({}),
      routeBasePath: '',
      sections: content.sections,
      photoUrls: content.photoUrls,
      invite: null,
      inviteCode: null,
      previewMode: true,
      previewShowsThanks,
    });
  };

  it('shows the thank-you screen and hides the join form when asked', () => {
    const html = render(true);

    expect(html).toContain('<section class="thanks-screen" id="thanks">');
    expect(html).toContain('id="join" hidden>');
  });

  it('hides the thank-you screen by default', () => {
    expect(render(false)).toContain(
      '<section class="thanks-screen" id="thanks" hidden>',
    );
  });

  it('hides Give buttons in the preview when giving is off', () => {
    expect(render(true)).toContain('give-trigger"');
    expect(render(true, false)).not.toContain('give-trigger"');
  });

  it('carries the draft invite message', () => {
    expect(
      buildDraftPreview(sections, '', LIVE_PAGE).sections.find(
        (section) => section.id === 'invite',
      )?.inviteMessage,
    ).toBe('{friend}, come see.');
  });
});

describe('giveWarning', () => {
  it('warns when Stripe is not set up', () => {
    expect(giveWarning(false)).toBe(
      'Stripe is not set up. Give buttons do not show.',
    );
  });

  it('says nothing when Stripe is set up or the answer is not known yet', () => {
    expect(giveWarning(true)).toBeNull();
    expect(giveWarning(null)).toBeNull();
  });
});
