# womenriseafg · Stage 14 — Final production readiness review

**Review completed on 26 November 2026. Production approval remains pending.** The Stage 14 build reproduced the Stage 13 release file for file. The implemented learning and administration workflows passed the local checks below. A reviewed launch catalogue, a verified hosting plan, and decisions on the outstanding requirements are still needed before calling the platform production-ready.

## Release decision

| Open item | Status | Evidence needed |
| --- | --- | --- |
| Selected provider, plan and production origin | Blocked | Provider confirmation and authorized staging evidence for HTTPS and proxy behavior, Apache or equivalent, MySQL, local streaming permission, request limits, CPU, RAM, disk, inodes, bandwidth, cron, backups and restoration. The local Passenger loader and MySQL drills have already passed. |
| Launch courses, videos, Shorts, books, quizzes and paths | Blocked | An owner-approved launch inventory with original or permitted content, attribution, download rights, human review, appropriate captions and alternatives, and native-speaker review. Fresh migrations seed taxonomy. Courses, media, books, quizzes and paths were empty before synthetic test fixtures were added. |
| Contributor workflows, rights and correction reporting | Partially completed | Decide which brief requirements must ship at launch. The separate statuses below record contributor assignments, missing CMS views, provenance gaps and the missing correction-reporting path. |
| Manual accessibility and privacy operations | Partially completed | Assistive-technology and real-device checks on representative launch material, plus an owner-approved Pashto, Dari and English privacy notice and retention plan covering account, certificate, host log and backup data. |

**Completed** means implementation and applicable evidence exist for the stated scope. **Partially completed** means some coverage or verification remains. **Not implemented** identifies a missing capability. **Blocked** identifies external evidence or inputs unavailable for this review. **Not applicable** identifies a conditional example or an exclusion specified in the brief.

## Stage 14 acceptance checklist

| Verification | Status | Evidence |
| --- | --- | --- |
| Free educational content and guest learning | Completed | Anonymous navigation, lesson, video, Shorts, PDF, quiz, path and certificate workflows. No billing or enrollment gate in the published learning routes. |
| Major learning modules | Partially completed | Core flows worked with fixtures. See the individual requirements for unsupported content kinds and course collections. |
| Administrator workflows | Partially completed | API integration covered publication, permissions and module CRUD. Real browser writes covered question bank, quiz, path, Daily Learning and homepage branding. Remaining administration modules are listed below. |
| Existing functionality | Completed | All 38 server tests passed, the release payload matched Stage 13, and all 12 reference image hashes matched their baseline. |
| External services and dependencies | Completed | Reviewed the runtime design and lockfile. The built site used one origin with local assets, storage and MySQL. Two audited dependency selections reported zero known vulnerabilities. Library variances are recorded under §4. |
| Single-provider deployment | Partially completed | The equivalent release ran locally through a TLS gateway. The identical Stage 13 payload ran through the Linux Passenger loader. Provider acceptance remains open. |
| Locally hosted media | Completed | Fixture media came from private local storage through the API. The actual launch inventory and provider permission are separate checks. |
| Pashto, Dari, English and RTL/LTR | Partially completed | Translation bundle parity and localized browser scenarios passed. Native-speaker review of wording and materials remains open. |
| Mobile and desktop, light and dark | Completed | Chrome route and viewport matrix, Firefox smoke checks and visual review. The desktop subject-label wrapping issue is recorded under §7. |
| Privacy | Partially completed | Guest access, secure cookie isolation, no-store, local opt-in and clearing passed. Unified notice, retention and host log handling remain open. |
| Security | Partially completed | Local validation, grants, sessions, headers, proxy, upload and delivery checks passed. Real HTTPS edge behavior and production operating controls require the selected plan. |
| Offline learning | Partially completed | Opt-in, cold reload, saved playback and export, eviction repair, quota and removal passed locally. Native installation on representative devices remains open. |
| Documentation and migrations | Completed | `README.md`, `docs/DEPLOYMENT.md`, `docs/PROGRESS.md` and this review document the commands, schema migration, release packaging and operator tasks. |
| Production build and testing | Completed | Both workspaces built. Locked runtime install, package verification and the executed checks are recorded below. |

