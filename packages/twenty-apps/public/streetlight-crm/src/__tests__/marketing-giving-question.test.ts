import { describe, expect, it } from 'vitest';

import { buildGivingQuestionEmail } from 'src/shared/marketing/giving-question';

const INPUT = {
  pageName: 'Spring appeal',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.org',
  phone: '555-000-1111',
  message: 'I want to give a large gift.\nWho can I talk to?',
};

describe('buildGivingQuestionEmail', () => {
  it('names the sender in the subject', () => {
    expect(buildGivingQuestionEmail(INPUT).subject).toBe(
      'Giving question from Ada Lovelace',
    );
  });

  it('strips CR and LF from the subject', () => {
    const { subject } = buildGivingQuestionEmail({
      ...INPUT,
      firstName: 'Ada\r\nBcc: x@example.org',
      lastName: 'Love\nlace',
    });

    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject.startsWith('Giving question from Ada')).toBe(true);
  });

  it('puts the page, name, email, phone, and message in the text', () => {
    const { text } = buildGivingQuestionEmail(INPUT);

    expect(text).toContain('Page: Spring appeal');
    expect(text).toContain('Name: Ada Lovelace');
    expect(text).toContain('Email: ada@example.org');
    expect(text).toContain('Phone: 555-000-1111');
    expect(text).toContain('I want to give a large gift.\nWho can I talk to?');
  });

  it('does not escape the plain text', () => {
    const { text } = buildGivingQuestionEmail({
      ...INPUT,
      message: 'Tom & Jerry <3',
    });

    expect(text).toContain('Tom & Jerry <3');
  });

  it('marks a missing phone', () => {
    expect(buildGivingQuestionEmail({ ...INPUT, phone: '' }).text).toContain(
      'Phone: Not given',
    );
  });
});
