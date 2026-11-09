import { useEffect, useRef, useState } from 'react';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { RestApiClient, RestApiClientError } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import {
  copyToClipboard,
  getApplicationVariable,
  useRecordId,
} from 'twenty-sdk/front-component';

import {
  GET_LANDING_PAGE_BUILDER_CONTEXT_ROUTE_PATH,
  LANDING_PAGE_BUILDER_FRONT_COMPONENT_ID,
  LANDING_PAGE_SECTION_PHOTO_FIELD_ID,
  PUBLISH_LANDING_PAGE_ROUTE_PATH,
} from 'src/constants/marketing-identifiers';
import {
  buildDraftPreview,
  buildPublishedPreview,
  giveWarning,
  isEditingLocked,
  saveBlock,
  shouldAutosave,
  shouldShowTypePicker,
  toDraftRecords,
  type PreviewContent,
  type PreviewPage,
} from 'src/front-components/landing-page-builder/preview-content';
import {
  PreviewPane,
  type PreviewSource,
  type PreviewWidth,
} from 'src/front-components/landing-page-builder/preview-pane';
import { addStarterSections } from 'src/front-components/landing-page-builder/add-starter-sections';
import { PageTypePicker } from 'src/front-components/landing-page-builder/page-type-picker';
import { PublishBar } from 'src/front-components/landing-page-builder/publish-bar';
import { SectionEditor } from 'src/front-components/landing-page-builder/section-editor';
import { SectionList } from 'src/front-components/landing-page-builder/section-list';
import {
  builderReducer,
  canAddType,
  createBuilderState,
  describeSection,
  findSectionProblems,
  listSectionProblems,
  hasUnsavedChanges,
  toSectionPayload,
  type BuilderAction,
  type BuilderState,
} from 'src/front-components/landing-page-builder/use-builder-state';
import {
  CARD_GAP,
  DANGER,
  STYLE,
  SUCCESS,
  WARNING,
} from 'src/shared/daily-giving-styles';
import { parseAttribution } from 'src/shared/marketing/attribution';
import {
  renderSectionPage,
  toPageType,
} from 'src/shared/marketing/landing-page-sections-html';
import {
  draftDiffersFromPublished,
  isHttpsUrl,
  parseGiveAmounts,
  parsePublishedContent,
  type DraftPageFields,
  type LandingPageSectionRecord,
} from 'src/shared/marketing/sections';
import { isValidSlug, toSlug } from 'src/shared/marketing/slug';
import type { PageType } from 'src/shared/marketing/types';

const api = new RestApiClient();

const SECTIONS_PATH = '/rest/landingPageSections';
const OBJECTS_PAGE_SIZE = 100;
const AUTOSAVE_DELAY_MS = 2000;
const PREVIEW_DELAY_MS = 300;
const DEFAULT_ORGANIZATION_NAME = 'Our organization';

type FileValue = { fileId: string; url?: string | null };

type LandingPageRest = {
  name?: string | null;
  status?: string | null;
  slug?: string | null;
  headline?: string | null;
  pageType?: string | null;
  giveAmounts?: string | null;
  publishedContent?: unknown;
  publishedPhotos?: FileValue[] | null;
  publishedAt?: string | null;
  publishedBy?: {
    name?: { firstName?: string | null; lastName?: string | null } | null;
  } | null;
  shareDescription?: string | null;
  shareImage?: FileValue[] | null;
};

type PublishReply = {
  ok?: boolean;
  publishedAt?: string;
  sectionCount?: number;
};

type Notice = { tone: 'error' | 'success'; lines: string[] };

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  LIVE: 'Live',
  ARCHIVED: 'Archived',
};

