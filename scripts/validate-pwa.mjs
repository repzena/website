import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = path.join(root, 'manifest.webmanifest');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

for (const key of ['name', 'short_name', 'start_url', 'scope', 'display', 'icons']) {
  if (!(key in manifest)) throw new Error(`PWA manifest is missing ${key}`);
}
if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) {
  throw new Error('PWA manifest must provide at least two app icons');
}
for (const icon of manifest.icons) {
  const iconPath = path.resolve(root, icon.src);
  const relativeIconPath = path.relative(root, iconPath);
  if (relativeIconPath.startsWith('..') || path.isAbsolute(relativeIconPath)) {
    throw new Error('PWA icon path escapes the site');
  }
  const file = await stat(iconPath);
  if (!file.isFile() || icon.type !== 'image/png') {
    throw new Error(`Invalid PWA icon: ${icon.src}`);
  }
}
console.log(`Validated PWA manifest and ${manifest.icons.length} icons.`);