## Master brief traceability

### §§1–6 and §24 · Product, process and architecture

| Requirement | Status | Evidence or outstanding work |
| --- | --- | --- |
| Free, welcoming learning for Afghan girls and women with locally managed branding | Completed | Guest-first design, editable platform name, logo, favicon, slogan and mission in the site. The owner's name `womenriseafg` supersedes the brief's provisional name. |
| Reach on low-cost phones, slow networks and shared devices | Partially completed | Responsive UI, low-data controls and shared-device guidance are implemented. Physical-device checks and performance targets remain open. |
| Reference designs, stage approvals and protection of existing functionality | Completed | Activities for Stages 0–14 are recorded. The repository keeps the original 12 design references outside build artifacts. Stage 14 changed documentation only. |
| Approved frontend and backend stack | Partially completed | React, Vite, TypeScript, Tailwind, local shadcn-style components and licence notice, Router, Lucide, Motion, TanStack Query, Axios, React Hook Form, Zod, i18next, PDF.js, native video, Vite PWA and IndexedDB are present. The backend uses Node, Express, MySQL, Sequelize, Joi, Multer, scrypt, cookie sessions, Helmet, rate limiting and structured logs. |
| Zustand and Recharts | Not implemented | Client state uses React and browser stores. The admin overview uses counts and text summaries. The brief qualifies these libraries by need. Their omission is visible for owner acceptance. |
| One-domain modular monolith, same-origin REST, SPA refresh, static routing and local assets | Completed | `app.js` and compiled Express serve the built React app and `/api/v1`. Production deep links, asset errors, authorised media delivery and HTTP caching were checked. The repo retains separate client and server workspaces. |
| External auth, analytics, storage, encoding, search and AI infrastructure | Not applicable | The brief excludes mandatory third-party production infrastructure. Search runs in MySQL, media stays on disk, and authors prepare content and variants separately. The build and dependency install use the npm registry. |
| Linux cPanel and live resource envelope | Blocked | Stage 13 verified the Passenger Node loader on Linux. The actual cPanel account, Apache edge and plan-specific capacities are unverified. [cPanel Application Manager](https://docs.cpanel.net/cpanel/software/application-manager/) |
| Production readiness, maintainability and audience fit | Partially completed | Tested code, modular structure, operational runbook and traceability exist. Release and editorial scope remain subject to the remaining decisions in this report. |

### §7 · Interface and learner experience

| Requirement | Status | Evidence or outstanding work |
| --- | --- | --- |
| §7.1–7.6 Consistent design, branded tokens, theme selection, type, components and motion | Partially completed | Shared CSS tokens, light/dark/system modes, Lucide, forms, cards, tables, loading/empty/error states, drawers, dialogs, pagination, keyboard focus and reduced motion. Inter and Noto Sans Arabic are local. The bundled Arabic font mapped 18 sampled letters and included shaping tables. Final typography and content review remain open. |
| §7.7–7.9 Responsive layouts, desktop sidebar and five-item mobile navigation | Completed | Home and Downloads checked at all eight prescribed sizes. Mobile and desktop routes verified in both directions. Navigation, header actions, skip links and focus visibility worked in tested states. |
| §7.10 Homepage, sections, configurable order, visibility, branding and real popularity | Completed | Hero and Start Learning, subjects, continue, featured/recommended content, aggregate popularity, videos, Shorts, books, AI resources, paths, daily, recent, mission and footer. Empty panels are omitted. Browser admin save and fixture rendering exercised the real database. |
| §7.11 Catalog course card actions | Partially completed | Catalog and related cards show course metadata and link to details. Bookmark, progress and Continue Learning are available in other surfaces, with no equivalent inline controls on all catalog and related cards. |
| §7.12 Course details | Completed | Translated descriptions, objectives, prerequisites, curriculum, resources, optional instructor and duration, related courses, start/resume and completion. Missing optional content depends on editorial data. |
| §7.13 Lesson player and curriculum | Partially completed | Text, video, audio and PDF lessons, mixed text/media/resources, collapsible curriculum and previous/next. Dedicated image-based and in-lesson quiz kinds are missing. Course-linked quizzes are separate supported activities. |
| §7.14 Vertical educational Shorts | Completed | Local portrait media, bounded navigation, swipe where supported, keyboard controls, explicit playback, mute, captions when supplied, save and related learning. Low-data and off-screen behavior are implemented. |
| §7.15 Digital bookshelf and reader | Completed | Grid/list, search and filters, cover and rights metadata, page navigation, zoom, fullscreen, optional save/resume and permitted downloads. Accessible text depends on the supplied PDF. |
| §7.16 Administration layout and data tools | Partially completed | Responsive navigation, breadcrumbs, filters, searchable paginated tables, media preview, upload progress, confirmation, use and health summaries. General interactive sorting across modules and live admin charts are absent. Maintenance cleanup is a limited confirmed bulk action. |

### §§8–11 · Languages, learning and administration

| Requirement | Status | Evidence or outstanding work |
| --- | --- | --- |
| §8 Initial locales, independent interface/content choice, RTL, multilingual data and search | Completed | `en`, `ps` and `fa-AF` with document language/direction, localized rendering and errors, language-aware formats, labeled translation fallback and normalized Arabic-script search. The three-way audit checked structural parity. |
| §8 Future interface languages and native-language quality | Partially completed | Compatible content locales can be added through taxonomy. An interface language such as Uzbek needs a translation bundle and locale wiring. Native editorial review remains blocked on reviewers and representative content. |
| §9.1 Taxonomy and ordered learning paths | Completed | Migration seeds 19 categories, eight subjects, grades 1–12 and three learning levels. Supports optional grades, tags, languages and learning paths. |
| §9.1 General course collections | Not implemented | The homepage features and recommends content, and paths order resources. An independent named collection object with administration and browsing is absent. |
| §9.2 Course and lesson management | Completed | Course translations, chapters and order, thumbnails, objectives, prerequisites, resources, related courses, review and archive, progress and completion. |
| §9.3 Educational video | Completed | Upload, category and lesson/course links, descriptions, thumbnails, variants, alternate audio, duration metadata, captions, transcript, search, source, licence and opt-in playback position. |
| §9.4 Educational Shorts | Completed | Portrait clips, translated descriptions, category and relation metadata, captions and variants when provided, configurable maximum duration, review and saves. |
| §9.5 Books | Completed | PDF upload, title, covers and publication metadata, filters, online reader, permitted downloads, bookmarks and page resume. |
| §9.6 Reviewed AI media | Partially completed | AI provenance and review exist for educational video, Shorts and uploaded resources such as illustrations or audio. Required structured provenance is absent for AI-assisted course translations or summaries and AI-generated quizzes/questions. |
| §9.6 Mandatory AI service and chatbot | Not applicable | The brief excludes these. The product accepts externally or locally prepared content after editorial review. |
| §9.7 Quizzes and question banks | Completed | Four question types, ordering, translated options and explanations, thresholds, withheld answer keys, server grading, retakes and opt-in local results. |
| §9.8 Local progress and saved resources | Completed | Continue Learning, lesson completion, course and path progress, video/reading positions, bookmarks, quiz scores and history are optional and can be cleared. |
| §9.9 Completion certificates | Partially completed | Free printed or browser PDF output, two built-in templates, optional on-page name, exact-code public verification only after opt-in. Eligibility uses locally recorded completions submitted to the server. Staff-configurable templates and certificate administration are absent. |
| §9.10–9.11 Paths and Daily Learning | Completed | Ordered course and activity paths with local progress. Daily selection supports automatic, curated and off modes, with no compulsory streaks. |
| §10 Content CMS and publication controls | Completed | Dashboard, education, curriculum, media, video/Short/AI, books, questions/quizzes, paths/daily, homepage, feature lists, announcements, branding and storage. Server-side grants, guarded workflow, version checks and accessible authoring controls are in use. |
| §10 Administrative coverage | Not implemented | Users and role assignment, educator/translator/reviewer assignment, certificate console, general platform appearance/settings, and administrator-facing security/audit/backup consoles. CLI and runbook operations cover selected maintenance tasks. PWA branding stays in the build configuration. |
| §11 Guest, student and administrator access | Completed | Published content is public, optional learner sessions are isolated, and administrator modules require server grants. Integration checks exercised allowed and denied cases. |
| §11 Scoped staff roles and global delegation | Partially completed | Names and grant structures exist. Default content-manager, teacher, translator and reviewer roles have self-account permissions. Assignment, editor/reviewer lanes and delegation UI are missing. |

### §§12–16 · Data, media, discovery and offline delivery

| Requirement | Status | Evidence or outstanding work |
| --- | --- | --- |
| §12 Relational MySQL schema, integrity and migrations | Completed | 41 InnoDB tables and 11 applied migration entries. Source uses IDs, foreign keys, unique translations, versions, transactions, deletion guards and indexes. Runtime and migration grants were separate. Stage 13 exercised restoring a matching schema and storage. |
| §12 Suggested alternative tables, enrollment or server-stored personal learning history | Not applicable | Taxonomy and media variants use grouped models. Quizzes are graded without a durable personal-answer record. Browser stores deduplicate local progress and saves. Billing and mandatory enrollment are excluded. |
| §13 Local media, reuse, formats, metadata and safety | Completed | Local object store and MySQL metadata, digests, safe names, format inspection, size limits, upload progress/cancellation, publication and attachment permissions, verified byte ranges and guarded orphan cleanup. Separate published variants and captions are supported. |
| §13 Static offload, production streaming and capacity | Blocked | Express enforces publication and range/permission rules. Optional host static mappings are documented for public build assets. Hosting permission, request limits, real streaming load and quota behavior still require the selected plan. |
| §14 Global search and discovery | Completed | Courses, lessons, videos, Shorts, books, subjects, categories and paths. Debounced suggestions, language, subject, type, level and grade filters, page limits, empty state and real Arabic-script matching. |
| §14 Search scale | Blocked | MySQL lookup is bounded and avoids external indexing services. Representative production-volume Arabic query latency remains unmeasured. |
| §15 Low-data controls and no premature video transfer | Completed | App selected the prepared 360p variant in data-saving mode and exposed the audio option. The standard mode selected the original. Tests observed zero video requests before activating controls. Text alternatives, lazy routes and thumbnails, compressed assets and local fonts are implemented. |
| §15 Strong Core Web Vitals | Partially completed | Local slow-mobile measurements are recorded below. Field performance, INP and production load remain open. [Core Web Vitals](https://web.dev/articles/vitals) |
| §16 Manifest, worker and optional install | Partially completed | Manifest and icons, explicit worker opt-in, cold offline fallback, shell integrity and eviction repair checked. The install prompt was simulated in Chrome. Native installation on physical devices remains unverified. |
| §16 Eligible offline resources and shared-device controls | Completed | Intentional lesson/text and permitted media/PDF downloads, quota awareness, progress, cancellation, removal and app-managed data clearing. Private API responses and admin pages stay outside the shell cache. The guidance accounts for browser history, installed apps and exported files separately. |

### §§17–20 · Privacy, security, accessibility and editorial rights

| Requirement | Status | Evidence or outstanding work |
| --- | --- | --- |
| §17 Minimize learner data and avoid social/tracking obligations | Completed | Optional username/password, local opt-in and clear actions, sign-out, anonymous browsing, aggregate course totals and no learner directory, DMs, ads, push or compulsory contact details. Browser journeys stayed on the same origin. |
| §17 Localized privacy information and retention | Partially completed | Account, Settings and Downloads supply translated privacy instructions. Session expiry and scheduled cleanup are documented. A unified privacy notice and lifecycle for optional accounts, certificates, host access/audit logs and backups remain open. |
| §18 Application controls and credential protection | Completed | Password hashing, protected expiring/revocable cookie sessions, same-origin write controls, runtime and module grants, parameterized data queries, safe text rendering, strict CSP, file validation, sanitized errors, private configuration and logs. CLI recovery and separate TCP and Passenger metadata paths were exercised. |
| §18 Brute-force, hosting edge and operational controls | Partially completed | Credentials are rate-limited per source IP and worker. Cross-worker behavior and provider edge configuration, certificate renewal, backup retention and access-log privacy require host verification. |
| §18 Provider SMTP | Not applicable | Email functionality was not authorized. |
| §19 WCAG 2.2 AA and usable RTL/LTR interactions | Partially completed | Semantic structure, labelled fields, keyboard focus, skips, dialogs, contrast scans, reduced motion and media text alternatives were checked in the tested surfaces. Manual screen-reader review and full conformance testing remain open. The AI illustration detail uses the title as alternative text, with no dedicated authored description field. Accessibility depends on the actual captions, transcripts and PDF structure delivered. [WCAG 2.2](https://www.w3.org/TR/WCAG22/) |
| §20 Provenance, rights and review for every learning resource | Partially completed | Source, licence and download permission in media, with author/attribution where provided. Course and quiz text lack universal structured rights fields. Some related review evidence depends on the operator. |
| §20 Anonymous or minimal-data learner correction reports | Not implemented | No learner workflow for submitting a content correction is present. |
| §§8, 19, 20 Native editorial approval, actual rights and accessibility of launch resources | Blocked | The audit used synthetic fixtures. No owner-approved launch catalogue or its editorial records were supplied. |

### §§21–23 · Stages, testing and reporting

| Requirement | Status | Evidence |
| --- | --- | --- |
| Staged authorization, verification and progress record | Completed | `docs/PROGRESS.md` records Stages 0–14. This review stayed within Stage 14. |
| Release documentation, migration and rollback instructions | Completed | `README.md` and `docs/DEPLOYMENT.md` cover install, runtime configuration, MySQL, permissions, restart, operational checks, backup, restore and rollback. The selected provider's values are pending. |
| Final traceability and release approval | Completed | This report records statuses, evidence, unresolved issues and the acceptance boundary. Production approval remains pending. |

## Test record

Node 22.14.0, npm 11.21.3 and isolated MySQL 8.0.31 were used. Browser scenarios targeted the extracted release over local HTTPS, with synthetic content and no connection to a live deployment. `$work` denotes private scratch files.

| Command or check | Actual result |
| --- | --- |
| `npm run lint`, `npm run typecheck`, `npm run build`, `git diff --check` | Passed. Vite built both the client and its service worker with 20 approved precache entries. The server build compiled. |
| `npm test` with the isolated `connection.env` and `WOMENRISEAFG_IDENTITY_TEST=1` | 38 passed, zero failures and zero skips. Includes SQL-backed identity/grants, taxonomy, curriculum, upload and range, rights, books, learning media, quizzes, paths, certificates, homepage, cache policy and local Passenger/TCP transport. |
| `npm audit` and `npm audit --omit=dev` | Both reported zero known vulnerabilities at check time. |
| `npm run package:deployment`, `tar -xzf`, locked runtime `npm ci --omit=dev --ignore-scripts --workspace @womenriseafg/server` | Passed. All 300 extracted file paths and SHA-256 hashes matched the delivered Stage 13 archive. The runtime install added 127 packages. The runbook and release payload already verified under the Linux Passenger loader therefore still apply. |
| `npm run dev` and `node $work/stage14-production.cjs` | Vite HTML, proxied health and readiness passed. Extracted production `app.js` started under the local TLS gateway. Migrations by the migration user ran twice, bootstrap passed, and the production API ran with DML grants. |
| `node $work/stage14-identity-browser.cjs` | Verified anonymous access, Unicode registration/login, generic failed login, secure HTTP-only cookie, learner denial from the admin API, logout and zero CSP events. |
| `node $work/stage14-learner-flow.cjs` and `node $work/stage14-state-check.cjs` | Verified real lessons and local progress, bookmarks, four quiz genres, path progress, original video playback/seek/resume, caption cues and transcript, PDF reading and page resume, certificate print and verification privacy, and search loading, empty, failure and retry. |
| `node $work/stage14-admin-browser.cjs` | Authorized browser writes for question bank, quiz, path, Daily Learning and homepage branding. The saved branding was read from MySQL through the API and fixture settings were restored. |
| `node $work/stage14-links.cjs` and `node $work/stage14-cache-check.cjs` | 30 homepage destinations, 86 public build files, three manifest icons, Daily Learning navigation, expected 401 and 404, worker revalidation and no-store responses passed. Main script transfer was 171,488 bytes with Brotli and 550,327 bytes with identity encoding. |
| `node $work/stage14-multilingual-browser.cjs`, `node $work/stage14-browser-layout.cjs`, `node $work/stage12-shared-a11y.cjs` and `node $work/stage12-drawers.cjs` | 288 Chrome route checks, 48 homepage layouts, 24 Downloads layouts, three cold localized fallbacks, and 69 axe scans with zero violations on examined states. Checked light/dark, three locales, desktop/mobile, skip focus, Escape, modal focus and guarded admin drawers. The targeted drawer harness used intercepted admin responses. |
| `node $work/stage14-product-translation-audit.cjs` | 17 locale bundles, 1,392 source messages with matching keys and interpolation names across English, Pashto and Dari. |
| `node $work/stage14-offline-flow.cjs` and `node --import tsx $work/stage12-pwa-integrity.cjs` | Offline opt-in, eligible saves, restricted-file denial, cold reload, export, local seeking, shell repair, quota, cross-tab removal, reconnect, simulated install and cache clearing passed in Chrome. |
| `node $work/stage14-firefox.cjs` with the scratch Playwright Firefox runtime | Firefox 153.0 passed 30 localized route/viewport checks, PDF navigation, video metadata, opt-in and a cold offline Downloads reload. |
| `node $work/stage14-data-saving.cjs` | Verified no video preloading, prepared 360p selection in saving mode, original selection in standard mode, and the alternate audio control. Visually reviewed English light desktop and Pashto dark mobile screenshots. |

## Performance and known limits

The slow-mobile Chrome check (`node $work/stage14-mobile-performance.cjs`) used a 390 × 844 viewport, 200 ms latency, 200 KiB/s download, 90 KiB/s upload and 4× CPU throttling. The browser cache was disabled and the worker was bypassed. Three completed pairs measured 497,818 bytes in standard mode and 477,127 bytes in data-saving mode. Median LCP was 3.252 seconds in standard mode (3.232–4.624) and 2.844 seconds in data-saving mode (2.820–2.876). Measured CLS was 0.092 in both modes. An earlier throttled attempt timed out waiting for the page to render in data-saving mode and was excluded from these pairs. The completed laboratory values are above the published 2.5-second good LCP threshold, and field metrics remain unmeasured. [Core Web Vitals measurement and thresholds](https://web.dev/articles/vitals)

- A desktop visual check found that the seeded **General mathematics** label can wrap the final letter onto its own line at 1366 px. The affected card remains usable.
- The production build reports upstream Zod annotation notices and bundle-size warnings. Staged builds report their fresh external output directory. The locked server install prints an existing transitive `dottie` deprecation warning.
- Tested browser engines were Chrome and Firefox on Windows. Physical devices, native install, WebKit, assistive technologies, live provider traffic and the production content catalogue remain unverified. Full WCAG conformance requires broader manual verification.

## Files, environment and approval

This stage added `docs/READINESS.md` and updated `README.md` and `docs/PROGRESS.md`. Production code, migrations, configuration and visual assets retain the tested Stage 13 payload. Test services were stopped and temporary validation credentials removed. The scope decision, approved editorial inputs, and any authorized staging test belong to the owner. The master brief ends at Stage 14.

**STAGE 14 COMPLETED. I HAVE STOPPED WORKING. WAITING FOR YOUR APPROVAL BEFORE STARTING THE NEXT STAGE.**

