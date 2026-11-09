import { webcrypto } from 'node:crypto';

import { kv } from 'twenty-sdk/logic-function';

import {
  firstNode,
  isRateLimited,
  isRecord,
  loadLiveLandingPage,
  MESSAGES,
  readClientIp,
  readEnv,
  result,
  type RequestHeaders,
  type RouteResult,
} from 'src/logic-functions/landing-page.server';
import { gql, rawQuery } from 'src/logic-functions/workspace-gql';
import {
  generateRandomCode,
  INVITE_CODE_PATTERN,
  parseInviteInput,
} from 'src/shared/marketing/invite-input';
import { hashIp, verifyTurnstileToken } from 'src/shared/marketing/spam-guard';

type LandingPageInvite = {
  id: string;
  senderFirstName: string;
  friendFirstName: string;
};

type SignupTokenRecord = {
  personId: string;
  landingPageId: string;
  expiresAt: string;
};

const INVITE_CODE_LENGTH = 10;
const SIGNUP_TOKEN_LENGTH = 32;
const SIGNUP_TOKEN_LIFETIME_MS = 30 * 60 * 1000;
const MAX_DUPLICATE_CODE_RETRIES = 3;
// workspace-gql keeps only the GraphQL message, so this server text is the only unique-violation signal.
const DUPLICATE_ENTRY_MESSAGE = 'A duplicate entry was detected';
const REDACTED = '[redacted]';

const randomBytes = (size: number): Uint8Array =>
  webcrypto.getRandomValues(new Uint8Array(size));

const newInviteCode = (): string =>
  generateRandomCode(INVITE_CODE_LENGTH, randomBytes);

const signupTokenKey = (token: string): string => `lp-invite-token:${token}`;

const isDuplicateEntryError = (error: unknown): boolean =>
  error instanceof Error && error.message.includes(DUPLICATE_ENTRY_MESSAGE);

// GraphQL errors can echo input values, so visitor text is cut out before logging.
const redactErrorMessage = (error: unknown, secrets: string[]): string => {
  const message = error instanceof Error ? error.message : 'unknown error';

  return secrets
    .filter((secret) => secret !== '')
    .reduce(
      (redacted, secret) => redacted.split(secret).join(REDACTED),
      message,
    );
};

const isSignupTokenRecord = (value: unknown): value is SignupTokenRecord =>
  isRecord(value) &&
  typeof value.personId === 'string' &&
  typeof value.landingPageId === 'string' &&
  typeof value.expiresAt === 'string';

export const createSignupToken = async (input: {
  personId: string;
  landingPageId: string;
  now: Date;
}): Promise<string> => {
  const signupToken = generateRandomCode(SIGNUP_TOKEN_LENGTH, randomBytes);
  const record: SignupTokenRecord = {
    personId: input.personId,
    landingPageId: input.landingPageId,
    expiresAt: new Date(
      input.now.getTime() + SIGNUP_TOKEN_LIFETIME_MS,
    ).toISOString(),
  };

  await kv.set(signupTokenKey(signupToken), record);

  return signupToken;
};

// kv has no atomic take, so two requests at the same moment can both use one token.
const consumeSignupToken = async (input: {
  signupToken: string;
  landingPageId: string;
  now: Date;
}): Promise<string | null> => {
  if (input.signupToken === '') return null;

  const key = signupTokenKey(input.signupToken);

  try {
    const stored = await kv.get<unknown>(key);

    if (
      !isSignupTokenRecord(stored) ||
      stored.landingPageId !== input.landingPageId ||
      !(Date.parse(stored.expiresAt) > input.now.getTime())
    ) {
      return null;
    }

    await kv.delete(key);

    return stored.personId;
  } catch {
    // The error is not logged because it can carry the kv key, which holds the token.
    console.error('Landing page signup token read failed');

    return null;
  }
};

