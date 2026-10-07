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
    'core',
  ]),
  equipment: new Set(['barbell', 'bench', 'rack', 'dumbbells', 'cable', 'machine', 'bodyweight']),
  muscles: new Set([
    'chest',
    'triceps',
    'shoulders',
    'back',
    'biceps',
    'quads',
    'glutes',
    'core',
    'hamstrings',
  ]),
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
  for (const key of ['pattern', 'image', 'level', 'kind']) {
    if (!isText(exercise[key])) errors.push(`${at} needs ${key}.`);
  }
  if (isText(exercise.pattern) && !taxonomy.pattern.has(exercise.pattern))
    errors.push(`${at} uses an unknown movement pattern: ${exercise.pattern}.`);
  if (isText(exercise.image) && !/^[a-z0-9-]+$/.test(exercise.image))
    errors.push(`${at} has an unsafe image style key.`);
  if (isText(exercise.level) && !['beginner', 'intermediate', 'advanced'].includes(exercise.level))
    errors.push(`${at} uses an unknown level: ${exercise.level}.`);
  for (const key of ['equipment', 'muscles']) {
    if (!Array.isArray(exercise[key]) || !exercise[key].length || !exercise[key].every(isText)) {
      errors.push(`${at} needs a non-empty ${key} list.`);
    } else
      for (const id of exercise[key]) {
        if (!taxonomy[key].has(id)) errors.push(`${at} uses an unknown ${key} tag: ${id}.`);
      }
  }
  if (!isLocalizedList(exercise.how))
    errors.push(`${at} needs at least one instruction in en and es.`);
  if (!isLocalizedList(exercise.cues))
    errors.push(`${at} needs at least one caution in en and es.`);
});
if (errors.length)
  throw new Error(`Exercise data validation failed:\n${errors.map((e) => `- ${e}`).join('\n')}`);
console.log(`Validated ${entries.length} bilingual exercise entries.`);
