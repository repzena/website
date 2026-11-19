import Ajv from 'ajv';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJson = async (relativePath) =>
  JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
const ajv = new Ajv({ schemaId: 'auto' });
const catalogueSchema = await readJson('schemas/exercise-catalog.v1.schema.json');
const analyticsSchema = await readJson('schemas/analytics-config.v1.schema.json');
const routineSchema = await readJson('schemas/routine-v2.schema.json');
const legacyRoutineSchema = await readJson('schemas/routine-legacy.v1.schema.json');
const validators = {
  catalogue: ajv.compile(catalogueSchema),
  analytics: ajv.compile(analyticsSchema),
  routine: ajv.compile(routineSchema),
  legacy: ajv.compile(legacyRoutineSchema),
};

const examples = {
  catalogue: await readJson('data/exercises.json'),
  analytics: await readJson('data/analytics-config.json'),
  routine: {
    format: 'gym-exercise-routine',
    version: 2,
    routine: {
      name: { en: 'Schema example' },
      default_name: false,
      days: [
        {
          name: { en: 'Session 1' },
          default_name: true,
          sections: [
            {
              type: 'main-work',
              name: null,
              exercises: [
                {
                  name: { en: 'Squat', es: 'Sentadilla' },
                  exercise_id: 'squat',
                  sets: 3,
                  reps_or_time: { en: '8–12' },
                  section: { type: 'main-work', name: '' },
                },
              ],
            },
          ],
          unsectioned_exercises: [],
          exercises: [],
        },
      ],
    },
  },
  legacy: {
    format: 'gym-exercise-routine',
    version: 1,
    routine: { days: [{ name: 'Day 1', exercises: [{ name: 'Squat', sets: 3 }] }] },
  },
};

for (const [kind, example] of Object.entries(examples)) {
  if (!validators[kind](example)) {
    throw new Error(
      `${kind} valid example failed schema validation: ${ajv.errorsText(validators[kind].errors)}`,
    );
  }
}

const invalidExamples = [
  ['catalogue', { ...examples.catalogue, version: 2 }],
  ['analytics', { ...examples.analytics, measurementId: '<script>' }],
  ['routine', { ...examples.routine, version: 1 }],
  ['legacy', { days: [{ exercises: 'not-an-array' }] }],
];
for (const [kind, example] of invalidExamples) {
  if (validators[kind](example))
    throw new Error(`${kind} invalid example unexpectedly passed schema validation`);
}
console.log('Validated versioned JSON schemas and valid/invalid examples.');
