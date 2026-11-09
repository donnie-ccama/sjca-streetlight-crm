import { buildStarterSections } from 'src/shared/marketing/starter-sections';
import type { PageType } from 'src/shared/marketing/types';

export type StarterSectionsApi = {
  patch: (path: string, body?: unknown) => Promise<unknown>;
  post: <TResponse>(path: string, body?: unknown) => Promise<TResponse>;
  delete: (path: string, options?: { query?: Record<string, boolean> }) => Promise<unknown>;
};

export type AddStarterSectionsResult =
  | { status: 'added' }
  | { status: 'rolledBack'; message: string }
  | { status: 'rollbackFailed'; message: string };

export const STARTER_ROLLBACK_FAILED_MESSAGE =
  'Some starter sections may remain. Reload the page to check.';

const SECTIONS_PATH = '/rest/landingPageSections';

const pagePath = (landingPageId: string) =>
  `/rest/landingPages/${encodeURIComponent(landingPageId)}`;

// A failure removes what this run made, so the page goes back to the picker and a retry starts clean.
export const addStarterSections = async (
  api: StarterSectionsApi,
  landingPageId: string,
  pageType: PageType,
  describeError: (error: unknown) => string,
): Promise<AddStarterSectionsResult> => {
  const createdIds: string[] = [];
  // A create with no returned id may still exist, and it cannot be deleted.
  let hasUnknownSection = false;

  try {
    await api.patch(pagePath(landingPageId), { pageType });

    for (const starter of buildStarterSections(landingPageId, pageType)) {
      const response = await api.post<{
        data?: { createLandingPageSection?: { id?: string } };
      }>(SECTIONS_PATH, starter);
      const id = response?.data?.createLandingPageSection?.id;

      if (typeof id !== 'string' || id === '') {
        hasUnknownSection = true;
        throw new Error('The server did not return the new section.');
      }
      createdIds.push(id);
    }

    return { status: 'added' };
  } catch (error) {
    const message = `The starter sections could not be added. ${describeError(error)}`;

    try {
      for (const id of createdIds) {
        await api.delete(`${SECTIONS_PATH}/${encodeURIComponent(id)}`, {
          query: { soft_delete: true },
        });
      }
      await api.patch(pagePath(landingPageId), { pageType: null });
    } catch {
      return { status: 'rollbackFailed', message: `${message} ${STARTER_ROLLBACK_FAILED_MESSAGE}` };
    }

    return hasUnknownSection
      ? { status: 'rollbackFailed', message: `${message} ${STARTER_ROLLBACK_FAILED_MESSAGE}` }
      : { status: 'rolledBack', message };
  }
};
