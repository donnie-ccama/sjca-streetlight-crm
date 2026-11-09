import { kv } from 'twenty-sdk/logic-function';

import { LANDING_PAGE_ROUTE_BASE_PATH } from 'src/constants/marketing-identifiers';
import {
  createSignupToken,
  findInviteByCode,
} from 'src/logic-functions/landing-page-invite.server';
import { notifyGivingQuestion } from 'src/logic-functions/giving-question.server';
import { gql, gqlEnum, rawQuery } from 'src/logic-functions/workspace-gql';
import {
  parseAttribution,
  type Attribution,
} from 'src/shared/marketing/attribution';
import { GIVING_QUESTION_MESSAGE_MAX_LENGTH } from 'src/shared/marketing/giving-question';
import {
  parseFormInput,
  type FormInput,
} from 'src/shared/marketing/form-input';
import {
  isStripeConfigured,
  stripeRequest,
  StripeRequestError,
} from 'src/logic-functions/stripe-client';
import { renderNotFoundPage } from 'src/shared/marketing/landing-page-html';
import {
  renderSectionPage,
  toPageType,
  type SectionPageView,
} from 'src/shared/marketing/landing-page-sections-html';
import {
  buildPhones,
  decidePersonUpsert,
  type PersonMatch,
} from 'src/shared/marketing/person-upsert';
import {
  BEACON_RATE_LIMIT_PER_HOUR,
  hashIp,
  isHoneypotFilled,
  isOverRateLimit,
  RATE_LIMIT_PER_HOUR,
  verifyTurnstileToken,
} from 'src/shared/marketing/spam-guard';
import {
  isHttpsUrl,
  parseGiveAmounts,
  parsePublishedContent,
} from 'src/shared/marketing/sections';
import {
  buildCheckoutSessionParams,
  parseCheckoutInput,
} from 'src/shared/marketing/stripe-checkout';
import type {
  Network,
  PageType,
  ResponseType,
} from 'src/shared/marketing/types';

export type LandingPageRecord = {
  id: string;
  slug: string;
  headline: string;
  pageType: PageType | null;
  bodyMarkdown: string;
  heroImageUrl: string | null;
  giveLabel: string;
  prayLabel: string;
  volunteerLabel: string;
  giveAmounts: string | null;
  prayerListId: string | null;
  publishedContent: unknown;
  publishedPhotos: { fileId: string; url: string }[];
  shareDescription: string;
  shareImageUrl: string | null;
};

export type ResponseCreateInput = {
  name: string;
  responseType: ResponseType;
  personId: string | null;
  landingPageId: string | null;
  socialPostId: string | null;
  donationId?: string;
  network: Network;
  isNewPerson: boolean;
  gaveEmail: boolean;
  gavePhone: boolean;
  gaveSmsConsent: boolean;
  utmRaw: Record<string, string>;
  visitorKey: string | null;
  ipHash: string | null;
  inviteId?: string | null;
};

export type RouteResult = {
  status: number;
  body: { ok: boolean; message: string; inviteToken?: string; code?: string };
};

export type PageRouteResult = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

export type RequestHeaders = Record<string, string | undefined>;

const MAX_SLUG_LENGTH = 100;
const MAX_VISITOR_KEY_LENGTH = 64;
const DEFAULT_ORGANIZATION_NAME = 'Our organization';

export const MESSAGES = {
  thanks: 'Thank you. We received your request.',
  givingQuestionThanks: 'Thank you. We will contact you soon.',
  invalid: 'Please check the form and try again.',
  verification: 'We could not verify your request. Please try again.',
  rateLimited: 'Too many requests. Please try again later.',
  notFound: 'This page is not available.',
  unavailable: 'This form is not available right now.',
  failure: 'Something went wrong. Please try again.',
};

export const HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
};

export const result = (
  status: number,
  ok: boolean,
  message: string,
): RouteResult => ({
  status,
  body: { ok, message },
});

export const readEnv = (name: string): string =>
  (process.env[name] ?? '').trim();

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stringEntries = (value: unknown): Record<string, string> => {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
};

export const firstNode = (data: Record<string, any>, rootName: string) =>
  data[rootName]?.edges?.[0]?.node ?? null;

