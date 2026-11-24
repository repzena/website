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

Edit `data/exercises.json` to add or update public exercise entries. The catalogue envelope uses `format: "repzena-exercise-catalog"` and `version: 1`; each entry contains localized names, instructions and cues, normalized tag IDs, and optional local artwork paths.

The supplied personal routine file is in `private-data/rutina-julian-3-dias.json` and is intentionally ignored by Git. Import it using the **Import routine** control. Exercise instructions are not inferred from its video links; review those links before relying on them.

## Static hosting

The project is plain HTML, CSS, JavaScript modules, and JSON. It can be published as a static site. If using GitHub Pages with a repository subpath, keep asset and data URLs relative as they are now.

## Future direction

Keep exercise IDs and routine JSON provider-neutral. A later account/sync version will need a separate authentication and storage service; static hosting alone does not provide accounts or cloud sync.

## Code and data contracts

The browser app is an orchestration layer in `app.js`; focused modules under `modules/` own language and labels, route parsing, exercise search and catalogue loading, routine storage and transfer, and offline/PWA controls. Styles are split by page/component, then responsive rules and dark-theme overrides load last. Analytics remains isolated in `analytics.js`.

JSON contracts live in `schemas/`: exercise catalogue v1, analytics config v1, routine exports v2 and v3, and the supported legacy routine import format. `task lint` validates the catalogue’s data-specific rules and checks valid and invalid schema examples, including routine format versions. Keep legacy routine imports supported when evolving the export format.

Playwright coverage is grouped by user journey, catalogue, routine editing, offline/PWA, preferences, and accessibility. The accessibility suite checks modal keyboard behavior, focus return, and WCAG AA contrast for key text and controls in both themes.

## Common tasks

Install Task using the instructions at [taskfile.dev](https://taskfile.dev/), then install the project tools and run commands from this folder:

```bash
task install
task preview                 # serves on http://localhost:8000
task preview PORT=9000       # choose another port
task preview:dist            # build, then serve dist/ at localhost:8000
task lint                   # ESLint, JSON parse, and formatting checks
task test                    # browser regression suite (Playwright Chromium)
task ci                      # lint, browser tests, and production build
task format                 # apply Prettier formatting
task offline:manifest       # refresh image hashes used for offline updates
```

The preview tasks use Python 3's built-in HTTP server. Use `task preview` for the source tree or `task preview:dist` to rebuild and preview the exact deployment output. Preview, test, and build refresh `data/offline-assets.json` from the current catalogue and artwork; lint checks that it is current. Run `task offline:manifest` after replacing or adding images, then commit the generated file. Its content hashes let Repzena identify changed images, refresh them when online, and avoid treating an old cached image as current. Open tabs are notified when another tab downloads or removes the offline library. Serve the site over HTTP rather than opening `index.html` directly: browser security blocks JavaScript modules and JSON fetches from `file://` URLs. Lint, formatting, and Playwright browser-test tools are development-only dependencies; they are not needed to publish or use the static site. `task install` also downloads Playwright Chromium for local browser tests. GitHub Actions uses the same `task ci` command after its Linux browser setup via `task install:ci`.

## GitHub Actions and a separate Pages repository

`.github/workflows/ci-deploy.yml` runs `task lint`, `task test`, and `task build` as separate steps for pull requests and pushes to `main`, making each result visible in the Actions run. It publishes only on pushes to `main` or a manual run started from `main`. Publishing copies the build to the root of a separate Pages repository and commits it to that repository's configured branch.

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

The build validates the bilingual exercise data and PWA manifest, assembles the site in a staging folder, then swaps it into `dist/`; it adds `.nojekyll` and publishes only the site entry point, styles, app script, service worker, manifest, public exercise data, and `assets/`. Personal routines and development files are not included. `dist/` is ignored by Git because GitHub Pages should receive it as a deployment artifact, not as committed source. The published page has no external font or runtime service dependency. Visitors can choose light, dark, or system appearance; the choice is stored in the browser. The PWA install is optional. The service worker caches the app shell automatically, while exercise images are downloaded only when the user chooses offline access or launches the installed app. The exercise image library plus the home image is about 9 MB; routines remain in browser storage. The catalog is also retained in browser storage as an offline fallback.

On iPhone and iPad, installation is performed from the browser's Share/menu using **Add to Home Screen**. Chromium browsers can show the in-page install prompt when available. Users can also keep using the website and choose **Make available offline** to save the exercise library without installing it. `task offline:size` reports current image and catalog sizes; `task pwa:icons` regenerates the app PNG icons from their SVG source.

The workflow transfers the built files to the Pages repository branch; it does not use GitHub's same-repository Pages artifact deployment. The project uses relative paths, so its assets work from the root of the organisation Pages site.

## Production security scan

`.github/workflows/security-dast.yml` runs the OWASP ZAP Baseline Scan against `https://repzena.github.io/` daily at 00:00 UTC, after a successful run of the production deployment workflow on `main`, or manually through **Actions → OWASP ZAP baseline scan → Run workflow**. The workflow is read-only and does not create or update GitHub issues. ZAP attaches its scan report to the workflow run as the `zap-baseline-report` artifact. The scan fails on alerts except for the documented GitHub Pages header and public-static-content findings listed in `.zap/rules.tsv`; new alert types remain visible as failed runs.

The Baseline Scan performs a short crawl and passive checks; it does not perform active attacks. It is appropriate to run against the live site, but it is not a full security audit and can report findings that need human triage. ZAP and its GitHub Action are free and open source; GitHub Actions minutes are subject to the source repository's plan and usage limits. The action is pinned to its full release commit SHA; review and update that pin when adopting a newer release.

The page enforces a meta-delivered Content Security Policy and publishes `robots.txt` and `sitemap.xml`. GitHub Pages controls HTTP response headers for this deployment; the repository cannot set headers such as `Cache-Control`, `X-Frame-Options`, `X-Content-Type-Options`, `Permissions-Policy`, or `Cross-Origin-Embedder-Policy`, and browsers do not enforce `frame-ancestors` from a meta CSP. The cacheability and wildcard CORS exceptions apply to public static files only; routines stay in browser storage and are not sent to the site. Each ignored ZAP rule has a reason in `.zap/rules.tsv`. Removing these host-level limitations requires a hosting layer that supports custom response headers.
