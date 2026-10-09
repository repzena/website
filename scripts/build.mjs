import { cp, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
await import('./validate-data.mjs');
const distDir = path.join(projectRoot, 'dist');
const stagingDir = path.join(projectRoot, '.dist-staging');
const backupDir = path.join(projectRoot, '.dist-previous');
const publicFiles = [
  'index.html',
  'styles.css',
  'app.js',
  'theme.js',
  'service-worker.js',
  'robots.txt',
  'sitemap.xml',
  'data',
];

await rm(stagingDir, { recursive: true, force: true });
await mkdir(stagingDir, { recursive: true });
try {
  for (const entry of publicFiles) {
    const source = path.join(projectRoot, entry);
    const info = await stat(source);
    if (entry === 'data' && !(await stat(path.join(source, 'exercises.json'))).isFile()) {
      throw new Error('Missing data/exercises.json');
    }
    if (!info.isFile() && !info.isDirectory()) throw new Error(`Invalid public entry: ${entry}`);
    await cp(source, path.join(stagingDir, entry), { recursive: true });
  }
  // Assets are optional until the project has real files there. Empty folders
  // are not preserved by Git, so the build must not depend on one existing.
  try {
    const assets = path.join(projectRoot, 'assets');
    if ((await stat(assets)).isDirectory()) {
      await cp(assets, path.join(stagingDir, 'assets'), { recursive: true });
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await writeFile(path.join(stagingDir, '.nojekyll'), '');

  let hadPreviousBuild = false;
  try {
    await stat(distDir);
    await rm(backupDir, { recursive: true, force: true });
    await rename(distDir, backupDir);
    hadPreviousBuild = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // A backup may be the only good build after an interrupted previous run.
    try {
      await stat(backupDir);
      hadPreviousBuild = true;
    } catch (backupError) {
      if (backupError.code !== 'ENOENT') throw backupError;
    }
  }
  try {
    await rename(stagingDir, distDir);
  } catch (error) {
    if (hadPreviousBuild) await rename(backupDir, distDir);
    throw error;
  }
  await rm(backupDir, { recursive: true, force: true });
} catch (error) {
  await rm(stagingDir, { recursive: true, force: true });
  throw error;
}
console.log(`Built static site in ${distDir}`);