// Header values arrive only for names listed in forwardedRequestHeaders.
export const readClientIp = (headers: RequestHeaders): string | null => {
  const cloudflareIp = headers['cf-connecting-ip']?.trim();

  if (cloudflareIp) return cloudflareIp;

  const forwardedIp = headers['x-forwarded-for']?.split(',')[0]?.trim();

  return forwardedIp ? forwardedIp : null;
};

const readVisitorKey = (value: unknown): string => {
  const visitorKey = typeof value === 'string' ? value.trim() : '';

  return visitorKey.length > MAX_VISITOR_KEY_LENGTH ? '' : visitorKey;
};

const readMessage = (body: unknown): string =>
  isRecord(body) && typeof body.message === 'string' ? body.message.trim() : '';

const readInviteCode = (body: unknown): string | undefined =>
  isRecord(body) && typeof body.inviteCode === 'string'
    ? body.inviteCode
    : undefined;

const isValidSlug = (slug: string): boolean =>
  slug !== '' && slug.length <= MAX_SLUG_LENGTH;

// kv has no atomic increment, so concurrent requests can undercount slightly.
const RATE_LIMITS = {
  form: RATE_LIMIT_PER_HOUR,
  beacon: BEACON_RATE_LIMIT_PER_HOUR,
  checkout: RATE_LIMIT_PER_HOUR,
  makeMonthly: RATE_LIMIT_PER_HOUR,
};

export const isRateLimited = async (
  kind: keyof typeof RATE_LIMITS,
  ipHash: string | null,
): Promise<boolean> => {
  if (ipHash === null) return false;

  const hourBucket = new Date().toISOString().slice(0, 13);
  const key = `lp-rate:${kind}:${ipHash}:${hourBucket}`;

  try {
    const recentCount = (await kv.get<number>(key)) ?? 0;

    if (isOverRateLimit({ recentCount, limitPerHour: RATE_LIMITS[kind] })) {
      return true;
    }

    await kv.set(key, recentCount + 1);
  } catch (error) {
    console.error('Landing page rate limit store failed', error);
  }

  return false;
};

// File URLs are signed and expire, so only https urls are kept.
const readFileUrls = (value: unknown): { fileId: string; url: string }[] =>
  Array.isArray(value)
    ? value.filter(
        (file): file is { fileId: string; url: string } =>
          isRecord(file) &&
          typeof file.fileId === 'string' &&
          typeof file.url === 'string' &&
          isHttpsUrl(file.url),
      )
    : [];

const readHttpsEnv = (name: string): string | null => {
  const value = readEnv(name);

  return isHttpsUrl(value) ? value : null;
};

export const loadLiveLandingPage = async (
  slug: string,
): Promise<LandingPageRecord | null> => {
  if (!isValidSlug(slug)) return null;

  const data = await rawQuery({
    landingPages: {
      __args: {
        filter: { slug: { eq: slug }, status: { eq: gqlEnum('LIVE') } },
        first: 1,
      },
      edges: {
        node: {
          id: true,
          slug: true,
          headline: true,
          pageType: true,
          body: { markdown: true },
          heroImage: { url: true },
          giveLabel: true,
          prayLabel: true,
          volunteerLabel: true,
          giveAmounts: true,
          prayerList: { id: true },
          publishedContent: true,
          publishedPhotos: { fileId: true, url: true },
          shareImage: { fileId: true, url: true },
          shareDescription: true,
        },
      },
    },
  });
  const node = firstNode(data, 'landingPages');

  if (node === null) return null;

  // heroImage.url is a file-scoped signed URL that expires; the page is never cached.
  const heroImageUrl = Array.isArray(node.heroImage)
    ? (node.heroImage[0]?.url ?? null)
    : null;

  return {
    id: node.id,
    slug: node.slug,
    headline: node.headline ?? '',
    pageType: toPageType(node.pageType),
    bodyMarkdown: node.body?.markdown ?? '',
    heroImageUrl,
    giveLabel: node.giveLabel ?? '',
    prayLabel: node.prayLabel ?? '',
    volunteerLabel: node.volunteerLabel ?? '',
    giveAmounts: node.giveAmounts ?? null,
    prayerListId: node.prayerList?.id ?? null,
    publishedContent: node.publishedContent ?? null,
    publishedPhotos: readFileUrls(node.publishedPhotos),
    shareDescription: node.shareDescription ?? '',
    shareImageUrl: readFileUrls(node.shareImage)[0]?.url ?? null,
  };
};

