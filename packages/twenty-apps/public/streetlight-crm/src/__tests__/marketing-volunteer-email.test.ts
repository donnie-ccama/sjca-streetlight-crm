import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('src/logic-functions/workspace-gql', () => ({
  rawQuery: vi.fn(),
  gqlEnum: (value: string) => ({ __gqlEnum: value }),
}));

import { rawQuery } from 'src/logic-functions/workspace-gql';
import { sendVolunteerFollowUp } from 'src/logic-functions/send-volunteer-follow-up.logic-function';
import { buildVolunteerEmail } from 'src/shared/marketing/volunteer-email';

const baseInput = {
  firstName: 'Ada',
  followUpUrl: 'https://example.org/next?a=1&b=2',
  subject: 'Welcome',
  bodyTemplate: 'Hi {{firstName}}, go to {{followUpUrl}}',
  from: 'team@example.org',
  to: 'ada@example.org',
};

describe('buildVolunteerEmail', () => {
  it('replaces both placeholders', () => {
    const email = buildVolunteerEmail(baseInput);

    expect(email.text).toBe(
      'Hi Ada, go to https://example.org/next?a=1&b=2',
    );
    expect(email.from).toBe('team@example.org');
    expect(email.to).toBe('ada@example.org');
    expect(email.subject).toBe('Welcome');
  });

  it('escapes values in html and renders the link as an anchor', () => {
    const email = buildVolunteerEmail({ ...baseInput, firstName: '<b>Ada</b>' });

    expect(email.html).toContain('&lt;b&gt;Ada&lt;/b&gt;');
    expect(email.html).not.toContain('<b>Ada');
    expect(email.html).toContain(
      '<a href="https://example.org/next?a=1&amp;b=2">',
    );
    expect(email.text).toContain('<b>Ada</b>');
  });

  it('uses neutral defaults when subject or body are empty', () => {
    const email = buildVolunteerEmail({
      ...baseInput,
      subject: '',
      bodyTemplate: '  ',
    });

    expect(email.subject).toBe('Thanks for volunteering');
    expect(email.text).toBe(
      'Hi Ada, here is the next step: https://example.org/next?a=1&b=2',
    );
  });
});

describe('sendVolunteerFollowUp skip rules', () => {
  const queryMock = vi.mocked(rawQuery);
  const fetchMock = vi.fn();
  const suppressionFilters: unknown[] = [];
  const event = {
    properties: {
      after: {
        id: 'response-1',
        responseType: 'VOLUNTEER',
        personId: 'person-1',
        landingPageId: 'page-1',
      },
    },
  } as never;

  const person = {
    name: { firstName: 'Ada' },
    emails: { primaryEmail: 'ada@example.org' },
    doNotEmail: false,
  };

  const setData = (data: {
    person?: Record<string, unknown> | null;
    url?: string;
    suppressed?: boolean;
  }) => {
    queryMock.mockImplementation(async (selection) => {
      const root = Object.keys(selection)[0];

      if (root === 'person') return { person: data.person ?? null };
      if (root === 'landingPage') {
        return {
          landingPage: { volunteerFollowUpUrl: { primaryLinkUrl: data.url } },
        };
      }

      suppressionFilters.push(
        (selection.messageSuppressions as { __args: { filter: unknown } })
          .__args.filter,
      );

      return {
        messageSuppressions: {
          edges: data.suppressed ? [{ node: { id: 's1' } }] : [],
        },
      };
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    suppressionFilters.length = 0;
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.RESEND_API_KEY = 'key';
    process.env.VOLUNTEER_EMAIL_FROM = 'team@example.org';
    process.env.VOLUNTEER_EMAIL_SUBJECT = '';
    process.env.VOLUNTEER_EMAIL_BODY = '';
    setData({ person, url: 'https://example.org/next' });
  });

  it('sends with an idempotency key', async () => {
    await sendVolunteerFollowUp(event);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];

    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers['Idempotency-Key']).toBe('volunteer-follow-up-response-1');
    expect(init.headers.Authorization).toBe('Bearer key');
    expect(JSON.parse(init.body).to).toBe('ada@example.org');
  });

  it('skips when the response is not a volunteer', async () => {
    const other = {
      properties: { after: { id: 'r', responseType: 'PRAY' } },
    } as never;

    await sendVolunteerFollowUp(other);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips without an api key', async () => {
    process.env.RESEND_API_KEY = '';
    await sendVolunteerFollowUp(event);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips without a from address', async () => {
    process.env.VOLUNTEER_EMAIL_FROM = '';
    await sendVolunteerFollowUp(event);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips when the follow-up url is empty or not https', async () => {
    setData({ person, url: '' });
    await sendVolunteerFollowUp(event);
    setData({ person, url: 'http://example.org' });
    await sendVolunteerFollowUp(event);
    setData({ person, url: 'javascript:alert(1)' });
    await sendVolunteerFollowUp(event);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips when the person has doNotEmail', async () => {
    setData({ person: { ...person, doNotEmail: true }, url: 'https://x.org' });
    await sendVolunteerFollowUp(event);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips when the person has no email', async () => {
    setData({
      person: { ...person, emails: { primaryEmail: '' } },
      url: 'https://x.org',
    });
    await sendVolunteerFollowUp(event);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips when the email is suppressed', async () => {
    setData({ person, url: 'https://x.org', suppressed: true });
    await sendVolunteerFollowUp(event);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('logs status only and does not throw on a failed send', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422 });

    await expect(sendVolunteerFollowUp(event)).resolves.toBeDefined();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('422'),
    );
  });

  it('looks up suppressions with a lowercase address', async () => {
    setData({
      person: { ...person, emails: { primaryEmail: ' Ada@Example.ORG ' } },
      url: 'https://x.org',
    });
    await sendVolunteerFollowUp(event);

    expect(suppressionFilters).toEqual([
      { emailAddress: { eq: 'ada@example.org' } },
    ]);
  });

  it('re-fetches the response when ids are missing from the event', async () => {
    const bare = {
      properties: { after: { id: 'response-1', responseType: 'VOLUNTEER' } },
    } as never;
    const base = queryMock.getMockImplementation()!;

    queryMock.mockImplementation(async (selection) =>
      Object.keys(selection)[0] === 'response'
        ? { response: { person: { id: 'p' }, landingPage: { id: 'l' } } }
        : base(selection),
    );
    await sendVolunteerFollowUp(bare);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not throw when fetch rejects or a lookup fails', async () => {
    fetchMock.mockRejectedValue(new Error('boom ada@example.org'));
    await expect(sendVolunteerFollowUp(event)).resolves.toBeDefined();

    queryMock.mockRejectedValue(new Error('db down'));
    await expect(sendVolunteerFollowUp(event)).resolves.toBeDefined();
    expect(console.error).toHaveBeenCalledTimes(2);
    expect(vi.mocked(console.error).mock.calls.join(' ')).not.toContain('boom');
  });
});
