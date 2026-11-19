import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const catalog = JSON.parse(
  await readFile(path.join(root, 'data', 'exercises.json'), 'utf8'),
).exercises;
const sourceUrls = [
  ...catalog.flatMap((exercise) =>
    Array.isArray(exercise.images) ? exercise.images.map((image) => image.src) : [],
  ),
  './assets/hero/hero.jpeg',
];
const urls = [...new Set(sourceUrls)].sort();
const assets = [];

for (const sourceUrl of urls) {
  const url = new URL(sourceUrl, 'https://repzena.invalid/');
  if (url.origin !== 'https://repzena.invalid' || !url.pathname.startsWith('/assets/')) {
    throw new Error(`Offline asset must be a local asset path: ${sourceUrl}`);
  }
  if (url.search || url.hash) {
    throw new Error(`Offline asset paths must not include a query or fragment: ${sourceUrl}`);
  }
  const filePath = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
  const relativePath = path.relative(root, filePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Offline asset path escapes the project: ${sourceUrl}`);
  }
  const bytes = await readFile(filePath);
  assets.push({
    url: `.${url.pathname}`,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}

const version = createHash('sha256').update(JSON.stringify(assets)).digest('hex');
const output = `${JSON.stringify({ version, assets }, null, 2)}\n`;
const manifestPath = path.join(root, 'data', 'offline-assets.json');
if (process.argv.includes('--check')) {
  const current = await readFile(manifestPath, 'utf8').catch(() => '');
  if (current !== output) {
    throw new Error('Offline asset manifest is out of date; run `task offline:manifest`.');
  }
  console.log(`Verified offline asset manifest for ${assets.length} files.`);
} else {
  const current = await readFile(manifestPath, 'utf8').catch(() => '');
  if (current !== output) await writeFile(manifestPath, output);
  console.log(`Generated offline asset manifest for ${assets.length} files.`);
}