export const findSocialPostIdBySlug = async (
  slug: string | null,
): Promise<string | null> => {
  if (slug === null || !isValidSlug(slug)) return null;

  const data = await rawQuery({
    socialPosts: {
      __args: { filter: { slug: { eq: slug } }, first: 1 },
      edges: { node: { id: true } },
    },
  });

  return firstNode(data, 'socialPosts')?.id ?? null;
};

// Variables, not inline literals: utmRaw keys come from the visitor.
export const createResponse = async (
  data: ResponseCreateInput,
): Promise<string> => {
  const response = await gql(
    `mutation ($data: ResponseCreateInput!) {
      createResponse(data: $data) { id }
    }`,
    { data },
  );
  const id: string | undefined = response.createResponse?.id;

  if (!id) throw new Error('createResponse returned no id');

  return id;
};

export const recordVisitOnce = async (input: {
  landingPageId: string;
  socialPostId: string | null;
  visitorKey: string;
  attribution: Attribution;
  ipHash?: string | null;
  slug?: string;
  inviteId?: string | null;
}): Promise<void> => {
  const data = await rawQuery({
    responses: {
      __args: {
        filter: {
          responseType: { eq: gqlEnum('VISIT') },
          visitorKey: { eq: input.visitorKey },
          landingPageId: { eq: input.landingPageId },
          socialPostId:
            input.socialPostId === null
              ? { is: gqlEnum('NULL') }
              : { eq: input.socialPostId },
        },
        first: 1,
      },
      edges: { node: { id: true } },
    },
  });

  if (firstNode(data, 'responses') !== null) return;

  await createResponse({
    name: `VISIT · ${input.slug ?? input.landingPageId}`,
    responseType: 'VISIT',
    personId: null,
    landingPageId: input.landingPageId,
    socialPostId: input.socialPostId,
    network: input.attribution.network,
    isNewPerson: false,
    gaveEmail: false,
    gavePhone: false,
    gaveSmsConsent: false,
    utmRaw: input.attribution.utmRaw,
    visitorKey: input.visitorKey,
    ipHash: input.ipHash ?? null,
    inviteId: input.inviteId ?? null,
  });
};

const PERSON_MATCH_SELECTION = {
  id: true,
  phones: { primaryPhoneNumber: true },
  smsConsent: true,
};

const toPersonMatch = (node: any): PersonMatch | null =>
  node === null
    ? null
    : {
        id: node.id,
        phone: node.phones?.primaryPhoneNumber ?? null,
        smsConsent: node.smsConsent === true,
      };

const findPersonByEmail = async (
  email: string,
): Promise<PersonMatch | null> => {
  const data = await rawQuery({
    people: {
      __args: { filter: { emails: { primaryEmail: { eq: email } } }, first: 1 },
      edges: { node: PERSON_MATCH_SELECTION },
    },
  });

  return toPersonMatch(firstNode(data, 'people'));
};

const findPersonByPhone = async (
  phone: string | null,
): Promise<PersonMatch | null> => {
  if (phone === null) return null;

  const { primaryPhoneNumber } = buildPhones(phone);

  if (primaryPhoneNumber === '') return null;

  const data = await rawQuery({
    people: {
      __args: {
        filter: { phones: { primaryPhoneNumber: { eq: primaryPhoneNumber } } },
        first: 1,
      },
      edges: { node: PERSON_MATCH_SELECTION },
    },
  });

  return toPersonMatch(firstNode(data, 'people'));
};

export const upsertPerson = async (input: {
  form: FormInput;
  attribution: Attribution;
  landingPageSlug: string;
  matchByPhone?: boolean;
}): Promise<{
  personId: string;
  isNewPerson: boolean;
  smsConsentGranted: boolean;
}> => {
  const byEmail = await findPersonByEmail(input.form.email);
  const byPhone =
    byEmail === null && input.matchByPhone !== false
      ? await findPersonByPhone(input.form.phone)
      : null;
  const decision = decidePersonUpsert({
    form: input.form,
    byEmail,
    byPhone,
    attribution: input.attribution,
    landingPageSlug: input.landingPageSlug,
    now: new Date().toISOString(),
  });
  const smsConsentGranted =
    decision.kind !== 'none' && decision.data.smsConsent === true;

  if (decision.kind === 'create') {
    const data = await gql(
      `mutation ($data: PersonCreateInput!) {
        createPerson(data: $data) { id }
      }`,
      { data: decision.data },
    );
    const personId: string | undefined = data.createPerson?.id;

    if (!personId) throw new Error('createPerson returned no id');

    return { personId, isNewPerson: true, smsConsentGranted };
  }

  if (decision.kind === 'update') {
    await gql(
      `mutation ($id: UUID!, $data: PersonUpdateInput!) {
        updatePerson(id: $id, data: $data) { id }
      }`,
      { id: decision.id, data: decision.data },
    );
  }

  return { personId: decision.id, isNewPerson: false, smsConsentGranted };
};

