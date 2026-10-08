# Project guide for agents

## Product and architecture

- The product is named Repzena. Keep the brand spelling consistent in visible UI, metadata, and project documentation.
- This is a bilingual exercise guide and personal routine builder. Use British English (`en-GB`) and Argentinian Spanish (`es-AR`). Spanish should use natural voseo where direct address fits, with an informal but correct tone and no regional catchphrases.
- Keep the first version static: plain HTML, CSS, JavaScript modules, and JSON. Runtime code must not require a server, account, database, or network API.
- Keep exercise content and UI translations available in both locales. Add both languages together when adding or changing user-facing content. Preserve original Spanish names and prescriptions when they come from a user source file.
- Exercise IDs and taxonomy IDs are stable data keys. Translate labels for display; do not use translated labels as IDs.
- Search and filters run in the browser against the public exercise catalog.
- Routines are saved in the browser's local storage and support JSON import/export. There is no sync between devices or user profile in this version.
- Prefer small, direct changes that preserve the static architecture. Do not add frameworks, runtime dependencies, authentication, analytics, or a backend without a clear product request.

## Project structure

- `index.html` — page structure and primary inline illustration.
- `styles.css` — responsive layout, colors, and component styles.
- `app.js` — language strings, exercise rendering/search/filtering, detail views, and routine behavior. It keeps a validated catalogue copy in browser storage for offline fallback.
- `data/exercises.json` — public exercise catalog; each exercise has a stable ID, localized names, instructions and cues, tags, and illustration key.
- `service-worker.js` — caches the static page shell and catalogue for offline visits; keep its cache versioned when cache contents or behaviour change.
- `assets/` — local public assets, when needed. Use original or appropriately licensed files.
- `private-data/` — personal routines and other private local content. It is ignored by Git; do not publish or copy its contents into the public catalog or build.
- `scripts/build.mjs` — builds the deployable site by copying an explicit allowlist into `dist/`.
- `dist/` — generated deployment output. Do not edit by hand; recreate it with `task build`.
- `Taskfile.yml` — common local tasks.
- `.github/workflows/ci-deploy.yml` — source-repository CI plus publishing to the separately configured GitHub Pages repository.

## Content and UX practices

- Write exercise instructions as short, actionable steps. Keep cautions specific, practical, and proportionate; do not present the guide as medical advice.
- Preserve source names and prescriptions when importing a user's routine. Treat external video links as unverified until checked.
- Keep the phone-at-the-gym use case first: readable text, clear movement illustrations, obvious equipment and muscle tags, and controls with comfortable touch targets.
- Keep interactions keyboard-accessible. Use semantic HTML, visible focus states, useful labels, and text alternatives for meaningful images.
- Keep UI wording in the `UI` locale dictionaries in `app.js`; add British English and Argentinian Spanish for every new user-facing string. Use natural voseo (for example, “Buscá”, “Agregá”, “Guardá”) without clichés or forced slang.
- Exercise taxonomy labels live in the localized `names` maps in `app.js`. Add both locale labels for each new tag and keep catalog IDs consistent with those maps. Use British spelling and vocabulary in English, and common, clear gym terminology in Argentinian Spanish.
- Prefer original diagrams and locally stored assets. Do not copy another exercise site's illustrations or instructions.

## Privacy and publishing

- Never add personal routine data, workout history, credentials, or environment files to the public catalog or deployment output.
- Preserve the private-data ignore rules. The routine in `private-data/` should remain locally importable but must not appear in `dist/`.
- `scripts/build.mjs` should copy only public website files. Update its explicit allowlist if the public site gains a required asset; do not copy the whole repository.
- Use relative asset/data paths so the site works on GitHub Pages under a repository subpath.
- Deploy `dist/` as the GitHub Pages artifact. Do not commit generated output unless the user specifically changes the deployment approach.

## Common commands

- `task install` — install development tools.
- `task preview` — serve the source tree locally at `http://localhost:8000`; use `task preview PORT=9000` to choose another port.
- `task preview:dist` — build and serve the deployment output over HTTP.
- `task lint` — run ESLint, parse the exercise JSON, and check formatting.
- `task format` — format the source files.
- `task build` — create the static deployment folder in `dist/`.
- `npm run build` — run the same static build directly, including in CI.

After changing source, run `task lint`. Run `task build` when the change affects what is published. Do not claim a check passed unless it was run successfully.
