import { escapeHtml } from 'src/shared/marketing/landing-page-html';

const DEFAULT_SUBJECT = 'Thanks for volunteering';
const DEFAULT_BODY = 'Hi {{firstName}}, here is the next step: {{followUpUrl}}';

type VolunteerEmailInput = {
  firstName: string;
  followUpUrl: string;
  subject: string;
  bodyTemplate: string;
  from: string;
  to: string;
};

type VolunteerEmail = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

const fillTemplate = (
  template: string,
  firstName: string,
  followUpUrl: string,
): string =>
  template
    .split('{{firstName}}')
    .join(firstName)
    .split('{{followUpUrl}}')
    .join(followUpUrl);

export const buildVolunteerEmail = (
  input: VolunteerEmailInput,
): VolunteerEmail => {
  const subject = input.subject.trim() === '' ? DEFAULT_SUBJECT : input.subject;
  const template =
    input.bodyTemplate.trim() === '' ? DEFAULT_BODY : input.bodyTemplate;
  const escapedUrl = escapeHtml(input.followUpUrl);
  const linkHtml = `<a href="${escapedUrl}">${escapedUrl}</a>`;

  // Escape the template text first, then swap in the link markup so the
  // anchor is the only unescaped HTML.
  const html = escapeHtml(template)
    .split('{{firstName}}')
    .join(escapeHtml(input.firstName))
    .split('{{followUpUrl}}')
    .join(linkHtml)
    .replace(/\r?\n/g, '<br>');

  return {
    from: input.from,
    to: input.to,
    subject,
    html: `<p>${html}</p>`,
    text: fillTemplate(template, input.firstName, input.followUpUrl),
  };
};
