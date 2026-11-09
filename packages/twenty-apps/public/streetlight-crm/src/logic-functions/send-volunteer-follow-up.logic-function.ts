import { defineLogicFunction } from 'twenty-sdk/define';
import type {
  DatabaseEventPayload,
  ObjectRecordCreateEvent,
} from 'twenty-sdk/logic-function';

import { SEND_VOLUNTEER_FOLLOW_UP_LOGIC_FUNCTION_ID } from 'src/constants/marketing-identifiers';
import { rawQuery } from 'src/logic-functions/workspace-gql';
import { buildVolunteerEmail } from 'src/shared/marketing/volunteer-email';

type ResponseRecord = {
  id: string;
  responseType?: string;
  personId?: string;
  landingPageId?: string;
};

type ResponseCreatedEvent = DatabaseEventPayload<
  ObjectRecordCreateEvent<ResponseRecord>
>;

const RESEND_URL = 'https://api.resend.com/emails';

const skip = (responseId: string, reason: string) => {
  console.log(`volunteer follow-up skipped for ${responseId}: ${reason}`);

  return { skipped: true, reason };
};

const fetchPerson = async (personId: string) => {
  const data = await rawQuery({
    person: {
      __args: { filter: { id: { eq: personId } } },
      name: { firstName: true },
      emails: { primaryEmail: true },
      doNotEmail: true,
    },
  });

  return data.person as
    | {
        name?: { firstName?: string };
        emails?: { primaryEmail?: string };
        doNotEmail?: boolean;
      }
    | null
    | undefined;
};

const fetchFollowUpUrl = async (landingPageId: string): Promise<string> => {
  const data = await rawQuery({
    landingPage: {
      __args: { filter: { id: { eq: landingPageId } } },
      volunteerFollowUpUrl: { primaryLinkUrl: true },
    },
  });

  return data.landingPage?.volunteerFollowUpUrl?.primaryLinkUrl ?? '';
};

const isSuppressed = async (email: string): Promise<boolean> => {
  const data = await rawQuery({
    messageSuppressions: {
      __args: { filter: { emailAddress: { eq: email } }, first: 1 },
      edges: { node: { id: true } },
    },
  });

  return (data.messageSuppressions?.edges?.length ?? 0) > 0;
};

const fetchResponseLinks = async (responseId: string) => {
  const data = await rawQuery({
    response: {
      __args: { filter: { id: { eq: responseId } } },
      person: { id: true },
      landingPage: { id: true },
    },
  });

  return {
    personId: data.response?.person?.id as string | undefined,
    landingPageId: data.response?.landingPage?.id as string | undefined,
  };
};

const sendVolunteerFollowUpUnsafe = async (event: ResponseCreatedEvent) => {
  const response = event.properties.after;

  if (response.responseType !== 'VOLUNTEER') {
    return { skipped: true, reason: 'not a VOLUNTEER response' };
  }

  const apiKey = process.env.RESEND_API_KEY ?? '';
  const from = process.env.VOLUNTEER_EMAIL_FROM ?? '';

  if (apiKey === '' || from === '') {
    return skip(response.id, 'RESEND_API_KEY or VOLUNTEER_EMAIL_FROM is empty');
  }

  let { personId, landingPageId } = response;

  if (!personId || !landingPageId) {
    const links = await fetchResponseLinks(response.id);

    personId = personId || links.personId;
    landingPageId = landingPageId || links.landingPageId;
  }

  if (!personId || !landingPageId) {
    return skip(response.id, 'response has no person or landing page');
  }

  const followUpUrl = (await fetchFollowUpUrl(landingPageId)).trim();

  if (!followUpUrl.startsWith('https://')) {
    return skip(response.id, 'follow-up URL is empty or not https');
  }

  const person = await fetchPerson(personId);
  const email = person?.emails?.primaryEmail?.trim() ?? '';

  if (email === '') {
    return skip(response.id, 'person has no email');
  }

  if (person?.doNotEmail === true) {
    return skip(response.id, 'person is marked do not email');
  }

  // The server stores suppression addresses trimmed and lowercased.
  if (await isSuppressed(email.toLowerCase())) {
    return skip(response.id, 'email is suppressed');
  }

  const message = buildVolunteerEmail({
    firstName: person?.name?.firstName ?? '',
    followUpUrl,
    subject: process.env.VOLUNTEER_EMAIL_SUBJECT ?? '',
    bodyTemplate: process.env.VOLUNTEER_EMAIL_BODY ?? '',
    from,
    to: email,
  });

  const result = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `volunteer-follow-up-${response.id}`,
    },
    body: JSON.stringify(message),
  });

  if (!result.ok) {
    console.error(`volunteer follow-up send failed with status ${result.status}`);

    return { sent: false, status: result.status };
  }

  return { sent: true };
};

export const sendVolunteerFollowUp = async (event: ResponseCreatedEvent) => {
  try {
    return await sendVolunteerFollowUpUnsafe(event);
  } catch {
    console.error(
      `volunteer follow-up failed for ${event.properties.after.id}`,
    );

    return { sent: false, reason: 'error' };
  }
};

export default defineLogicFunction({
  universalIdentifier: SEND_VOLUNTEER_FOLLOW_UP_LOGIC_FUNCTION_ID,
  name: 'send-volunteer-follow-up',
  description:
    'Emails the volunteer one follow-up link through Resend when a VOLUNTEER Response is created.',
  timeoutSeconds: 30,
  handler: sendVolunteerFollowUp,
  databaseEventTriggerSettings: {
    eventName: 'response.created',
  },
});
