import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const file = path.join(root, 'data', 'exercises.json');
const entries = JSON.parse(await readFile(file, 'utf8'));
const errors = [];
const locales = ['en', 'es'];
const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const isLocalizedText = (value) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  locales.every((locale) => isText(value[locale]));
const isLocalizedList = (value) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  locales.every(
    (locale) =>
      Array.isArray(value[locale]) && value[locale].length > 0 && value[locale].every(isText),
  );
const isLocalizedAliases = (value) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  locales.every((locale) => Array.isArray(value[locale]) && value[locale].every(isText));

if (!Array.isArray(entries) || entries.length === 0) {
  throw new Error('Exercise data must be a non-empty JSON array.');
}
const ids = new Set();
const taxonomy = {
  pattern: new Set([
    'horizontal-push',
    'horizontal-pull',
    'vertical-push',
    'vertical-pull',
    'squat',
    'hinge',
    'lunge',
    'hip-rotation',
    'spinal-flexion',
    'shoulder-flexion',
    'trunk-rotation',
    'ankle-circles',
    'isometric-stability',
    'lateral-stability',
    'knee-drive',
    'trunk-flexion',
    'anti-extension',
    'anti-rotation',
    'elbow-flexion',
    'elbow-extension',
    'knee-flexion',
    'knee-extension',
    'ankle-plantar-flexion',
    'shoulder-abduction',
    'horizontal-adduction',
  ]),
  equipment: new Set([
    'barbell',
    'ez-bar',
    'step',
    'bench',
    'rack',
    'dumbbells',
    'cable',
    'machine',
    'bodyweight',
    'band',
    'stick',
    'pull-up-bar',
    'ab-wheel',
  ]),
  muscles: new Set([
    'chest',
    'triceps',
    'shoulders',
    'back',
    'biceps',
    'quads',
    'glutes',
    'hamstrings',
    'calves',
    'hip-flexors',
    'obliques',
    'adductors',
  ]),
  focus: new Set(['strength', 'conditioning', 'mobility', 'core']),
};
entries.forEach((exercise, index) => {
  const at = `Exercise ${index + 1}`;
  if (!exercise || typeof exercise !== 'object' || Array.isArray(exercise)) {
    errors.push(`${at} must be an object.`);
    return;
  }
  if (!isText(exercise.id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(exercise.id)) {
    errors.push(`${at} needs a lowercase, hyphenated id.`);
  } else if (ids.has(exercise.id)) errors.push(`Duplicate exercise id: ${exercise.id}`);
  else ids.add(exercise.id);
  if (!isLocalizedText(exercise.name)) errors.push(`${at} needs en and es names.`);
  if (exercise.aliases !== undefined && !isLocalizedAliases(exercise.aliases))
    errors.push(`${at} aliases must have en and es lists of non-empty strings.`);
  for (const key of ['pattern', 'image', 'level']) {
    if (!isText(exercise[key])) errors.push(`${at} needs ${key}.`);
  }
  if (isText(exercise.pattern) && !taxonomy.pattern.has(exercise.pattern))
    errors.push(`${at} uses an unknown movement pattern: ${exercise.pattern}.`);
  if (isText(exercise.image) && !/^[a-z0-9-]+$/.test(exercise.image))
    errors.push(`${at} has an unsafe image style key.`);
  if (isText(exercise.level) && !['beginner', 'intermediate', 'advanced'].includes(exercise.level))
    errors.push(`${at} uses an unknown level: ${exercise.level}.`);
  if (exercise.images !== undefined) {
    if (!Array.isArray(exercise.images) || exercise.images.length === 0) {
      errors.push(`${at} images must be a non-empty list when provided.`);
    } else {
      for (const [imageIndex, image] of exercise.images.entries()) {
        const imageAt = `${at} image ${imageIndex + 1}`;
        const safeSource =
          typeof image?.src === 'string' &&
          /^\.\/assets\/[a-zA-Z0-9/_-]+\.(?:webp|png|jpe?g)$/i.test(image.src) &&
          !image.src.split('/').includes('..');
        if (!safeSource) errors.push(`${imageAt} needs a safe local WebP, PNG, or JPEG path.`);
        else {
          if (image.src.split('/')[2] !== exercise.id)
            errors.push(`${imageAt} must be stored in ./assets/${exercise.id}/.`);
          if (!existsSync(path.join(root, image.src.slice(2))))
            errors.push(`${imageAt} file does not exist: ${image.src}.`);
        }
        if (!isLocalizedText(image?.alt)) errors.push(`${imageAt} needs en and es alt text.`);
      }
    }
  }
  for (const key of ['equipment', 'primaryMuscles', 'secondaryMuscles', 'focus']) {
    const required = !['primaryMuscles', 'secondaryMuscles'].includes(key);
    if (
      !Array.isArray(exercise[key]) ||
      (required && !exercise[key].length) ||
      !exercise[key].every(isText)
    ) {
      errors.push(`${at} needs a valid ${key} list.`);
    } else
      for (const id of exercise[key]) {
        const category = key === 'primaryMuscles' || key === 'secondaryMuscles' ? 'muscles' : key;
        if (!taxonomy[category].has(id)) errors.push(`${at} uses an unknown ${key} tag: ${id}.`);
      }
  }
  if (Array.isArray(exercise.primaryMuscles) && Array.isArray(exercise.secondaryMuscles)) {
    const overlap = exercise.primaryMuscles.some((id) => exercise.secondaryMuscles.includes(id));
    if (overlap) errors.push(`${at} repeats a muscle as both primary and secondary.`);
  }
  if (!isLocalizedList(exercise.how))
    errors.push(`${at} needs at least one instruction in en and es.`);
  if (!isLocalizedList(exercise.cues))
    errors.push(`${at} needs at least one caution in en and es.`);
});
if (errors.length)
  throw new Error(`Exercise data validation failed:\n${errors.map((e) => `- ${e}`).join('\n')}`);
console.log(`Validated ${entries.length} bilingual exercise entries.`);
