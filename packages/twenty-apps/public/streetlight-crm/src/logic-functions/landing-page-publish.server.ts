import { MetadataApiClient } from 'twenty-client-sdk/metadata';

import { LANDING_PAGE_PUBLISHED_PHOTOS_FIELD_ID } from 'src/constants/marketing-identifiers';
import { gql } from 'src/logic-functions/workspace-gql';
import {
  buildPublishedContent,
  isHttpsUrl,
  parsePublishedContent,
  type LandingPageSectionRecord,
  type PublishedPage,
  type PublishedPhoto,
} from 'src/shared/marketing/sections';

type PublishBody =
  | { ok: true; publishedAt: string; sectionCount: number }
  | { ok: false; message: string };

export type PublishResult = { status: number; body: PublishBody };

type PublishedPhotoFile = { fileId: string; label: string };

type DraftPhoto = {
  fileId: string;
  label: string;
  extension: string;
  url: string | null;
};

type LoadedPage = {
  headline: string;
  shareDescription: string;
  shareImage: DraftPhoto | null;
  publishedContent: unknown;
  publishedPhotos: PublishedPhotoFile[];
  sections: LandingPageSectionRecord[];
};

const PUBLISH_FAILED_MESSAGE =
  'The page could not be published. Please try again.';
// Cloudflare swaps a 502 body for its own page, so the builder would lose the message.
const PUBLISH_ERROR_STATUS = 500;
const MAX_PHOTO_BYTES = 30 * 1024 * 1024;
const SECTION_PAGE_SIZE = 200;

class PhotoCopyError extends Error {}

const refuse = (status: number, message: string): PublishResult => ({
  status,
  body: { ok: false, message },
});

const readFiles = (value: unknown): DraftPhoto[] =>
  Array.isArray(value)
    ? value.flatMap((file) =>
        typeof file?.fileId === 'string' && file.fileId !== ''
          ? [
              {
                fileId: file.fileId,
                label: typeof file.label === 'string' ? file.label : '',
                extension:
                  typeof file.extension === 'string' ? file.extension : '',
                url: typeof file.url === 'string' ? file.url : null,
              },
            ]
          : [],
      )
    : [];

const loadPage = async (landingPageId: string): Promise<LoadedPage | null> => {
  const data = await gql(
    `query ($id: UUID!, $first: Int!) {
      landingPages(filter: { id: { eq: $id } }, first: 1) {
        edges {
          node {
            id headline shareDescription shareImage { fileId label extension url }
            publishedContent publishedPhotos { fileId label }
          }
        }
      }
      landingPageSections(filter: { landingPageId: { eq: $id } }, first: $first) {
        edges {
          node {
            id sectionType position isVisible eyebrow heading text
            photo { fileId label extension url }
            primaryButtonLabel primaryButtonAction primaryButtonUrl { primaryLinkUrl }
            secondaryButtonLabel secondaryButtonAction secondaryButtonUrl { primaryLinkUrl }
            trustLine badgeValue badgeText items smallPrint inviteMessage
          }
        }
        pageInfo { hasNextPage }
      }
    }`,
    { id: landingPageId, first: SECTION_PAGE_SIZE },
  );
  const node = data.landingPages?.edges?.[0]?.node;

  if (!node) return null;

  if (data.landingPageSections?.pageInfo?.hasNextPage === true) {
    throw new Error(`Landing page has more than ${SECTION_PAGE_SIZE} sections`);
  }

  const sectionEdges: { node: LandingPageSectionRecord }[] =
    data.landingPageSections?.edges ?? [];

  return {
    headline: typeof node.headline === 'string' ? node.headline : '',
    shareDescription:
      typeof node.shareDescription === 'string' ? node.shareDescription : '',
    shareImage: readFiles(node.shareImage)[0] ?? null,
    publishedContent: node.publishedContent ?? null,
    publishedPhotos: readFiles(node.publishedPhotos).map(
      ({ fileId, label }) => ({
        fileId,
        label,
      }),
    ),
    sections: sectionEdges.map((edge) => edge.node),
  };
};

