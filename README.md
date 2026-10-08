# Repzena — exercise guide

A mobile-first, bilingual static exercise guide with local routine editing. The English locale is British English; the Spanish locale is Argentinian Spanish, with natural voseo and no regional clichés. It uses no backend or account service.

## Run locally

Use Node.js 24 LTS or later for the project tooling.

The exercise catalog is loaded as JSON, so serve this folder over HTTP instead of opening `index.html` directly. For example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Features in this starter

- British English and Argentinian Spanish interface and exercise instructions.
- Exercise search and filters for movement pattern, equipment, and muscles.
- Exercise detail cards with local schematic movement diagrams, how-to steps, and practical cautions. Current illustrations are generic and should be replaced with exercise-specific, reviewed diagrams before a public content launch.
- Multiple routines and sessions, reordering, and sets/reps/time fields.
- Routine persistence in browser `localStorage`, plus JSON import and export.
- Personal data folder excluded from Git by default.

## Content

Edit `data/exercises.json` to add or update public exercise entries. Each entry contains localized names, instructions and cues, plus normalized tag IDs. Artwork in the first version is original, schematic SVG-style art rendered locally in the page; replace or refine it as the reviewed illustration set is created.

The supplied personal routine file is in `private-data/rutina-julian-3-dias.json` and is intentionally ignored by Git. Import it using the **Import routine** control. Exercise instructions are not inferred from its video links; review those links before relying on them.

## Static hosting

The project is plain HTML, CSS, JavaScript modules, and JSON. It can be published as a static site. If using GitHub Pages with a repository subpath, keep asset and data URLs relative as they are now.

## Future direction

Keep exercise IDs and routine JSON provider-neutral. A later account/sync version will need a separate authentication and storage service; static hosting alone does not provide accounts or cloud sync.

## Common tasks

Install Task using the instructions at [taskfile.dev](https://taskfile.dev/), then install the project tools and run commands from this folder:

```bash
task install
task preview                 # serves on http://localhost:8000
task preview PORT=9000       # choose another port
task preview:dist            # build, then serve dist/ at localhost:8000
task lint                   # ESLint, JSON parse, and formatting checks
task format                 # apply Prettier formatting
```

The preview tasks use Python 3's built-in HTTP server. Use `task preview` for the source tree or `task preview:dist` to rebuild and preview the exact deployment output. Serve the site over HTTP rather than opening `index.html` directly: browser security blocks JavaScript modules and JSON fetches from `file://` URLs. Lint and formatting tools are development-only npm dependencies; they are not needed to publish or use the static site.

## GitHub Actions and a separate Pages repository

`.github/workflows/ci-deploy.yml` runs the lint/content checks and builds `dist/` for pull requests and pushes to `main`. It publishes only on pushes to `main` or a manual run started from `main`. Publishing copies the build to the root of a separate Pages repository and commits it to that repository's configured branch.

The workflow publishes to [`repzena/repzena.github.io`](https://github.com/repzena/repzena.github.io). Create a GitHub App, install it on the `repzena` organisation with access to only `repzena.github.io`, and grant it **Contents: read and write** repository permission. In the **source** repository (`repzena/website`), configure:

- Optional Actions variable `PAGES_BRANCH` if the Pages repository publishes from a branch other than `main`.
- Actions secret `APP_ID`: the GitHub App's App ID.
- Actions secret `APP_PRIVATE_KEY`: a private key generated for that GitHub App. The workflow mints a short-lived installation token scoped to `repzena/repzena.github.io`; the source repository's default `GITHUB_TOKEN` cannot write to a different repository.

In `repzena/repzena.github.io`, select **Settings → Pages → Deploy from a branch**, then choose the configured branch and `/ (root)` folder. The workflow preserves a root `CNAME` file if you configure a custom domain. The deployment repository is treated as generated output: files other than `.git` and `CNAME` are replaced by the built site on each deployment.

The workflow uses the current major releases of the official checkout, Node setup, artifact, and GitHub App token actions. Keep those action versions reviewed and updated as GitHub releases new majors.

## Build for GitHub Pages

Build the publishable static site into `dist/`:

```bash
task build
```

The build validates the bilingual exercise data, assembles the site in a staging folder, then swaps it into `dist/`; it adds `.nojekyll` and publishes only the site entry point, styles, app script, public exercise data, and `assets/` when that directory exists. Personal routines and development files are not included. `dist/` is ignored by Git because GitHub Pages should receive it as a deployment artifact, not as committed source. The published page has no external font or runtime service dependency.

The workflow transfers the built files to the Pages repository branch; it does not use GitHub's same-repository Pages artifact deployment. The project uses relative paths, so its assets work from the root of the organisation Pages site.
