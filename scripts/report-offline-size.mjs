import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const catalogPath = path.join(root, 'data', 'exercises.json');
const serviceWorkerPath = path.join(root, 'service-worker.js');
const [catalogText, serviceWorker] = await Promise.all([
  readFile(catalogPath, 'utf8'),
  readFile(serviceWorkerPath, 'utf8'),
]);
const catalog = JSON.parse(catalogText).exercises;
const coreMatch = serviceWorker.match(/const CORE_FILES = \[([\s\S]*?)\];/);

if (!coreMatch) throw new Error('Could not find CORE_FILES in service-worker.js.');

const corePaths = [...coreMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
const imagePaths = [
  ...new Set(
    catalog.flatMap((exercise) =>
      Array.isArray(exercise.images) ? exercise.images.map((image) => image.src) : [],
    ),
  ),
];
const localPath = (urlPath) => path.join(root, urlPath === './' ? 'index.html' : urlPath.slice(2));
const sizeOf = async (filePath) => (await stat(filePath)).size;
const imageBytes = (
  await Promise.all(imagePaths.map((imagePath) => sizeOf(localPath(imagePath))))
).reduce((total, bytes) => total + bytes, 0);
const shellBytes = (
  await Promise.all(
    corePaths.map((urlPath) => {
      if (urlPath === './') return sizeOf(localPath('./'));
      return sizeOf(localPath(urlPath));
    }),
  )
).reduce((total, bytes) => total + bytes, 0);
const catalogBytes = Buffer.byteLength(catalogText);
const heroBytes = await sizeOf(path.join(root, 'assets', 'hero', 'hero.jpeg'));
const offlineDownloadBytes = imageBytes + heroBytes;
const mib = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;

console.log(`Exercise library: ${catalog.length} exercises`);
console.log(`Exercise images: ${imagePaths.length} files, ${mib(imageBytes)}`);
console.log(`Catalogue JSON: ${mib(catalogBytes)}`);
console.log(`App shell install precache: ${mib(shellBytes)}`);
console.log(
  `Optional offline download: ${mib(offlineDownloadBytes)} (${imagePaths.length} exercise images + home image)`,
);
console.log(`Full offline data including the catalog: ${mib(offlineDownloadBytes + catalogBytes)}`);
