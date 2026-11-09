import { defineLogicFunction, HTTPMethod } from 'twenty-sdk/define';
import { Response, type RoutePayload } from 'twenty-sdk/logic-function';

import {
  PUBLISH_LANDING_PAGE_LOGIC_FUNCTION_ID,
  PUBLISH_LANDING_PAGE_ROUTE_PATH,
} from 'src/constants/marketing-identifiers';
import {
  publishLandingPage,
  type PublishResult,
} from 'src/logic-functions/landing-page-publish.server';
import { metadataGql } from 'src/logic-functions/workspace-gql';
import { isUuid } from 'src/shared/marketing/results';

const refuse = (status: number, message: string): PublishResult => ({
  status,
  body: { ok: false, message },
});

// The member comes from the caller's own token, never from the request body (X6).
const findCallerWorkspaceMemberId = async (
  userWorkspaceId: string,
): Promise<string | null> => {
  const data = await metadataGql(
    `query { currentUser { currentUserWorkspace { id } workspaceMember { id } } }`,
  );
  const currentUser = data.currentUser;
  const memberId = currentUser?.workspaceMember?.id;

  if (currentUser?.currentUserWorkspace?.id !== userWorkspaceId) return null;

  return typeof memberId === 'string' && memberId !== '' ? memberId : null;
};

const publishForCaller = async (
  event: RoutePayload,
): Promise<PublishResult> => {
  const userWorkspaceId = event.userWorkspaceId ?? null;

  // API keys and agents reach auth routes without a user; only a signed-in person may publish (X6).
  if (userWorkspaceId === null) {
    return refuse(403, 'A signed-in person must publish');
  }

  const landingPageId = (event.pathParameters?.id ?? '').trim();

  if (!isUuid(landingPageId)) return refuse(400, 'Landing page id must be a UUID');

  const publishedById = await findCallerWorkspaceMemberId(userWorkspaceId);

  if (publishedById === null) {
    return refuse(403, 'Your workspace member was not found');
  }

  return publishLandingPage({ landingPageId, publishedById });
};

const handler = async (event: RoutePayload) => {
  const result = await publishForCaller(event);

  return new Response(result.body, {
    status: result.status,
    headers: { 'cache-control': 'no-store' },
  });
};

export default defineLogicFunction({
  universalIdentifier: PUBLISH_LANDING_PAGE_LOGIC_FUNCTION_ID,
  name: 'publish-landing-page',
  description:
    'Copies the visible draft sections and their photos of a Landing Page into its published copy. Called only by the page builder.',
  timeoutSeconds: 120,
  handler,
  httpRouteTriggerSettings: {
    path: PUBLISH_LANDING_PAGE_ROUTE_PATH,
    httpMethod: HTTPMethod.POST,
    isAuthRequired: true,
  },
});