const addToListOnce = async (listId: string, personId: string) => {
  const data = await rawQuery({
    messageListMembers: {
      __args: {
        filter: { listId: { eq: listId }, personId: { eq: personId } },
        first: 1,
      },
      edges: { node: { id: true } },
    },
  });

  if (firstNode(data, 'messageListMembers') !== null) return;

  await gql(
    `mutation ($data: MessageListMemberCreateInput!) {
      createMessageListMember(data: $data) { id }
    }`,
    { data: { listId, personId } },
  );
};

const buildAttribution = (
  body: unknown,
  query: Record<string, string | undefined> = {},
): Attribution => parseAttribution({ ...query, ...stringEntries(body) });

export const handleFormSubmission = async (input: {
  type: 'PRAY' | 'VOLUNTEER' | 'GIVING_QUESTION';
  slug: string;
  body: unknown;
  headers: RequestHeaders;
  query: Record<string, string | undefined>;
}): Promise<RouteResult> => {
  const isGivingQuestion = input.type === 'GIVING_QUESTION';

  // The route does not exist until staff set an address to receive questions.
  if (isGivingQuestion && readEnv('GIVING_CONTACT_EMAIL') === '') {
    return result(404, false, MESSAGES.notFound);
  }

  const secretKey = readEnv('TURNSTILE_SECRET_KEY');

  if (secretKey === '') {
    console.error('Landing page form called without TURNSTILE_SECRET_KEY');

    return result(503, false, MESSAGES.unavailable);
  }

  const parsed = parseFormInput(input.body);

  if (!parsed.ok) return result(400, false, parsed.error);

  const form = parsed.value;
  const message = isGivingQuestion ? readMessage(input.body) : '';
  const thanks = isGivingQuestion
    ? MESSAGES.givingQuestionThanks
    : MESSAGES.thanks;

  // Bots get the same answer as people, so the trap gives no signal.
  if (isHoneypotFilled(form)) return result(200, true, thanks);

  if (
    isGivingQuestion &&
    (message === '' || message.length > GIVING_QUESTION_MESSAGE_MAX_LENGTH)
  ) {
    return result(400, false, MESSAGES.invalid);
  }

  const ip = readClientIp(input.headers);
  const ipHash = ip === null ? null : hashIp(ip, secretKey);

  if (await isRateLimited('form', ipHash)) {
    return result(429, false, MESSAGES.rateLimited);
  }

  const isHuman = await verifyTurnstileToken({
    turnstileToken: form.turnstileToken,
    secretKey,
    remoteIp: ip,
  });

  if (!isHuman) return result(400, false, MESSAGES.verification);

  try {
    const page = await loadLiveLandingPage(input.slug);

    if (page === null) return result(404, false, MESSAGES.notFound);

    const attribution = buildAttribution(input.body, input.query);
    const socialPostId = await findSocialPostIdBySlug(
      attribution.socialPostSlug,
    );
    const { personId, isNewPerson, smsConsentGranted } = await upsertPerson({
      form,
      attribution,
      landingPageSlug: page.slug,
    });

    if (input.type === 'PRAY' && page.prayerListId !== null) {
      await addToListOnce(page.prayerListId, personId);
    }

    const inviteId = await findInviteIdForPage(
      readInviteCode(input.body),
      page.id,
    );

    const responseId = await createResponse({
      name: `${input.type} · ${page.slug}`,
      responseType: input.type,
      personId,
      landingPageId: page.id,
      socialPostId,
      network: attribution.network,
      isNewPerson,
      gaveEmail: form.email !== '',
      gavePhone: form.phone !== null,
      gaveSmsConsent: smsConsentGranted,
      utmRaw: attribution.utmRaw,
      visitorKey: form.visitorKey === '' ? null : form.visitorKey,
      ipHash,
      inviteId,
    });

    if (isGivingQuestion) {
      await notifyGivingQuestion({
        responseId,
        personId,
        pageName: page.headline === '' ? page.slug : page.headline,
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone ?? '',
        message,
      });

      return result(200, true, thanks);
    }

    if (input.type !== 'PRAY') return result(200, true, thanks);

    // The signup is saved. A store failure only costs the sender link on invites.
    // The error is not logged because it can carry the kv key, which holds the token.
    const inviteToken = await createSignupToken({
      personId,
      landingPageId: page.id,
      now: new Date(),
    }).catch(() => {
      console.error('Landing page signup token store failed');

      return undefined;
    });

    return {
      status: 200,
      body: {
        ok: true,
        message: MESSAGES.thanks,
        ...(inviteToken === undefined ? {} : { inviteToken }),
      },
    };
  } catch (error) {
    console.error(`Landing page ${input.type} submission failed`, error);

    return result(500, false, MESSAGES.failure);
  }
};

