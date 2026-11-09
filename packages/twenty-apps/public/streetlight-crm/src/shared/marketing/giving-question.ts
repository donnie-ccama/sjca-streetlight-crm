export const GIVING_QUESTION_MESSAGE_MAX_LENGTH = 1000;

type GivingQuestionEmailInput = {
  pageName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
};

const NEWLINE_PATTERN = /[\r\n]+/g;

export const buildGivingQuestionEmail = (
  input: GivingQuestionEmailInput,
): { subject: string; text: string } => {
  const name = `${input.firstName} ${input.lastName}`.trim();
  // A newline in a header value could add headers, so the subject has none.
  const subject = `Giving question from ${name === '' ? input.email : name}`
    .replace(NEWLINE_PATTERN, ' ')
    .trim();

  return {
    subject,
    text: [
      `Page: ${input.pageName}`,
      `Name: ${name === '' ? 'Not given' : name}`,
      `Email: ${input.email}`,
      `Phone: ${input.phone === '' ? 'Not given' : input.phone}`,
      '',
      'Message:',
      input.message,
    ].join('\n'),
  };
};
