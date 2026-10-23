import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const packageDirectory = join(
  __dirname,
  '../../../../../streetlight-crm-logo-package',
);
const publicBrandDirectory = join(__dirname, '../../../public/images/brand');

const fileHash = (filePath: string) =>
  createHash('sha256').update(readFileSync(filePath)).digest('hex');

const exactAssetPairs = [
  ['svg/streetlight-crm-logo.svg', 'streetlight-crm-logo.svg'],
  ['svg/streetlight-crm-logo-white.svg', 'streetlight-crm-logo-white.svg'],
  ['svg/streetlight-crm-app-icon.svg', 'streetlight-crm-app-icon.svg'],
  ['favicon/favicon.ico', 'favicon.ico'],
  ['favicon/favicon.svg', 'favicon.svg'],
  ['favicon/apple-touch-icon.png', 'apple-touch-icon.png'],
  ['favicon/icon-192.png', 'icon-192.png'],
  ['favicon/icon-512.png', 'icon-512.png'],
  ['png/streetlight-crm-link-preview.png', 'streetlight-crm-link-preview.png'],
] as const;

describe('Streetlight CRM brand assets', () => {
  it.each(exactAssetPairs)(
    'keeps %s byte-identical to the design package',
    (packagePath, publicPath) => {
      expect(fileHash(join(publicBrandDirectory, publicPath))).toBe(
        fileHash(join(packageDirectory, packagePath)),
      );
    },
  );

  it('uses the package manifest identity and safe icon purpose', () => {
    const packageManifest = JSON.parse(
      readFileSync(join(packageDirectory, 'favicon/site.webmanifest'), 'utf8'),
    );
    const manifest = JSON.parse(
      readFileSync(join(__dirname, '../../../public/manifest.json'), 'utf8'),
    );

    expect(manifest).toMatchObject({
      name: packageManifest.name,
      short_name: packageManifest.short_name,
      theme_color: packageManifest.theme_color,
    });
    expect(manifest.icons).toEqual([
      expect.objectContaining({ sizes: '192x192', purpose: 'any' }),
      expect.objectContaining({ sizes: '512x512', purpose: 'any' }),
    ]);
  });
});
