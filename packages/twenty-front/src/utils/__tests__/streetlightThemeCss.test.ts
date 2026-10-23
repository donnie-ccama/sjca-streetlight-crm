import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const themeCss = readFileSync(join(__dirname, '../../index.css'), 'utf8');
const packageTokensCss = readFileSync(
  join(
    __dirname,
    '../../../../../streetlight-crm-logo-package/design/streetlight-crm-tokens.css',
  ),
  'utf8',
);

const getTokenValues = (tokenName: string) =>
  [
    ...packageTokensCss.matchAll(new RegExp(`${tokenName}:\\s*([^;]+);`, 'g')),
  ].map(([, value]) => value.trim());

const [lightRed, darkRed] = getTokenValues('--sl-red');
const [navy] = getTokenValues('--sl-navy');
const [, darkOnRed] = getTokenValues('--sl-on-red');

describe('Streetlight theme CSS', () => {
  it('applies the light palette to both root and scoped themes', () => {
    expect(themeCss).toMatch(
      new RegExp(
        `html\\.light,\\s*\\.light\\s*\\{[^}]*--sl-red:\\s*${lightRed};`,
        's',
      ),
    );
    expect(themeCss).toContain(`--sl-navy: ${navy};`);
  });

  it('applies the dark palette to both root and scoped themes', () => {
    expect(themeCss).toMatch(
      new RegExp(
        `html\\.dark,\\s*\\.dark\\s*\\{[^}]*--sl-red:\\s*${darkRed};`,
        's',
      ),
    );
    expect(themeCss).toContain(`--sl-on-red: ${darkOnRed};`);
    expect(themeCss).toMatch(
      /button\[class\]\[data-color='accent'\]\[data-variant='solid'\]\s*\{[^}]*--tw-button-background:\s*var\(--sl-red\);[^}]*--tw-button-color:\s*var\(--sl-on-red\);/s,
    );
  });

  it('keeps the navigation surface navy in both themes', () => {
    expect(themeCss).toMatch(
      /\.streetlight-navigation\s*\{[^}]*background:\s*var\(--sl-navy\);/s,
    );
    expect(themeCss).toContain('--t-background-transparent-primary:');
    expect(themeCss).toContain('--t-background-transparent-light:');
  });
});
