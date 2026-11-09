import {
  toSectionPayload,
  type BuilderSection,
} from 'src/front-components/landing-page-builder/use-builder-state';
import {
  buildPublishedContent,
  parsePublishedContent,
  type LandingPageSectionRecord,
  type PublishedPhoto,
  type SectionContent,
} from 'src/shared/marketing/sections';
import type { PageType } from 'src/shared/marketing/types';

export type PreviewPage = {
  title: string;
  shareDescription: string;
  shareImageUrl: string | null;
};

export type PreviewContent = {
  page: PreviewPage;
  sections: SectionContent[];
  photoUrls: Record<string, string>;
};

// The records exactly as Save would write them, so the preview and the diff match the saved draft.
export const toDraftRecords = (
  sections: BuilderSection[],
): LandingPageSectionRecord[] =>
  sections.map((section) => {
    const payload = toSectionPayload(section);

    return {
      ...payload,
      id: section.id,
      photo: section.photo
        ? [
            {
              fileId: section.photo.fileId,
              label: section.photo.label,
              ...(section.photo.url ? { url: section.photo.url } : {}),
            },
          ]
        : null,
    };
  });

// The REST API can return file urls relative to its own origin, and the preview frame has no origin.
export const toAbsoluteUrl = (
  url: string,
  apiBaseUrl: string,
): string | null => {
  try {
    return new URL(url, apiBaseUrl === '' ? undefined : apiBaseUrl).toString();
  } catch {
    return null;
  }
};

const addPhotoUrl = (
  photoUrls: Record<string, string>,
  fileId: string,
  url: string | null | undefined,
  apiBaseUrl: string,
) => {
  const absoluteUrl = url ? toAbsoluteUrl(url, apiBaseUrl) : null;

  if (absoluteUrl !== null) photoUrls[fileId] = absoluteUrl;
};

const withAbsoluteShareImage = (
  livePage: PreviewPage,
  apiBaseUrl: string,
): PreviewPage => ({
  ...livePage,
  shareImageUrl: livePage.shareImageUrl
    ? toAbsoluteUrl(livePage.shareImageUrl, apiBaseUrl)
    : null,
});

export const buildDraftPreview = (
  sections: BuilderSection[],
  apiBaseUrl: string,
  livePage: PreviewPage,
): PreviewContent => {
  const photos = new Map<string, PublishedPhoto | null>();
  const photoUrls: Record<string, string> = {};

  for (const section of sections) {
    if (section.photo === null) continue;
    photos.set(section.id, {
      fileId: section.photo.fileId,
      sourceFileId: section.photo.fileId,
      altText: section.photo.label,
    });
    addPhotoUrl(photoUrls, section.photo.fileId, section.photo.url, apiBaseUrl);
  }

  return {
    page: withAbsoluteShareImage(livePage, apiBaseUrl),
    sections: buildPublishedContent(toDraftRecords(sections), photos).sections,
    photoUrls,
  };
};

export const buildPublishedPreview = (
  publishedContent: unknown,
  publishedPhotos: { fileId: string; url?: string | null }[],
  apiBaseUrl: string,
  livePage: PreviewPage,
): PreviewContent => {
  const photoUrls: Record<string, string> = {};

  for (const photo of publishedPhotos) {
    addPhotoUrl(photoUrls, photo.fileId, photo.url, apiBaseUrl);
  }

  const published = parsePublishedContent(publishedContent);

  // Same rule as the public route: live page fields only when nothing valid is published.
  if (published === null) {
    return {
      page: withAbsoluteShareImage(livePage, apiBaseUrl),
      sections: [],
      photoUrls,
    };
  }

  const shareImageId = published.page.shareImage?.fileId;

  return {
    page: {
      title: published.page.title,
      shareDescription: published.page.shareDescription,
      shareImageUrl: (shareImageId && photoUrls[shareImageId]) || null,
    },
    sections: published.sections,
    photoUrls,
  };
};

// A page with no type and no sections is new: the picker makes its starter sections.
export const shouldShowTypePicker = (input: {
  pageType: PageType | null;
  sectionCount: number;
  isLoading: boolean;
}): boolean =>
  !input.isLoading && input.pageType === null && input.sectionCount === 0;

export const shouldAutosave = (input: {
  isDirty: boolean;
  isSaving: boolean;
  isUploading: boolean;
  isPublishing: boolean;
  problemCount: number;
  failedAtThisEdit: boolean;
}): boolean =>
  input.isDirty &&
  !input.isSaving &&
  !input.isUploading &&
  !input.isPublishing &&
  input.problemCount === 0 &&
  !input.failedAtThisEdit;

// Autosave keeps the editor open. A manual save or a publish locks it so the draft
// the route reads cannot change under it.
export const isEditingLocked = (input: {
  saveMode: 'manual' | 'auto' | null;
  isPublishing: boolean;
}): boolean => input.saveMode === 'manual' || input.isPublishing;

export const STRIPE_NOT_SET_UP_WARNING =
  'Stripe is not set up. Give buttons do not show.';

// null means the builder does not know yet, so it warns about nothing.
export const giveWarning = (giveEnabled: boolean | null): string | null =>
  giveEnabled === false ? STRIPE_NOT_SET_UP_WARNING : null;

export const BUSY_BEFORE_PUBLISH_MESSAGE =
  'Please wait for the save or upload to finish, then publish again.';

export const saveBlock = (input: {
  isSaving: boolean;
  isUploading: boolean;
  beforePublish: boolean;
}): { isBlocked: boolean; message: string | null } => {
  const isBlocked = input.isSaving || input.isUploading;

  return {
    isBlocked,
    message:
      isBlocked && input.beforePublish ? BUSY_BEFORE_PUBLISH_MESSAGE : null,
  };
};