const readCapped = async (response: Response): Promise<Buffer> => {
  const declaredLength = Number(response.headers.get('content-length'));

  if (declaredLength > MAX_PHOTO_BYTES || response.body === null) {
    throw new PhotoCopyError();
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  for await (const chunk of response.body) {
    total += chunk.byteLength;

    if (total > MAX_PHOTO_BYTES) throw new PhotoCopyError();
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
};

const REDIRECT_STATUSES = [301, 302, 303, 307, 308];

// S3 storage answers the file route with one redirect to a presigned https url.
// We follow that one hop only, and only to https.
const downloadPhoto = async (url: string | null): Promise<Buffer> => {
  if (url === null || !isHttpsUrl(url)) throw new PhotoCopyError();

  let response = await fetch(url, { method: 'GET', redirect: 'manual' });

  if (REDIRECT_STATUSES.includes(response.status)) {
    const location = response.headers.get('location') ?? '';

    if (!isHttpsUrl(location)) throw new PhotoCopyError();

    response = await fetch(location, { method: 'GET', redirect: 'error' });
  }

  if (!response.ok) throw new PhotoCopyError();

  return readCapped(response);
};

const FILE_EXTENSION = /\.[A-Za-z0-9]{1,10}$/;

// The server refuses an upload whose file name has no extension, and labels usually have none.
const toFileName = (label: string, extension: string): string => {
  const base = label.replace(/[^\w.-]+/g, '-').slice(0, 100) || 'photo';

  if (FILE_EXTENSION.test(base)) return base;
  if (!/^\.[A-Za-z0-9]{1,10}$/.test(extension)) throw new PhotoCopyError();

  return `${base}${extension}`;
};

const uploadCopy = async (draft: DraftPhoto): Promise<PublishedPhotoFile> => {
  const fileBuffer = await downloadPhoto(draft.url);
  const filename = toFileName(draft.label, draft.extension);
  const uploaded = await new MetadataApiClient().uploadFile({
    fileBuffer,
    filename,
    fieldMetadataUniversalIdentifier: LANDING_PAGE_PUBLISHED_PHOTOS_FIELD_ID,
  });

  if (typeof uploaded?.id !== 'string' || uploaded.id === '') {
    throw new PhotoCopyError();
  }

  return { fileId: uploaded.id, label: filename };
};

// A copy is reused only while publishedPhotos still holds it; otherwise it is gone.
const findReusableCopies = (
  page: LoadedPage,
): Map<string, PublishedPhotoFile> => {
  const filesById = new Map(
    page.publishedPhotos.map((file) => [file.fileId, file]),
  );
  const copies = new Map<string, PublishedPhotoFile>();

  const published = parsePublishedContent(page.publishedContent);
  const publishedPhotos = [
    published?.page.shareImage ?? null,
    ...(published?.sections ?? []).map((section) => section.photo),
  ];

  for (const photo of publishedPhotos) {
    const file = photo && filesById.get(photo.fileId);

    if (photo && file && photo.sourceFileId !== '') {
      copies.set(photo.sourceFileId, file);
    }
  }

  return copies;
};

const resolvePhotos = async (
  page: LoadedPage,
): Promise<{
  photos: Map<string, PublishedPhoto | null>;
  shareImage: PublishedPhoto | null;
  files: PublishedPhotoFile[];
}> => {
  const draftPhotos = new Map<string, DraftPhoto>();
  const draftPhotoMap = new Map<string, PublishedPhoto | null>();

  for (const record of page.sections) {
    const draft = readFiles(record.photo)[0];

    if (draft) {
      draftPhotos.set(record.id, draft);
      draftPhotoMap.set(record.id, {
        fileId: draft.fileId,
        sourceFileId: draft.fileId,
        altText: draft.label,
      });
    }
  }

  // The draft build decides which photos publish (visible, photo types, section cap).
  const draftContent = buildPublishedContent(page.sections, draftPhotoMap);
  const copies = findReusableCopies(page);
  const photos = new Map<string, PublishedPhoto | null>();

  for (const section of draftContent.sections) {
    const draft = draftPhotos.get(section.id);

    if (!section.photo || !draft) continue;

    let copy = copies.get(draft.fileId);

    if (!copy) {
      copy = await uploadCopy(draft);
      copies.set(draft.fileId, copy);
    }

    photos.set(section.id, {
      fileId: copy.fileId,
      sourceFileId: draft.fileId,
      altText: section.photo.altText,
    });
  }

  let shareImage: PublishedPhoto | null = null;

  if (page.shareImage) {
    let copy = copies.get(page.shareImage.fileId);

    if (!copy) {
      copy = await uploadCopy(page.shareImage);
      copies.set(page.shareImage.fileId, copy);
    }

    shareImage = {
      fileId: copy.fileId,
      sourceFileId: page.shareImage.fileId,
      altText: page.shareImage.label,
    };
  }

  const usedIds = new Set(
    [...photos.values(), shareImage].flatMap((photo) =>
      photo ? [photo.fileId] : [],
    ),
  );
  const files = [...copies.values()].filter((file) => usedIds.has(file.fileId));

  return { photos, shareImage, files };
};

export const publishLandingPage = async ({
  landingPageId,
  publishedById,
}: {
  landingPageId: string;
  publishedById: string | null;
}): Promise<PublishResult> => {
  let page: LoadedPage | null;

  try {
    page = await loadPage(landingPageId);
  } catch {
    console.error(
      `landing page ${landingPageId} not published: page load failed`,
    );

    return refuse(PUBLISH_ERROR_STATUS, PUBLISH_FAILED_MESSAGE);
  }

  if (page === null) return refuse(404, 'Landing page not found');

  let resolved: Awaited<ReturnType<typeof resolvePhotos>>;

  try {
    resolved = await resolvePhotos(page);
  } catch {
    // The error can carry a signed url or upload response, so it is never logged.
    console.log(
      `landing page ${landingPageId} not published: photo copy failed`,
    );

    return refuse(PUBLISH_ERROR_STATUS, 'A photo could not be copied. Try Publish again.');
  }

  const publishedPage: PublishedPage = {
    title: page.headline,
    shareDescription: page.shareDescription,
    shareImage: resolved.shareImage,
  };
  const publishedContent = buildPublishedContent(
    page.sections,
    resolved.photos,
    publishedPage,
  );
  const publishedAt = new Date().toISOString();

  try {
    await gql(
      `mutation ($id: UUID!, $data: LandingPageUpdateInput!) {
      updateLandingPage(id: $id, data: $data) { id }
    }`,
      {
        id: landingPageId,
        data: {
          publishedContent,
          publishedPhotos: resolved.files,
          publishedAt,
          publishedById,
        },
      },
    );
  } catch {
    console.error(
      `landing page ${landingPageId} not published: page update failed`,
    );

    return refuse(PUBLISH_ERROR_STATUS, PUBLISH_FAILED_MESSAGE);
  }

  return {
    status: 200,
    body: {
      ok: true,
      publishedAt,
      sectionCount: publishedContent.sections.length,
    },
  };
};