export const findInviteByCode = async (
  code: string | undefined,
  landingPageId: string,
): Promise<LandingPageInvite | null> => {
  if (code === undefined || !INVITE_CODE_PATTERN.test(code)) return null;

  const data = await rawQuery({
    landingPageInvites: {
      __args: {
        filter: { code: { eq: code }, landingPageId: { eq: landingPageId } },
        first: 1,
      },
      edges: {
        node: { id: true, senderFirstName: true, friendFirstName: true },
      },
    },
  });
  const node = firstNode(data, 'landingPageInvites');

  if (node === null) return null;

  return {
    id: node.id,
    senderFirstName: node.senderFirstName ?? '',
    friendFirstName: node.friendFirstName ?? '',
  };
};

export const findInviteIdByCode = async (
  code: string | undefined,
  landingPageId: string,
): Promise<string | null> =>
  (await findInviteByCode(code, landingPageId))?.id ?? null;

const createInviteWithFreshCode = async (
  data: Record<string, unknown>,
): Promise<string> => {
  for (let retry = 0; ; retry += 1) {
    const code = newInviteCode();

    try {
      const response = await gql(
        `mutation ($data: LandingPageInviteCreateInput!) {
          createLandingPageInvite(data: $data) { id }
        }`,
        { data: { ...data, code } },
      );

      if (!response.createLandingPageInvite?.id) {
        throw new Error('createLandingPageInvite returned no id');
      }

      return code;
    } catch (error) {
      if (
        !isDuplicateEntryError(error) ||
        retry >= MAX_DUPLICATE_CODE_RETRIES
      ) {
        throw new Error(redactErrorMessage(error, [code]));
      }
    }
  }
};

export const handleInviteSubmission = async (input: {
  slug: string;
  body: unknown;
  headers: RequestHeaders;
}): Promise<RouteResult> => {
  const secretKey = readEnv('TURNSTILE_SECRET_KEY');

  if (secretKey === '') {
    console.error('Landing page invite called without TURNSTILE_SECRET_KEY');

    return result(503, false, MESSAGES.unavailable);
  }

  const parsed = parseInviteInput(input.body);

  if (!parsed.ok) return result(400, false, parsed.error);

  const invite = parsed.value;

  // Bots get the same answer as people, so the trap gives no signal.
  if (invite.website !== '') {
    return {
      status: 200,
      body: { ok: true, message: 'OK', code: newInviteCode() },
    };
  }

  const ip = readClientIp(input.headers);
  const ipHash = ip === null ? null : hashIp(ip, secretKey);

  if (await isRateLimited('form', ipHash)) {
    return result(429, false, MESSAGES.rateLimited);
  }

  const isHuman = await verifyTurnstileToken({
    turnstileToken: invite.turnstileToken,
    secretKey,
    remoteIp: ip,
  });

  if (!isHuman) return result(400, false, MESSAGES.verification);

  try {
    const page = await loadLiveLandingPage(input.slug);

    if (page === null) return result(404, false, MESSAGES.notFound);

    const senderId = await consumeSignupToken({
      signupToken: invite.inviteToken,
      landingPageId: page.id,
      now: new Date(),
    });
    const code = await createInviteWithFreshCode({
      name: `${invite.senderFirstName} invited ${invite.friendFirstName}`,
      landingPageId: page.id,
      senderFirstName: invite.senderFirstName,
      friendFirstName: invite.friendFirstName,
      senderId,
      visitorKey: invite.visitorKey === '' ? null : invite.visitorKey,
      ipHash,
    });

    return { status: 200, body: { ok: true, message: 'OK', code } };
  } catch (error) {
    console.error(
      'Landing page invite submission failed',
      redactErrorMessage(error, [
        invite.senderFirstName,
        invite.friendFirstName,
        invite.inviteToken,
        invite.visitorKey,
        ip ?? '',
      ]),
    );

    return result(500, false, MESSAGES.failure);
  }
};