const errorText = (error: unknown): string => {
  if (error instanceof RestApiClientError) {
    const body = error.body as {
      error?: unknown;
      message?: unknown;
      messages?: unknown;
    } | null;

    if (typeof body?.message === 'string') return body.message;
    if (Array.isArray(body?.messages) && typeof body.messages[0] === 'string') {
      return body.messages[0];
    }
    if (typeof body?.error === 'string') return body.error;
  }

  return 'The server did not answer. Check your connection.';
};

const fetchPage = async (
  landingPageId: string,
): Promise<LandingPageRest | null> => {
  const response = await api.get<{ data?: { landingPage?: LandingPageRest } }>(
    `/rest/landingPages/${encodeURIComponent(landingPageId)}`,
    { query: { depth: 1 } },
  );

  return response.data?.landingPage ?? null;
};

const fetchGiveEnabled = async (): Promise<boolean> => {
  const response = await api.get<{ giveEnabled?: boolean }>(
    `/s${GET_LANDING_PAGE_BUILDER_CONTEXT_ROUTE_PATH}`,
  );

  return response.giveEnabled === true;
};

const readVariable = (name: string): string =>
  (getApplicationVariable(name) ?? '').trim();

// Same rule as the public route: only https links reach the page.
const readHttpsVariable = (name: string): string | null => {
  const value = readVariable(name);

  return isHttpsUrl(value) ? value : null;
};

// The worker gets the API origin the REST client uses; relative file urls resolve against it.
const readApiBaseUrl = (): string =>
  (globalThis.process?.env?.TWENTY_API_URL ?? '').trim();

const publisherName = (page: LandingPageRest): string | null => {
  const name = page.publishedBy?.name;
  const fullName = `${name?.firstName ?? ''} ${name?.lastName ?? ''}`.trim();

  return fullName === '' ? null : fullName;
};

const toLivePreviewPage = (page: LandingPageRest): PreviewPage => ({
  title: page.headline ?? '',
  shareDescription: page.shareDescription ?? '',
  shareImageUrl: page.shareImage?.[0]?.url ?? null,
});

const toDraftPageFields = (page: LandingPageRest): DraftPageFields => ({
  title: page.headline ?? '',
  shareDescription: page.shareDescription ?? '',
  shareImageFileId: page.shareImage?.[0]?.fileId ?? null,
});

const renderPreview = (
  page: LandingPageRest,
  content: PreviewContent,
  showsThanks: boolean,
  giveEnabled: boolean,
): string =>
  renderSectionPage({
    slug: page.slug ?? '',
    title: content.page.title,
    shareDescription: content.page.shareDescription,
    shareImageUrl: content.page.shareImageUrl,
    organizationName:
      readVariable('LANDING_PAGE_ORGANIZATION_NAME') ||
      DEFAULT_ORGANIZATION_NAME,
    tagline: readVariable('LANDING_PAGE_TAGLINE'),
    logoUrl: readHttpsVariable('LANDING_PAGE_LOGO_URL'),
    siteUrl: readHttpsVariable('LANDING_PAGE_SITE_URL'),
    mailingAddress: readVariable('LANDING_PAGE_MAILING_ADDRESS'),
    pageType: toPageType(page.pageType),
    giveEnabled,
    giveAmounts: parseGiveAmounts(page.giveAmounts ?? null),
    givingQuestionEnabled: readVariable('GIVING_CONTACT_EMAIL') !== '',
    turnstileSiteKey: '',
    attribution: parseAttribution({}),
    routeBasePath: '',
    sections: content.sections,
    photoUrls: content.photoUrls,
    invite: null,
    inviteCode: null,
    previewMode: true,
    previewShowsThanks: showsThanks,
  });

const fetchSections = async (
  landingPageId: string,
): Promise<LandingPageSectionRecord[]> => {
  const response = await api.get<{
    data?: { landingPageSections?: LandingPageSectionRecord[] };
  }>(SECTIONS_PATH, {
    query: {
      filter: `landingPageId[eq]:"${landingPageId}"`,
      order_by: 'position[AscNullsLast]',
      limit: 200,
    },
  });

  return response.data?.landingPageSections ?? [];
};