// Beacons (sendBeacon) ignore the answer, so Turnstile is not possible here.
export const handleBeacon = async (input: {
  type: 'VISIT' | 'GIVE_CLICK';
  slug: string;
  body: unknown;
  headers: RequestHeaders;
}): Promise<RouteResult> => {
  const secretKey = readEnv('TURNSTILE_SECRET_KEY');

  if (secretKey === '') {
    return result(503, false, MESSAGES.unavailable);
  }

  const visitorKey = readVisitorKey(
    isRecord(input.body) ? input.body.visitorKey : undefined,
  );

  if (input.type === 'VISIT' && visitorKey === '') {
    return result(200, true, 'OK');
  }

  const ip = readClientIp(input.headers);
  const ipHash = ip === null ? null : hashIp(ip, secretKey);

  if (await isRateLimited('beacon', ipHash)) {
    return result(429, false, MESSAGES.rateLimited);
  }

  try {
    const page = await loadLiveLandingPage(input.slug);

    if (page === null) return result(404, false, MESSAGES.notFound);

    const attribution = buildAttribution(input.body);
    const socialPostId = await findSocialPostIdBySlug(
      attribution.socialPostSlug,
    );
    const inviteId = await findInviteIdForPage(
      readInviteCode(input.body),
      page.id,
    );

    if (input.type === 'VISIT') {
      await recordVisitOnce({
        landingPageId: page.id,
        socialPostId,
        visitorKey,
        attribution,
        ipHash,
        slug: page.slug,
        inviteId,
      });
    } else {
      await createResponse({
        name: `GIVE_CLICK · ${page.slug}`,
        responseType: 'GIVE_CLICK',
        personId: null,
        landingPageId: page.id,
        socialPostId,
        network: attribution.network,
        isNewPerson: false,
        gaveEmail: false,
        gavePhone: false,
        gaveSmsConsent: false,
        utmRaw: attribution.utmRaw,
        visitorKey: visitorKey === '' ? null : visitorKey,
        ipHash,
        inviteId,
      });
    }

    return result(200, true, 'OK');
  } catch (error) {
    console.error(`Landing page ${input.type} beacon failed`, error);

    return result(500, false, MESSAGES.failure);
  }
};

// A failed lookup must not break the page, and the log leaves the code out.
const findInviteForPage = async (
  code: string | undefined,
  landingPageId: string,
): ReturnType<typeof findInviteByCode> => {
  try {
    return await findInviteByCode(code, landingPageId);
  } catch {
    console.error('Landing page invite lookup failed');

    return null;
  }
};

const findInviteIdForPage = async (
  code: string | undefined,
  landingPageId: string,
): Promise<string | null> =>
  (await findInviteForPage(code, landingPageId))?.id ?? null;

export const readOrganizationName = (): string =>
  readEnv('LANDING_PAGE_ORGANIZATION_NAME') || DEFAULT_ORGANIZATION_NAME;

