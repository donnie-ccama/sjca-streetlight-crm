import { describe, expect, it } from 'vitest';

import {
  addStarterSections,
  STARTER_ROLLBACK_FAILED_MESSAGE,
  type StarterSectionsApi,
} from 'src/front-components/landing-page-builder/add-starter-sections';
import { buildStarterSections } from 'src/shared/marketing/starter-sections';

type Call = { method: 'patch' | 'post' | 'delete'; path: string; body?: unknown };

const fakeApi = (options: { failPostAt?: number; failDelete?: boolean; failResetPatch?: boolean } = {}) => {
  const calls: Call[] = [];
  let postCount = 0;
  let patchCount = 0;
  const api: StarterSectionsApi = {
    patch: async (path, body) => {
      calls.push({ method: 'patch', path, body });
      patchCount += 1;
      if (options.failResetPatch === true && patchCount > 1) throw new Error('reset failed');

      return {};
    },
    post: async <TResponse,>(path: string, body?: unknown) => {
      calls.push({ method: 'post', path, body });
      postCount += 1;
      if (postCount === options.failPostAt) throw new Error('post failed');

      return { data: { createLandingPageSection: { id: `created-${postCount}` } } } as TResponse;
    },
    delete: async (path) => {
      calls.push({ method: 'delete', path });
      if (options.failDelete === true) throw new Error('delete failed');

      return {};
    },
  };

  return { api, calls };
};

const describeError = (error: unknown) => (error instanceof Error ? error.message : 'unknown');

describe('addStarterSections', () => {
  it('PATCHes the page type, then POSTs each starter in order', async () => {
    const { api, calls } = fakeApi();
    const result = await addStarterSections(api, 'page-1', 'TWO_STEP', describeError);

    expect(result).toEqual({ status: 'added' });
    expect(calls[0]).toEqual({
      method: 'patch',
      path: '/rest/landingPages/page-1',
      body: { pageType: 'TWO_STEP' },
    });
    expect(calls.slice(1).map((call) => call.method)).toEqual(
      buildStarterSections('page-1', 'TWO_STEP').map(() => 'post'),
    );
    expect(calls.slice(1).map((call) => call.body)).toEqual(
      buildStarterSections('page-1', 'TWO_STEP'),
    );
  });

  it('deletes the created sections and resets the page type when a POST fails', async () => {
    const { api, calls } = fakeApi({ failPostAt: 3 });
    const result = await addStarterSections(api, 'page-1', 'ONE_STEP', describeError);

    expect(result).toEqual({
      status: 'rolledBack',
      message: 'The starter sections could not be added. post failed',
    });
    expect(calls.slice(4)).toEqual([
      { method: 'delete', path: '/rest/landingPageSections/created-1' },
      { method: 'delete', path: '/rest/landingPageSections/created-2' },
      { method: 'patch', path: '/rest/landingPages/page-1', body: { pageType: null } },
    ]);
  });

  it('says sections may remain when a delete fails', async () => {
    const { api } = fakeApi({ failPostAt: 2, failDelete: true });

    expect(await addStarterSections(api, 'page-1', 'ONE_STEP', describeError)).toEqual({
      status: 'rollbackFailed',
      message: `The starter sections could not be added. post failed ${STARTER_ROLLBACK_FAILED_MESSAGE}`,
    });
  });

  it('says sections may remain when the page type reset fails', async () => {
    const { api } = fakeApi({ failPostAt: 1, failResetPatch: true });

    expect((await addStarterSections(api, 'page-1', 'ONE_STEP', describeError)).status).toBe(
      'rollbackFailed',
    );
  });
});
