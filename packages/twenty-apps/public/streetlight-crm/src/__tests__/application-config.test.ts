import {
  APP_DESCRIPTION,
  APP_DISPLAY_NAME,
  APPLICATION_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';
import applicationConfig from 'src/application-config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('application identifiers', () => {
  it('should expose the application metadata constants', () => {
    expect(APP_DISPLAY_NAME).toBeTruthy();
    expect(typeof APP_DESCRIPTION).toBe('string');
    expect(APPLICATION_UNIVERSAL_IDENTIFIER).toBeTruthy();
  });

  it('should bundle the Streetlight logo', () => {
    expect(applicationConfig.config.logo).toBe('public/logo.svg');

    const logoPath = fileURLToPath(
      new URL('../../public/logo.svg', import.meta.url),
    );
    const logo = readFileSync(logoPath, 'utf8');

    expect(logo).toContain('<svg');
    expect(logo).toContain('#1b2b4b');
    expect(logo).toContain('#ff4d47');
  });
});