export const buildLandingPageView = async (
  page: LandingPageRecord,
  query: Record<string, string | undefined>,
): Promise<SectionPageView> => {
  const invite = await findInviteForPage(query.i, page.id);
  const published = parsePublishedContent(page.publishedContent);
  const photoUrls: Record<string, string> = Object.fromEntries(
    page.publishedPhotos.map((photo) => [photo.fileId, photo.url]),
  );
  const publishedShareImageId = published?.page.shareImage?.fileId;

  return {
    slug: page.slug,
    // Live fields serve only the fallback when nothing valid is published.
    title: published ? published.page.title : page.headline,
    shareDescription: published
      ? published.page.shareDescription
      : page.shareDescription,
    shareImageUrl: published
      ? (publishedShareImageId && photoUrls[publishedShareImageId]) || null
      : page.shareImageUrl,
    organizationName: readOrganizationName(),
    tagline: readEnv('LANDING_PAGE_TAGLINE'),
    logoUrl: readHttpsEnv('LANDING_PAGE_LOGO_URL'),
    siteUrl: readHttpsEnv('LANDING_PAGE_SITE_URL'),
    mailingAddress: readEnv('LANDING_PAGE_MAILING_ADDRESS'),
    pageType: page.pageType,
    giveEnabled: isStripeConfigured(),
    giveAmounts: parseGiveAmounts(page.giveAmounts),
    givingQuestionEnabled: readEnv('GIVING_CONTACT_EMAIL') !== '',
    turnstileSiteKey: readEnv('TURNSTILE_SITE_KEY'),
    attribution: parseAttribution(query),
    routeBasePath: LANDING_PAGE_ROUTE_BASE_PATH,
    sections: published?.sections ?? [],
    photoUrls,
    invite,
    inviteCode: invite === null ? null : (query.i ?? null),
  };
};

export const renderLandingPageRoute = async (input: {
  slug: string;
  query: Record<string, string | undefined>;
}): Promise<PageRouteResult> => {
  const organizationName = readOrganizationName();

  try {
    const page = await loadLiveLandingPage(input.slug);

    if (page === null) {
      return {
        status: 404,
        headers: HTML_HEADERS,
        body: renderNotFoundPage(organizationName),
      };
    }

    return {
      status: 200,
      headers: HTML_HEADERS,
      body: renderSectionPage(await buildLandingPageView(page, input.query)),
    };
  } catch (error) {
    console.error('Landing page render failed', error);

    return {
      status: 500,
      headers: HTML_HEADERS,
      body: renderNotFoundPage(organizationName),
    };
  }
};

// No Turnstile here: Stripe Checkout runs its own fraud checks on the card.
export const handleCheckout = async (input: {
  slug: string;
  body: unknown;
  headers: RequestHeaders;
}): Promise<RouteResult | { status: number; body: { url: string } }> => {
  const baseUrl = readEnv('LANDING_PAGE_BASE_URL');
  const ipSalt = readEnv('TURNSTILE_SECRET_KEY');

  if (!isStripeConfigured() || baseUrl === '' || ipSalt === '') {
    return result(503, false, MESSAGES.unavailable);
  }

  try {
    const page = await loadLiveLandingPage(input.slug);

    if (page === null) return result(404, false, MESSAGES.notFound);

    const ip = readClientIp(input.headers);
    const ipHash = ip === null ? null : hashIp(ip, ipSalt);

    if (await isRateLimited('checkout', ipHash)) {
      return result(429, false, MESSAGES.rateLimited);
    }

    const parsed = parseCheckoutInput(input.body);

    if (!parsed.ok) return result(400, false, MESSAGES.invalid);

    const session = await stripeRequest<{ url?: unknown }>({
      method: 'POST',
      path: '/v1/checkout/sessions',
      params: buildCheckoutSessionParams({
        slug: page.slug,
        baseUrl,
        organizationName: readEnv('LANDING_PAGE_ORGANIZATION_NAME'),
        ...parsed.value,
      }),
    });

    if (typeof session.url !== 'string' || session.url === '') {
      console.error('Landing page checkout returned no url');

      return result(502, false, MESSAGES.failure);
    }

    return { status: 200, body: { url: session.url } };
  } catch (error) {
    if (error instanceof StripeRequestError) {
      console.error(
        `Landing page checkout Stripe error ${error.code ?? error.status}`,
      );
    } else {
      console.error('Landing page checkout failed');
    }

    return result(502, false, MESSAGES.failure);
  }
};