type FieldsPage = {
  fields: { id: string; universalIdentifier: string | null }[];
  nextCursor: string | null;
};

const fetchFieldsPage = async (after: string | null): Promise<FieldsPage> => {
  const result = await new MetadataApiClient().query({
    objects: {
      __args: {
        paging: { first: OBJECTS_PAGE_SIZE, ...(after ? { after } : {}) },
        filter: {},
      },
      pageInfo: { hasNextPage: true, endCursor: true },
      edges: { node: { fieldsList: { id: true, universalIdentifier: true } } },
    },
  });
  const pageInfo = result.objects.pageInfo;

  return {
    fields: result.objects.edges.flatMap((edge) => edge.node.fieldsList ?? []),
    nextCursor:
      pageInfo.hasNextPage === true ? (pageInfo.endCursor ?? null) : null,
  };
};

// The metadata API can't filter on universalIdentifier, so page through objects until the field turns up.
const fetchPhotoFieldMetadataId = async (): Promise<string | null> => {
  let cursor: string | null = null;

  for (;;) {
    const page: FieldsPage = await fetchFieldsPage(cursor);
    const photoField = page.fields.find(
      (field) =>
        field.universalIdentifier === LANDING_PAGE_SECTION_PHOTO_FIELD_ID,
    );

    if (photoField) return photoField.id;
    if (page.nextCursor === null) return null;
    cursor = page.nextCursor;
  }
};

const EMPTY_STATE: BuilderState = createBuilderState([]);

