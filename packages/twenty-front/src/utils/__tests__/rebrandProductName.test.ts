import { rebrandProductName } from '~/utils/rebrandProductName';

describe('rebrandProductName', () => {
  it('replaces every user-facing upstream product reference', () => {
    expect(rebrandProductName('Twenty works with Twenty fields')).toBe(
      'Streetlight CRM works with Streetlight CRM fields',
    );
  });

  it('leaves unrelated translated text unchanged', () => {
    expect(rebrandProductName('Welcome to your workspace')).toBe(
      'Welcome to your workspace',
    );
  });
});
