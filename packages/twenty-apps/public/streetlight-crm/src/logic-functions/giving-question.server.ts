import { createStaffTask } from 'src/logic-functions/staff-task.server';
import { buildGivingQuestionEmail } from 'src/shared/marketing/giving-question';

const RESEND_URL = 'https://api.resend.com/emails';

type GivingQuestionNotice = {
  responseId: string;
  personId: string;
  pageName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
};

const sendEmail = async (notice: GivingQuestionNotice): Promise<void> => {
  const apiKey = (process.env.RESEND_API_KEY ?? '').trim();
  const from = (process.env.VOLUNTEER_EMAIL_FROM ?? '').trim();
  const to = (process.env.GIVING_CONTACT_EMAIL ?? '').trim();

  if (apiKey === '' || from === '' || to === '') return;

  const { subject, text } = buildGivingQuestionEmail(notice);
  const result = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `giving-question-${notice.responseId}`,
    },
    body: JSON.stringify({
      from,
      to,
      reply_to: notice.email,
      subject,
      text,
    }),
  });

  if (!result.ok) {
    console.error(`giving question email failed with status ${result.status}`);
  }
};

// Each step logs a code only. Neither failure may stop the other step or the answer.
export const notifyGivingQuestion = async (
  notice: GivingQuestionNotice,
): Promise<void> => {
  try {
    await createStaffTask({
      personId: notice.personId,
      title: 'Giving question',
      body: `Page: ${notice.pageName}\n\n${notice.message}`,
    });
  } catch {
    console.error('giving question task failed');
  }

  try {
    await sendEmail(notice);
  } catch {
    console.error('giving question email failed');
  }
};