const LandingPageBuilder = () => {
  const landingPageId = useRecordId();
  const [state, setState] = useState<BuilderState>(EMPTY_STATE);
  // The latest state, readable mid-save before React renders it.
  const stateRef = useRef<BuilderState>(EMPTY_STATE);
  const [page, setPage] = useState<LandingPageRest | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveMode, setSaveMode] = useState<'manual' | 'auto' | null>(null);
  const saving = saveMode !== null;
  const [notice, setNotice] = useState<Notice | null>(null);
  const [photoFieldMetadataId, setPhotoFieldMetadataId] = useState<
    string | null
  >(null);
  const [uploadCount, setUploadCount] = useState(0);
  const [previewSource, setPreviewSource] = useState<PreviewSource>('draft');
  const [previewWidth, setPreviewWidth] = useState<PreviewWidth>('phone');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewShowsThanks, setPreviewShowsThanks] = useState(false);
  // null until the server answers; the preview hides Give buttons until then.
  const [giveEnabled, setGiveEnabled] = useState<boolean | null>(null);
  const [isAddingStarters, setIsAddingStarters] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const addingStartersRef = useRef(false);
  // After a failed rollback the server state is unknown, so the picker waits for a reload.
  const [isPickerBlocked, setIsPickerBlocked] = useState(false);
  const [isConfirmingPublish, setIsConfirmingPublish] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const publishingRef = useRef(false);
  const [isFixingSlug, setIsFixingSlug] = useState(false);
  const nextTemporaryId = useRef(0);
  const activePageIdRef = useRef<string | null>(landingPageId);
  const autosaveFailedStateRef = useRef<BuilderState | null>(null);

  const dispatch = (action: BuilderAction) => {
    stateRef.current = builderReducer(stateRef.current, action);
    setState(stateRef.current);
  };

  // Drag events are not stopped by the disabled fieldset, so edits check the lock too.
  const edit = (action: BuilderAction) => {
    if (!publishingRef.current) dispatch(action);
  };

  useEffect(() => {
    activePageIdRef.current = landingPageId;

    if (landingPageId === null) {
      setLoading(false);

      return;
    }

    let cancelled = false;

    setLoading(true);
    setSaveMode(null);
    setNotice(null);
    setPage(null);
    setIsConfirmingPublish(false);
    setPickerError(null);
    setIsAddingStarters(false);
    setIsPickerBlocked(false);
    addingStartersRef.current = false;

    Promise.all([fetchPage(landingPageId), fetchSections(landingPageId)])
      .then(([loadedPage, records]) => {
        if (cancelled) return;
        setPage(loadedPage);
        dispatch({ type: 'loaded', records });
      })
      .catch((error) => {
        if (!cancelled) {
          setNotice({
            tone: 'error',
            lines: [`The page could not be loaded. ${errorText(error)}`],
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    fetchPhotoFieldMetadataId()
      .then((id) => {
        if (!cancelled) setPhotoFieldMetadataId(id);
      })
      .catch(() => undefined);

    fetchGiveEnabled()
      .then((isEnabled) => {
        if (!cancelled) setGiveEnabled(isEnabled);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [landingPageId]);

  const temporaryId = () => {
    nextTemporaryId.current += 1;

    return `new-${nextTemporaryId.current}`;
  };

  // Resolves true only when every change was written and nothing is left unsaved.
  const save = async (options: {
    isAutosave: boolean;
    beforePublish?: boolean;
  }): Promise<boolean> => {
    if (landingPageId === null) return false;

    const block = saveBlock({
      isSaving: saving,
      isUploading: uploadCount > 0,
      beforePublish: options.beforePublish === true,
    });

    if (block.isBlocked) {
      if (block.message !== null)
        setNotice({ tone: 'error', lines: [block.message] });

      return false;
    }

    const pageId = landingPageId;
    const isStale = () => activePageIdRef.current !== pageId;
    const snapshot = stateRef.current;
    const problems = findSectionProblems(snapshot.sections);
    const showFailure = (lines: string[]) =>
      setNotice({
        tone: 'error',
        lines: options.beforePublish
          ? [
              'Your changes could not be saved, so nothing was published.',
              ...lines,
            ]
          : lines,
      });

    if (problems.length > 0) {
      showFailure(['Fix these before saving:', ...problems]);

      return false;
    }

    setSaveMode(options.isAutosave ? 'auto' : 'manual');
    setNotice(null);
    let failure: string | null = null;

    for (const id of snapshot.removedIds) {
      try {
        await api.delete(`${SECTIONS_PATH}/${encodeURIComponent(id)}`, {
          query: { soft_delete: true },
        });
        if (isStale()) return false;
        dispatch({ type: 'committed', deletedId: id });
      } catch (error) {
        if (isStale()) return false;
        // Already gone counts as deleted.
        if (error instanceof RestApiClientError && error.status === 404) {
          dispatch({ type: 'committed', deletedId: id });
          continue;
        }
        failure = `A deleted section could not be removed. ${errorText(error)}`;
        break;
      }
    }

    for (const section of failure === null ? snapshot.sections : []) {
      if (!snapshot.dirtyIds.includes(section.id)) continue;
      const version = snapshot.versions[section.id] ?? 0;

      try {
        const payload = toSectionPayload(section);

        if (section.isNew) {
          const response = await api.post<{
            data?: { createLandingPageSection?: { id: string } };
          }>(SECTIONS_PATH, { ...payload, landingPageId: pageId });

          if (isStale()) return false;
          const id = response.data?.createLandingPageSection?.id;

          if (typeof id !== 'string' || id === '') {
            failure = `${describeSection(section)} was not saved. The server did not return the new section. Reload the page to check before you try again.`;
            break;
          }
          dispatch({
            type: 'committed',
            created: { temporaryId: section.id, id, version },
          });
        } else {
          await api.patch(
            `${SECTIONS_PATH}/${encodeURIComponent(section.id)}`,
            payload,
          );
          if (isStale()) return false;
          dispatch({ type: 'committed', updated: { id: section.id, version } });
        }
      } catch (error) {
        if (isStale()) return false;
        failure = `${describeSection(section)} was not saved. ${errorText(error)}`;
        break;
      }
    }

    if (failure !== null) {
      autosaveFailedStateRef.current = stateRef.current;
      showFailure([
        failure,
        'Your edits are still here. Press Save to try again.',
      ]);
      setSaveMode(null);

      return false;
    }

    try {
      const records = await fetchSections(pageId);

      if (isStale()) return false;
      dispatch({ type: 'saved', records });
      const isClean = !hasUnsavedChanges(stateRef.current);

      if (isClean && !options.isAutosave) {
        setNotice({
          tone: 'success',
          lines: ['Saved. The public page has not changed.'],
        });
      }

      return isClean;
    } catch (error) {
      if (isStale()) return false;
      showFailure([
        `Saved, but the page could not be reloaded. ${errorText(error)}`,
      ]);

      return false;
    } finally {
      if (!isStale()) setSaveMode(null);
    }
  };

  const sectionProblems = listSectionProblems(state.sections);
  const problemCount = sectionProblems.length;

  useEffect(() => {
    if (
      !shouldAutosave({
        isDirty: hasUnsavedChanges(state),
        isSaving: saving,
        isUploading: uploadCount > 0,
        isPublishing: publishing,
        problemCount,
        failedAtThisEdit: autosaveFailedStateRef.current === state,
      })
    ) {
      return;
    }

    const timer = setTimeout(() => {
      void save({ isAutosave: true });
    }, AUTOSAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [state, saving, uploadCount, publishing, problemCount]);

  useEffect(() => {
    if (page === null) return;

    const timer = setTimeout(() => {
      const content =
        previewSource === 'draft'
          ? buildDraftPreview(
              state.sections,
              readApiBaseUrl(),
              toLivePreviewPage(page),
            )
          : buildPublishedPreview(
              page.publishedContent,
              page.publishedPhotos ?? [],
              readApiBaseUrl(),
              toLivePreviewPage(page),
            );

      setPreviewHtml(
        renderPreview(page, content, previewShowsThanks, giveEnabled === true),
      );
    }, PREVIEW_DELAY_MS);

    return () => clearTimeout(timer);
  }, [state.sections, page, previewSource, previewShowsThanks, giveEnabled]);

  const chooseType = async (pageType: PageType) => {
    if (landingPageId === null || addingStartersRef.current) return;

    const pageId = landingPageId;
    const isStale = () => activePageIdRef.current !== pageId;

    addingStartersRef.current = true;
    setIsAddingStarters(true);
    setPickerError(null);

    try {
      const result = await addStarterSections(api, pageId, pageType, errorText);

      if (isStale()) return;
      if (result.status === 'rolledBack') {
        setPickerError(result.message);

        return;
      }
      if (result.status === 'rollbackFailed') {
        setIsPickerBlocked(true);
        setNotice({ tone: 'error', lines: [result.message] });

        return;
      }

      const [reloadedPage, records] = await Promise.all([
        fetchPage(pageId),
        fetchSections(pageId),
      ]);

      if (isStale()) return;
      setPage(reloadedPage);
      dispatch({ type: 'loaded', records });
    } catch (error) {
      // The sections exist, so a second pick would add them twice.
      if (!isStale()) {
        setIsPickerBlocked(true);
        setNotice({
          tone: 'error',
          lines: [
            `The starter sections were added, but the page could not be reloaded. ${errorText(error)}`,
          ],
        });
      }
    } finally {
      if (!isStale()) {
        addingStartersRef.current = false;
        setIsAddingStarters(false);
      }
    }
  };

  const startPublish = async () => {
    setNotice(null);
    if (
      hasUnsavedChanges(stateRef.current) &&
      !(await save({ isAutosave: false, beforePublish: true }))
    ) {
      return;
    }
    setIsConfirmingPublish(true);
  };

  const confirmPublish = async () => {
    if (landingPageId === null || publishingRef.current) return;

    const block = saveBlock({
      isSaving: saving,
      isUploading: uploadCount > 0,
      beforePublish: true,
    });

    if (block.message !== null) {
      setNotice({ tone: 'error', lines: [block.message] });
      setIsConfirmingPublish(false);

      return;
    }

    const pageId = landingPageId;

    publishingRef.current = true;
    setPublishing(true);

    // Edits made while the question was open must reach the draft the route reads.
    if (
      hasUnsavedChanges(stateRef.current) &&
      !(await save({ isAutosave: false, beforePublish: true }))
    ) {
      publishingRef.current = false;
      if (activePageIdRef.current === pageId) {
        setPublishing(false);
        setIsConfirmingPublish(false);
      }

      return;
    }

    try {
      await api.post<PublishReply>(
        `/s${PUBLISH_LANDING_PAGE_ROUTE_PATH.replace(':id', encodeURIComponent(pageId))}`,
        {},
      );

      if (activePageIdRef.current !== pageId) return;
      const reloaded = await fetchPage(pageId).catch(() => null);

      if (activePageIdRef.current !== pageId) return;
      if (reloaded !== null) setPage(reloaded);
      setNotice({ tone: 'success', lines: ['Published.'] });
    } catch (error) {
      if (activePageIdRef.current !== pageId) return;
      setNotice({
        tone: 'error',
        lines: [`The page was not published. ${errorText(error)}`],
      });
    } finally {
      publishingRef.current = false;
      if (activePageIdRef.current === pageId) {
        setPublishing(false);
        setIsConfirmingPublish(false);
      }
    }
  };

  const fixSlug = async (suggestion: string) => {
    if (landingPageId === null || isFixingSlug) return;

    const pageId = landingPageId;

    setIsFixingSlug(true);
    setNotice(null);

    try {
      await api.patch(`/rest/landingPages/${encodeURIComponent(pageId)}`, {
        slug: suggestion,
      });

      if (activePageIdRef.current !== pageId) return;
      const reloaded = await fetchPage(pageId).catch(() => null);

      if (activePageIdRef.current !== pageId) return;
      if (reloaded !== null) setPage(reloaded);
      setNotice({ tone: 'success', lines: [`The slug is now ${suggestion}.`] });
    } catch (error) {
      if (activePageIdRef.current !== pageId) return;
      const text = errorText(error);

      setNotice({
        tone: 'error',
        lines: [
          /duplicate/i.test(text)
            ? `Another page already uses ${suggestion}. Type a different slug on the page record.`
            : `The slug was not changed. ${text}`,
        ],
      });
    } finally {
      if (activePageIdRef.current === pageId) setIsFixingSlug(false);
    }
  };

  const copyPublicLink = async (publicUrl: string) => {
    try {
      await copyToClipboard(publicUrl);
      setNotice({ tone: 'success', lines: ['Link copied.'] });
    } catch {
      setNotice({
        tone: 'error',
        lines: ['The link could not be copied. Select it and copy it by hand.'],
      });
    }
  };

  if (loading) {
    return <div style={STYLE.root}>Loading…</div>;
  }

  if (landingPageId === null) {
    return <div style={STYLE.root}>Open one landing page to build it.</div>;
  }

  const isDirty = hasUnsavedChanges(state);
  const isUploading = uploadCount > 0;
  const canSave = isDirty && !saving && !isUploading;
  const selected = state.sections.find(
    (section) => section.id === state.selectedId,
  );
  const published = parsePublishedContent(page?.publishedContent ?? null);
  const baseUrl = readVariable('LANDING_PAGE_BASE_URL').replace(/\/+$/, '');
  const rawSlug = page?.slug ?? '';
  const slug = rawSlug.trim();
  const isSlugValid = slug === '' || isValidSlug(rawSlug);
  const publicUrl =
    baseUrl !== '' && slug !== '' && isSlugValid ? `${baseUrl}/${slug}` : null;
  const canPublish =
    page !== null &&
    !saving &&
    !isUploading &&
    !publishing &&
    !isFixingSlug &&
    isSlugValid &&
    problemCount === 0;
  const showsTypePicker =
    page !== null &&
    !isPickerBlocked &&
    shouldShowTypePicker({
      pageType: toPageType(page.pageType),
      sectionCount: state.sections.length,
      isLoading: loading,
    });
  const stripeWarning = giveWarning(giveEnabled);
  const draftHasThanks = state.sections.some(
    (section) => section.sectionType === 'THANKS',
  );
  const publishBlockedReason =
    problemCount > 0
      ? 'Fix the problems listed below first.'
      : !isSlugValid
        ? 'Fix the slug first.'
        : isUploading
          ? 'Wait for the photo upload to finish.'
          : saving
            ? 'Wait for the save to finish.'
            : null;

  return (
    <div style={{ ...STYLE.root, display: 'grid', gap: CARD_GAP }}>
      <div style={{ ...STYLE.card, ...STYLE.cardHead, marginBottom: 0 }}>
        <div>
          <h1 style={STYLE.cardTitle}>{page?.name || 'Landing page'}</h1>
          <div style={STYLE.hint}>
            Status: {STATUS_LABELS[page?.status ?? ''] ?? 'Not set'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            role="status"
            style={{ color: isDirty ? WARNING : SUCCESS, fontWeight: 600 }}
          >
            {saving
              ? 'Saving…'
              : isUploading
                ? 'Uploading photo…'
                : isDirty
                  ? 'Unsaved changes'
                  : 'Saved'}
          </span>
          <button
            type="button"
            onClick={() => void save({ isAutosave: false })}
            disabled={!canSave}
            style={{ ...STYLE.primaryButton, opacity: canSave ? 1 : 0.55 }}
          >
            Save
          </button>
        </div>
      </div>

      {showsTypePicker && (
        <PageTypePicker
          isWorking={isAddingStarters}
          error={pickerError}
          onChoose={(pageType) => void chooseType(pageType)}
        />
      )}

      {page !== null && !showsTypePicker && (
        <PublishBar
          hasUnpublishedChanges={draftDiffersFromPublished(
            toDraftRecords(state.sections),
            published,
            toDraftPageFields(page),
          )}
          publishedByName={publisherName(page)}
          publishedAt={page.publishedAt ?? null}
          isLive={page.status === 'LIVE'}
          publicUrl={publicUrl}
          publicUrlProblem={
            slug === ''
              ? 'This page needs a slug before it has a public link.'
              : !isSlugValid
                ? 'This slug does not work in a web address.'
                : 'The public web address is not set up. Ask an admin to set LANDING_PAGE_BASE_URL.'
          }
          isConfirming={isConfirmingPublish}
          isPublishing={publishing || saving}
          isUploading={isUploading}
          canPublish={canPublish}
          blockedReason={publishing ? null : publishBlockedReason}
          onPublish={() => void startPublish()}
          onConfirm={() => void confirmPublish()}
          onCancel={() => setIsConfirmingPublish(false)}
          onCopyLink={() =>
            publicUrl !== null && void copyPublicLink(publicUrl)
          }
          invalidSlug={isSlugValid ? null : rawSlug}
          slugSuggestion={isSlugValid ? '' : toSlug(rawSlug)}
          isFixingSlug={isFixingSlug}
          onFixSlug={(suggestion) => void fixSlug(suggestion)}
        />
      )}

      {stripeWarning !== null && (
        <div
          role="status"
          style={{ ...STYLE.alert, marginBottom: 0, color: WARNING }}
        >
          {stripeWarning}
        </div>
      )}

      {problemCount > 0 && (
        <div
          role="alert"
          style={{
            ...STYLE.alert,
            marginBottom: 0,
            display: 'grid',
            gap: 4,
            color: DANGER,
          }}
        >
          <div>
            Fix these to save and publish. Autosave waits until they are fixed.
          </div>
          {sectionProblems.map((problem) => (
            <button
              key={`${problem.sectionId}-${problem.message}`}
              type="button"
              onClick={() =>
                dispatch({ type: 'select', id: problem.sectionId })
              }
              style={{
                ...STYLE.iconButton,
                color: DANGER,
                textAlign: 'left',
                textDecoration: 'underline',
              }}
            >
              {problem.message}
            </button>
          ))}
        </div>
      )}

      {isDirty && !saving && (
        <div style={{ ...STYLE.alert, marginBottom: 0 }}>
          You have unsaved changes. Save before you leave this page, or they
          will be lost.
        </div>
      )}

      {notice && (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          style={{
            ...STYLE.alert,
            marginBottom: 0,
            display: 'grid',
            gap: 4,
            color: notice.tone === 'error' ? DANGER : SUCCESS,
          }}
        >
          {notice.lines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      )}

      {!showsTypePicker && (
        <fieldset
          disabled={isEditingLocked({ saveMode, isPublishing: publishing })}
          style={{
            border: 'none',
            margin: 0,
            padding: 0,
            minWidth: 0,
            display: 'flex',
            gap: CARD_GAP,
            flexWrap: 'wrap',
            alignItems: 'flex-start',
          }}
        >
          <div style={{ ...STYLE.card, flex: '1 1 260px', maxWidth: 340 }}>
            <SectionList
              sections={state.sections}
              selectedId={state.selectedId}
              canAdd={(sectionType) => canAddType(state, sectionType)}
              onSelect={(id) => dispatch({ type: 'select', id })}
              onToggleVisible={(id) => edit({ type: 'toggleVisible', id })}
              onMove={(id, toIndex) => edit({ type: 'move', id, toIndex })}
              onDuplicate={(id) =>
                edit({ type: 'duplicate', id, newId: temporaryId() })
              }
              onRemove={(id) => edit({ type: 'remove', id })}
              onAdd={(sectionType) =>
                edit({ type: 'add', id: temporaryId(), sectionType })
              }
            />
          </div>

          <div style={{ ...STYLE.card, flex: '2 1 360px' }}>
            {selected ? (
              <SectionEditor
                key={selected.id}
                section={selected}
                photoFieldMetadataId={photoFieldMetadataId}
                onChange={(patch) =>
                  edit({ type: 'edit', id: selected.id, patch })
                }
                onUploadingChange={(isStarting) =>
                  setUploadCount((count) =>
                    Math.max(0, count + (isStarting ? 1 : -1)),
                  )
                }
              />
            ) : (
              <div style={STYLE.note}>
                Choose a section on the left to edit it.
              </div>
            )}
          </div>

          <div
            aria-label="Preview"
            style={{ ...STYLE.card, flex: '0 1 423px', minWidth: 0 }}
          >
            <PreviewPane
              html={previewHtml}
              source={previewSource}
              width={previewWidth}
              emptyMessage={
                previewSource === 'published' && published === null
                  ? 'This page has not been published yet.'
                  : null
              }
              onSourceChange={setPreviewSource}
              onWidthChange={setPreviewWidth}
            />
            {draftHasThanks && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 12,
                }}
              >
                <input
                  type="checkbox"
                  role="switch"
                  checked={previewShowsThanks}
                  onChange={(event) =>
                    setPreviewShowsThanks(event.currentTarget.checked)
                  }
                />
                <span style={{ fontWeight: 600 }}>Show thank-you screen</span>
              </label>
            )}
          </div>
        </fieldset>
      )}
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: LANDING_PAGE_BUILDER_FRONT_COMPONENT_ID,
  name: 'landing-page-builder',
  description:
    'Edits the draft sections of a Landing Page: add, reorder, hide, duplicate, delete, and change their text, photos, buttons, and items.',
  component: LandingPageBuilder,
});
