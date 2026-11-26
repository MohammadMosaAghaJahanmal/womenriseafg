# womenriseafg development progress

## Stage 0 — Existing project audit and planning

Completed. The original project contained 12 JPEG design studies, covering mobile discovery, course dashboards and lesson players. The owner approved Stage 1 after the audit.

## Stage 1 — Project foundation and architecture

**Completed on 26 November 2026.** The React client and Express API ran together in development and from the compiled production entry. Both connected successfully to an isolated MySQL 8.0.31 database through Sequelize.

### Implementation and files

| Location | Stage 1 change |
| --- | --- |
| `package.json`, `package-lock.json`, `eslint.config.mjs` | npm workspaces, locked dependencies, coordinated development, lint, type checks, tests, build and production start commands |
| `client/` | React, Vite and strict TypeScript configuration, a same-origin development proxy, an English status page and a cancellable health request with a retry action |
| `server/src/config/` | Root environment loading, Joi validation, private storage path checks and a small MySQL connection pool using utf8mb4 |
| `server/src/modules/health/`, `server/src/middleware/` | Versioned public health and readiness routes, reusable input validation and consistent JSON error responses |
| `server/src/app.ts`, `server/src/index.ts`, `app.js` | Express application, production static-file serving, structured request logging, process startup and shutdown, and a CommonJS entry for a Node application manager |
| `server/tests/foundation.test.ts` | Nine regression tests for configuration, connection setup, validation, public access, errors and routing |
| `.env.example`, `.gitignore`, `README.md`, `AGENTS.md`, `docs/PROGRESS.md` | Environment template, local file exclusions, run instructions, persistent stage boundaries and this progress record |

A local Git repository was initialized on the main branch. All 12 reference JPEGs matched their pre-stage SHA-256 hashes. The Stage 0 project contained no existing application workflows to migrate. The learning interface and its design system are scheduled for Stage 2.

### Database and API

Stage 1 added connection configuration only. The test user had SELECT access to one disposable schema. The schema contained zero tables before and after verification. The application introduced no models, migrations, indexes or constraints.

| Request | Observed result |
| --- | --- |
| `GET /api/v1/health` | Returned HTTP 200 with `{"status":"ok"}` with and without a working database connection |
| `GET /api/v1/ready` | Returned HTTP 200 with `{"status":"ready"}` when MySQL authenticated. With MySQL unavailable, it returned HTTP 503 with the public `UNAVAILABLE` error |
| Unknown API, media, asset and private file paths | Returned HTTP 404. An HTML navigation request for a client route returned the built app shell |

### Security, privacy and UI

Both status endpoints allow read-only guest access. Helmet supplies security headers. The API rejects unsupported input, applies a JSON body-size limit and disables response caching. Public errors omit internal exception details. Request logs contain the request ID, method, status and duration. The health checks set no cookies, and the browser made no off-origin application requests.

The foundation view announces connection status, shows a pending state, and offers a keyboard-accessible retry. Successful, empty, and failed API responses were exercised. Direction checks applied to the English status page. Translation, language switching and the student-facing layouts belong to later stages.

### Verification

| Command or check | Final result |
| --- | --- |
| `npm ci` with npm 11.21.3 | Completed from the final lockfile on Windows with Node 22.14.0 |
| `npm run lint` | Passed with zero warnings |
| `npm run typecheck` | Both workspaces passed, including server tests. Initial test callback and response-typing errors were corrected |
| `npm test` | 9 passed, 0 failed, 0 skipped |
| `npm run build` | Vite produced the production client and TypeScript compiled the Express server |
| `npm run dev` with HTTP checks | Vite served HTML and transformed TSX. Health and MySQL readiness passed through the development proxy on its configured port |
| `npm start` with HTTP checks | Express served the built HTML, JavaScript, CSS, direct client navigation and both endpoints from one origin. Private paths returned 404. A separate run with an unavailable database returned the expected 503 |
| Chrome production-page checks | All eight specified viewport sizes from 320 × 568 to 1920 × 1080 passed in LTR and forced RTL. Checks covered horizontal overflow, 44 px button height, loading, success, transport failure, an empty JSON object, retry, and keyboard focus/activation |
| MySQL client checks | MySQL 8.0.31 returned a successful read query. The test account had SELECT access on its own schema. Table count remained zero. The test server was stopped and its temporary credential files were removed |
| `npm audit` and `npm audit --omit=dev` | Both reported zero known vulnerabilities after pinning Sequelize’s transitive UUID library to 11.1.1. CommonJS loading and Sequelize’s UUID v1/v4 defaults were verified |
| Reference and ignore checks | All 12 reference hashes matched. Git excluded local secrets, storage, installed packages, builds and the reference folder |

### Known limits and hosting compatibility

Production was exercised locally through the same entry provided for Passenger. A live Linux/cPanel account has yet to be verified. The selected provider needs a compatible Node runtime, MySQL, a private application directory and HTTPS termination. The README identifies the setup and remaining provider checks.

Sequelize 6 still depends on the deprecated dottie package. The final dependency audit reported zero advisories. Maintain the scoped UUID override when updating the lockfile and revisit it when Sequelize updates its own dependency range.

### Next stage

Stage 2 is the design system and application layouts. It requires separate owner approval.

**STAGE 1 COMPLETED. I HAVE STOPPED WORKING. WAITING FOR YOUR APPROVAL BEFORE STARTING THE NEXT STAGE.**

## Stage 2 — Design system and application layouts

**Completed on 26 November 2026.** The guest student workspace and separate administration preview run from the existing React/Vite and Express application. The student interface supports English, Pashto and Dari, mirrors for right-to-left reading, and offers light, dark and system appearance.

### What was implemented

- The homepage uses an original, locally served illustration and four illustrated subject cards. Start learning opens the subject explorer. Each subject opens a labeled preview with expandable topic descriptions. Future areas have clearly marked destinations. Search finds pages in the workspace navigation.
- The student shell has a collapsible desktop rail, mobile header, five-item bottom navigation, mobile drawer, skip link, footer, language switcher and theme selector. Keyboard users can open search, navigate the results and dismiss dialogs with Escape.
- The visual system supplies semantic color, focus and state tokens, local Inter and Noto Sans Arabic fonts, responsive typography and reduced-motion behavior. The component library includes buttons, fields, search, selects, tabs, badges, tooltips, dialogs, a drawer, cards, progress, pagination, status feedback and accessible tables.
- The public administration preview has its own navigation and breadcrumbs. Its component examples support search, filtering, sorting, pagination, reset with confirmation, a toast and native media controls. The resource cards and short audio sample demonstrate the interface. They hold no student records or published course material.

### Implementation choices and files

| Location | Changes |
| --- | --- |
| `client/src/App.tsx`, `main.tsx`, `i18n.ts`, `preferences.tsx`, `styles.css` | Routes, locale selection, document language and direction, local preferences, font declarations, color tokens and reduced motion |
| `client/src/layouts/`, `features/discover/` | Responsive navigation, footer, page search, homepage, subject explorer, illustrations and translations |
| `client/src/components/ui/`, `features/admin/` | Source-owned UI primitives including an adapted shadcn/ui button and Radix controls, accessible previews and local tone sample |
| `client/src/pages/` | Settings, future-section previews, missing-page handling and the preserved Stage 1 status workflow |
| `client/public/` | WebP artwork, favicon, local font and shadcn license notices. The hero artwork was AI-generated for this interface and visually reviewed |
| `client/index.html`, `client/package.json`, `client/vite.config.ts`, `package-lock.json` | Vite/Tailwind integration, client dependencies, production entry and reproducible dependency versions |
| `README.md`, `docs/PROGRESS.md`, `docs/screenshots/stage-2/` | Current routes, stage record and four screenshots from the production build |

The 12 original design references retained their recorded SHA-256 hashes. No project files were removed. Stage 1 health, readiness, static-file boundaries and same-origin routing were preserved. Production splits the administration and secondary workspace pages into separately loaded chunks.

### Database, security and privacy

There were no server changes, database connections added, migrations, models, indexes or constraints in Stage 2. The status view calls the existing public health endpoint. The administration preview exposes local examples and navigation only. Authentication and privileged operations remain in their designated stages.

During production browser checks the site issued no cross-origin requests, set no cookies and issued no write requests. Fresh guest visits left local storage empty. After explicit choices, the only entries were the interface language and theme. Learner progress, search history and downloads are outside this stage.

### Testing results

| Command or check | Observed result |
| --- | --- |
| `npm run lint`, `npm run typecheck` | Passed for the project and both TypeScript workspaces |
| `npm test` | All 9 existing foundation tests passed, with zero failures or skips |
| `npm run build` | Vite and the TypeScript server build passed. The final homepage JavaScript entry measured 117.5 kB gzip. Fonts and artwork are served locally |
| `npm run dev`, `npm start` | Development proxy and live health endpoint responded. The compiled application served its routes, assets and status view through Express |
| Production browser and HTTP checks | 18 direct routes in each of 3 locales passed. Health returned 200, readiness returned the expected 503 with an intentionally unavailable database, and all five reserved/private/missing path probes returned 404. Unexpected health JSON produced a visible error and retry recovered against the real API |
| Chrome responsive and interaction checks | The student interface was exercised in all three languages at 320 × 568, 360 × 800, 390 × 844, 768 × 1024, 1024 × 768, 1366 × 768, 1440 × 900 and 1920 × 1080. Verified subject selection, keyboard search, collapse, drawers, focus restoration, RTL placement, system theme changes and persistence. Admin table, card, media, confirmation and feedback examples also passed |
| axe-core 4.14.1 and manual checks | Fixed the search control’s accessible name to match the visible shortcut. The final 16 scans covered six pages and two dialogs in English/light and Dari/dark and reported zero violations. Manual review covered decorative glyphs and drawer labels that automation could not evaluate. Drawer text contrast measured 7.75:1 in light mode and 10.73:1 in dark mode |
| Font and asset checks | FontTools verified all 59 distinct Arabic-script code points in the UI/alphabet check against the bundled font, including Pashto-specific letters. The hero loaded from the application origin. All four screenshot files were verified |
| `npm audit`, `npm audit --omit=dev`, `git diff --check` | Both dependency audits reported zero known vulnerabilities. The tracked diff passed its whitespace check |

### Screenshots

- [English student homepage, desktop](screenshots/stage-2/womenriseafg-home-desktop.png)
- [Pashto student homepage, mobile](screenshots/stage-2/womenriseafg-home-mobile-ps.png)
- [Dari student homepage, tablet in dark mode](screenshots/stage-2/womenriseafg-home-tablet-fa.png)
- [Administration component library, desktop](screenshots/stage-2/womenriseafg-admin-components.png)

### Known limits and hosting

Browser verification used Chrome. Translation coverage, script glyphs and RTL behavior were tested. Native-speaker editorial review and assistive-technology testing with learners remain outstanding. The learning sections and administration examples are clearly labeled previews. Real content and management workflows belong to their authorized stages.

The existing single-origin production entry serves the built client, illustrations, fonts and audio locally. Production was verified on the local machine. The actual cPanel/Passenger provider and its hosting limits still need verification. No live deployment was performed.

### Next recommended stage

Stage 3 covers database, authentication and authorization. It requires separate owner approval.

**STAGE 2 COMPLETED. I HAVE STOPPED WORKING. WAITING FOR YOUR APPROVAL BEFORE STARTING THE NEXT STAGE.**

## Stage 3 — Database, authentication, and authorization

**Completed on 26 November 2026.** Optional student accounts, dedicated administrator sign-in, and server-side authorization work through the existing same-origin application. The guest homepage, subject explorer, and health endpoint remain publicly accessible.

### Implementation

- Students can register with a chosen username and passphrase, sign in, review their account, and sign out. Registration collects no email, phone number, legal name, or profile photograph. English, Pashto, and Dari account screens reuse the existing theme, typography, and layout.
- Administrator sessions require a successful dedicated sign-in and a current `admin:access` grant. The server checks the session’s scope and the live permission assignments on each protected request. The administration layout and its component route both require authorization.
- The public Stage 2 gallery moved to `/design-preview`, where it remains usable as a standalone showcase. The student site links to both administration and the design preview. Settings can clear locally stored language and appearance choices.
- The operator CLI applies migrations, initializes the first super administrator once, recovers active administrator accounts through a replacement passphrase, and removes expired sessions. Recovery revokes all existing sessions for the affected administrator. Bootstrap and recovery take the passphrase on standard input.

### Files and database changes

| Area | Main changes |
| --- | --- |
| `server/src/identity/` | Sequelize models, database access, roles and permissions, explicit migrations, bootstrap, recovery, and session cleanup |
| `server/src/modules/auth/` | Credential validation, password hashing, cookie sessions, permission middleware, and the authentication API |
| `server/src/app.ts`, `index.ts`, `config/environment.ts`, `.env.example` | API registration, exact public origin validation, and explicit trusted proxy configuration |
| `client/src/features/auth/`, `client/src/App.tsx` | Localized forms, account session management, routes, and administrator route checks |
| `client/src/features/admin/`, `layouts/`, `pages/WorkspacePages.tsx`, `preferences.tsx` | Role-gated workspace, public design preview, navigation links, and clearing preferences |
| Package manifests, root lockfile, `server/tests/`, `README.md`, and this progress log | Dependencies, regression coverage, and operator instructions |

The `001-initial-identity` migration creates `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, and `sessions`, with a migration ledger. It adds a unique username index, join-table keys, foreign keys, and session user and expiry indexes. It seeds seven named roles and two permissions. Guests are represented by the absence of a session. The additive `002-admin-session-scope` migration adds a required Boolean to sessions, defaulting to learner scope. Existing administrator sessions must sign in again to gain administrator scope.

### Security and privacy

Passwords use Node’s asynchronous scrypt with individual salts and a bounded concurrency setting. Session tokens are randomly generated, and MySQL stores only their digests. Production uses host-scoped `HttpOnly`, `Secure`, `SameSite=Strict` cookies and requires HTTPS on account endpoints. JSON account writes check the exact configured origin. Session and permission responses use `Cache-Control: no-store`. [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt) · [OWASP origin verification](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#using-standard-headers-to-verify-origin)

Successful administrator sign-in, sign-out, initialization, and recovery record opaque account IDs in structured logs. Failed sign-in events do not record the attempted username. Browser tests found no session tokens in browser storage and no off-origin requests during the account workflows.

### Verification

| Command or check | Result |
| --- | --- |
| `npm run lint` and `npm run typecheck` | Passed |
| `npm test` with `WOMENRISEAFG_IDENTITY_TEST=1` and disposable MySQL 8.0.31 | 11 passed, 0 failed, 0 skipped. Covered migration concurrency and re-run, permissions, later grants, session scope and expiry, token digests, recovery, logout, origin checks and throttling |
| `npm run build` | Client and server built. Vite reported two upstream Zod annotation warnings |
| `npm run dev` | Vite proxy returned 200 for liveness, database readiness, the guest session response, and the administrator login page |
| Production entry via a local HTTPS proxy | Verified both migrations on an empty schema, migration re-run, one-time bootstrap, rejected weak bootstrap passphrase, cookie flags, recovery, expired-session purge command, and revocation of the prior cookie |
| Chrome browser integration | Guest browsing and the public gallery, student registration and sign-in, administrator access, sign-out, invalid inputs, malformed session retry, cookie privacy, theme/language preference clearing, all three locales, and eight viewport sizes passed |
| Chrome accessibility checks | 24 axe scans of registration, student sign-in, administrator sign-in, and Account in three locales at desktop and phone widths reported zero violations. The layout check passed all 96 route, size, and locale combinations. Corrected a Dari mobile Library label mismatch and reran |
| `npm audit`, `npm audit --omit=dev`, and `git diff --check` | Both audits reported zero known vulnerabilities. The whitespace check passed |
| Reference integrity | All 12 original reference images matched their recorded SHA-256 hashes |

### Known limits and hosting

Testing used a local MySQL instance and a local HTTPS proxy. Provider-specific cPanel and Passenger behavior still awaits verification. Configure the exact public HTTPS origin, allow only the provider’s verified proxy addresses, and ensure the proxy overwrites forwarding headers. The migration step needs two available MySQL connections. The authentication rate limit is 20 credential requests per IP per 15 minutes in each Node worker, and a worker restart resets its counter. The README covers these requirements and expired-session maintenance. [Express proxy configuration](https://expressjs.com/en/guide/behind-proxies.html)

The production build reports two nonfatal code-comment warnings from Zod. Native-speaker editorial review and testing with learners using assistive technology remain outstanding.

### Next recommended stage

Stage 4 covers educational organization and administration foundation. It requires separate approval.

**STAGE 3 COMPLETED. I HAVE STOPPED WORKING. WAITING FOR YOUR APPROVAL BEFORE STARTING THE NEXT STAGE.**

## Stage 4 — Educational organization and administration foundation

**Completed on 26 November 2026.** Administrators can manage categories, subjects, education levels, grades, languages, and tags from the education dashboard. The administration shell and student workspace from earlier stages remain available through their existing routes.

### Implementation and user experience

- The education dashboard shows stored totals for all six sections. Each section provides a searchable list, status filtering, pagination, an editor, and a confirmation before deletion. Desktop uses a semantic table, while narrow screens show the same records as cards. The views support English, Pashto, Dari, right-to-left layouts, and the existing theme settings.
- Entries can store their names and descriptions in multiple content languages. The interface identifies fallback labels by language. Subjects can link to a category, grades use 1–12, and language entries carry a canonical locale code and reading direction.
- New entries start in Draft. Administrators can move an entry through educational review, optional translation review, approval, publication, and archive. Approved or archived entries must return to Draft before editing. The guest API returns published entries and labels in published languages. Categorized subjects also require a publicly visible category.
- Record versions prevent one editor from overwriting another editor’s newer update. Reference checks prevent deletion of categories in use and languages used by translations.

### Files changed

| Area | Changes |
| --- | --- |
| `server/src/modules/education/` | Taxonomy contracts, validation, Sequelize models and persistence, initial data, migration, public list API, and protected admin API |
| `server/src/app.ts`, `server/src/index.ts`, `server/src/identity/cli.ts` | Mount the education routes and include the education migration in `npm run db:migrate` |
| `server/src/modules/auth/` | Reuse origin and HTTPS request guards. Apply current session scope consistently when exposing or checking permissions |
| `server/tests/education.integration.test.ts` | Input validation and isolated MySQL workflow tests |
| `client/src/features/education/` and `client/src/features/admin/` | Dashboard links and counts, list and editor views, translated messages, and responsive styles |
| `README.md` and `docs/PROGRESS.md` | Database setup, permission and status workflow, test results, and stage record |

### Database changes

Additive migration `003-education-organization` creates `education_entries`, `education_languages`, and `education_translations` using InnoDB and `utf8mb4`. Verified four foreign keys, six CHECK constraints, three primary keys, and four named unique constraints. The migration is serialized and repeatable. Seed data and role grants commit with the migration record. [MySQL DDL transaction behavior](https://dev.mysql.com/doc/refman/8.0/en/implicit-commit.html)

Initial data includes 19 categories, eight subjects, three education levels, 12 grades, and three languages. Each of the 45 seeded entries has English, Pashto, and Dari labels. Tags start empty. No existing account records or design references were modified. The 12 reference image hashes matched the earlier baseline.

### Security and privacy

Admin API access requires administrator session scope and `education:manage`. Publishing and archiving additionally require `education:publish`. The new migration assigns both permissions to the built-in administrator and super administrator roles. Changes use the existing exact-origin and JSON checks and structured audit logs identify the administrator and changed entry without logging submitted text. The public catalog can be read as a guest. The student account regression suite confirmed that an existing learner session does not gain effective staff permissions after a role assignment.

### Verification

| Check | Result |
| --- | --- |
| `npm run lint`, `npm run typecheck`, and `git diff --check` | Passed |
| `npm test` with the isolated MySQL fixture | 13 passed, 0 failed, 0 skipped. Covered CRUD, translation normalization, pagination, duplicate and invalid values, concurrent saves, lifecycle, guest visibility, and administrative permission boundaries |
| `npm run build` | Client and server built. The two existing upstream Zod annotation warnings remain |
| Development and production entry points | Verified Vite proxy responses and the compiled Express app behind a local HTTPS proxy. The CLI applied the migration on fresh MySQL 8.0.31 and reran successfully |
| Direct MySQL checks | Verified seed counts, locale and grade constraints, repeatability under concurrent calls, and normalized Pashto/Dari search. A collation mismatch comparing Arabic search terms to ASCII codes was found and corrected |
| Chrome integration | Exercised all six management sections, subject category assignment, bilingual authoring, publication and withdrawal, search, filtering, pagination, deletion, and recovery from loading and API failure |
| Responsive and accessibility checks | Passed 48 browser checks across three languages and all eight prescribed sizes. Twelve automated axe scans on the live admin list and editor reported zero violations. A supplemental browser pass using stubbed API responses found zero violations across 24 scans and passed 96 layout checks. Desktop and RTL mobile captures were visually inspected |
| `npm audit` and `npm audit --omit=dev` | Both reported zero known vulnerabilities |

### Known limits and hosting

Live cPanel and Passenger compatibility remains unverified. The existing single-origin deployment uses MySQL with enforced CHECK constraints, at least two available migration connections, and the configured HTTPS proxy. Browser testing used Chrome. Native-speaker editorial review and hands-on assistive-technology testing remain outstanding.

### Next recommended stage

Stage 5 covers centralized media management and requires separate approval.

**STAGE 4 COMPLETED. I HAVE STOPPED WORKING. WAITING FOR YOUR APPROVAL BEFORE STARTING THE NEXT STAGE.**

## Stage 5 — Centralized media management

**Completed on 26 November 2026.** The administration media library supports upload, preview, reuse, publication and safe deletion. The student layouts, component gallery, accounts and education management from earlier stages remain available through their existing routes. The 12 original design reference images retained their recorded SHA-256 hashes.

### Implementation and user experience

- Staff can search and filter a paginated media library, see storage usage, upload with progress and cancellation, edit rights metadata and preview files. The interface works with the existing English, Pashto, Dari, light and dark themes and right-to-left layouts.
- A single asset can be reused as a thumbnail, pre-encoded video version, alternate audio file, caption or transcript. The video preview can switch between uploaded versions and display linked caption tracks. The interface previews images and text, plays audio and video, and offers a document thumbnail and file actions for PDFs and attachments.
- Drafts stay private until a staff member confirms publication. The server verifies the publication grant, source, license and availability of linked assets. An explicit download request uses the asset’s download permission. The file endpoints support standard single HTTP byte ranges for seeking. [HTTP Semantics, RFC 9110](https://httpwg.org/specs/rfc9110.html#range.requests)
- Deletion checks both linked files and registered content references. A database marker hides a deleted item before its bytes are removed. The Unattached files filter helps staff review unused drafts and archived assets. Confirmed maintenance retries unfinished deletions and removes eligible abandoned files after 24 hours.

### Files and schema

| Area | Change |
| --- | --- |
| `server/src/modules/media/` | Contracts, Joi validation, local Multer storage, file format inspection, streaming, metadata and relationship persistence, and migration 004 |
| `server/src/app.ts`, `index.ts`, `config/environment.ts`, `modules/auth/request.ts` and `identity/cli.ts` | Same-origin routes, shared origin and permission checks, storage configuration, and the existing migration command |
| `client/src/features/media/` and the administration shell | Media library, upload, editing, native playback, reusable files, storage reporting, cleanup and translations |
| Server manifest, root lockfile and `server/tests/` | Multer and its types, synthetic media fixtures, configuration and MySQL integration tests |
| `.env.example`, `README.md` and `docs/PROGRESS.md` | Settings, operational details and stage results |

Additive migration `004-centralized-media` creates `media_assets`, `media_links` and `media_references`. The verified InnoDB schema uses `utf8mb4`, with three primary keys, two unique constraints, five foreign keys and five CHECK constraints. It grants `media:manage` and `media:publish` to administrators and super administrators. File contents live on disk. MySQL stores available technical metadata, rights, language, timestamps, uploader ID, safe storage key and digest.

### Security and privacy

Uploads use a configured byte limit, bounded signature and metadata inspection, generated names, and private staging and object directories. The application verifies origin and staff permissions before accepting multipart bodies. Admin previews use no-store caching. Public files are revalidated against current status. PDF and text responses use a sandboxed policy. Structured logs identify actions and asset IDs. [Express Multer middleware](https://expressjs.com/en/resources/middleware/multer/) · [OWASP file upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)

### Testing results

| Check | Result |
| --- | --- |
| `npm run lint`, `npm run typecheck` and `git diff --check` | Passed |
| `npm test` with disposable MySQL 8.0.31 | 15 passed, 0 failed, 0 skipped. Covered valid and invalid uploads, byte limits, duplicate bytes, range and HEAD requests, version conflicts, lookup and access, linked assets, cleanup and reference guards |
| Direct MySQL checks | Verified concurrent and repeat migration, constraints and role grants, localized search, relationship depth and deletion recovery |
| Focused file tests | Passed for 10 actual formats, PDF attachments, exact byte ranges and revalidation, aborted multipart upload cleanup, stale files, overwrite protection and directory junction rejection. Corrected a Windows file-identity check exposed during testing |
| `npm run dev` and the production build | Vite served the admin application and proxied health, readiness and guest authorization. The compiled Express application ran behind local HTTPS. Two existing Zod annotation warnings appeared during the build |
| Production Chrome | Verified actual upload and rejection, progress and cancellation controls, thumbnail preview, H.264 playback and seeking with HTTP 206, video variant switching, publication and archive visibility, relationship removal, deletion and search |
| Responsive and accessibility checks | Passed 48 live checks across the media list and upload views in three languages at all eight required sizes. Twelve automated live axe scans found zero violations. Supplemental Chrome checks used fixture responses and covered 72 viewport/locale/view combinations and 18 zero-violation axe scans |
| `npm audit` and `npm audit --omit=dev` | Both reported zero known vulnerabilities |

### Known limits and hosting

Testing used local Windows, Chrome, MySQL and HTTPS. Live cPanel and Passenger compatibility remains unverified. Confirm the provider’s upload and request timeout settings, filesystem hard-link support, bandwidth, disk space and inode quotas before enabling large media uploads. The disk reading is for the filesystem volume. Check the hosting account’s separate quota with the provider.

The library serves pre-encoded variants. Technical inspection leaves MP3 or fragmented MP4 duration blank when it cannot determine it reliably. The file endpoint, headers and download behavior were checked for PDFs. Native PDF rendering remains unverified in headless Chrome. The library shows document metadata and a linked thumbnail when available. The upload form offers English, Pashto and Dari as content languages and preserves an existing asset’s other language code. Native-speaker editorial review and hands-on assistive-technology testing remain outstanding.

### Next recommended stage

Stage 6 covers course management and lesson learning and requires separate approval.

**STAGE 5 COMPLETED. I HAVE STOPPED WORKING. WAITING FOR YOUR APPROVAL BEFORE STARTING THE NEXT STAGE.**

## Stage 6 — Course management and lesson learning

**Completed on 26 November 2026.** Staff can build, review, publish and withdraw multilingual courses. Guests can find courses and study text, video, audio and PDF lessons without signing in.

### Implementation and user experience

- The course builder manages course details, taxonomy, translations, chapters, lessons, resources and related courses. Staff can use drag-and-drop or the keyboard-accessible reorder buttons and move lessons between chapters. Existing records retain their IDs when reordered. The existing review workflow takes a draft through educational review, optional translation review, approval and publication. Archives withdraw a course, and deletion requires confirmation.
- The public catalog supports search and filters for subject, education level and content language. Course details show the curriculum, objectives, requirements, available resources and published related courses when present. The learning view follows the saved order for previous and next navigation, shows the current position, and provides a collapsible curriculum. Learners can select a content language independently of the interface language.
- Video and audio load on request. Video can use existing quality variants, caption tracks, transcripts and alternate audio. PDF previews use a local viewer and provide page text when it can be extracted. Thumbnails are skipped on connections that report reduced data use. The new screens reuse the existing theme, RTL/LTR shell and keyboard components. Account sign-in, educational management and local media management continue through their existing routes. All 12 original design references matched their SHA-256 baseline.

### Files and database

| Area | Change |
| --- | --- |
| `server/src/modules/courses/` | Courses, translations, curriculum, resources, validation, public and administrator endpoints, and migration |
| `server/src/app.ts`, `server/src/index.ts`, `server/src/identity/cli.ts`, and `server/src/modules/education/store.ts` | Mount the course endpoints and migration, apply route-specific request limits, and reuse the public taxonomy visibility rule |
| `client/src/features/courses/admin/` and `client/src/features/courses/student/` | Course management, course builder, catalog, details, lesson pages and local PDF preview |
| `client/src/App.tsx`, admin and learner shells, and discovery navigation | Entry points from the existing application |
| Workspace manifests, `package-lock.json`, and `client/public/licenses/PDFjs-Apache-2.0.txt` | Pinned PDF.js dependency and license. Run integration test files sequentially because they share a schema and test database-wide media behavior |
| `server/tests/courses.integration.test.ts` and `server/tests/fixtures/media/lesson-handout.pdf` | Course validation and isolated MySQL regression coverage with an original handout |
| `README.md` and `docs/PROGRESS.md` | Operator instructions and stage report |

Additive migration `005-course-learning` created 9 InnoDB tables with 47 columns, 29 indexes and 36 constraints. The constraints include 20 foreign keys, 4 checks, 9 primary keys and 3 additional unique constraints. They cover translation uniqueness, curriculum ownership, lesson slugs, and resource links to existing media. Verified indexing for public course lookup, filters, and chapter and lesson order. Both built-in administrator roles receive `course:manage` and `course:publish`.

### Security and privacy

Course administration requires administrator session scope and `course:manage`. A separate `course:publish` grant controls publication and archiving. Writes verify the origin, JSON type and current record version. Course creation and updates accept up to 512 KiB after those request and permission checks. Guest endpoints return published content and omit admin identifiers, edit versions, storage details and other lesson bodies. Publishing keeps referenced media available, and inline or download actions follow the media permissions. Attachments require download permission because the media library serves them as downloads. Published media follows its own library status after a course is archived. Guests can study without identification, and learner activity and progress are ephemeral.

### Testing results

| Check | Result |
| --- | --- |
| `npm run lint`, `npm run typecheck`, and `git diff --check` | Passed |
| `npm test` against disposable MySQL 8.0.31 | 17 passed, 0 failed, 0 skipped. Covered the prior stages plus migrations, conflicting versions and concurrent saves, review permissions, published taxonomy visibility, course body limits, media guards, related content, and all four guest lesson API types |
| `npm run build` | Client and server passed. Two existing Zod annotation warnings and a nonfatal size warning for the optional PDF viewer appeared |
| Development and production starts | `npm run dev` served the app, proxied readiness and gave guest and protected route responses. The compiled `node app.js` ran behind a local HTTPS proxy. The migration CLI applied migration 005 on a fresh browser schema and reran successfully |
| Local HTTPS Chrome workflow | Signed in through the administrator UI, created a bilingual course, selected media and resources, reordered, reviewed and published it. As an anonymous guest, found it through the catalog, navigated all four lesson types, switched content language, sought a 360p video over HTTP 206, opened a transcript, rendered and read a PDF preview, and checked a permitted download. Verified guest withdrawal after archive and administrator deletion |
| Live responsive and accessibility checks | 120 route, viewport and language combinations and 30 automated axe scans, with zero violations reported. Covered catalog, details, lessons, administrator list and editor with English, Pashto and Dari across eight viewport sizes |
| Supplemental fixture-based Chrome checks | Learner views passed 120 layout checks and 24 axe scans. Administrator list, details and curriculum passed 72 layout checks and 18 axe scans. Supplemental flows exercised native drag ordering, cross-chapter moves, permission denial, stale editor recovery, empty and error states, a local PDF worker under CSP, and a 390 px throttled 3G Save-Data profile |
| `npm audit` and `npm audit --omit=dev` | Zero known vulnerabilities reported |

The integration files now run sequentially. A parallel run allowed the Stage 6 media fixtures to affect the existing Stage 5 database-wide storage usage assertion. The sequential run preserved that assertion and passed all tests. The disposable development server, production server, HTTPS proxy and MySQL instance were stopped and their temporary client credentials removed. No deployment was performed.

### Known issues and hosting

Live cPanel and Passenger behavior remains to be verified. The local test used Node 22.14.0, MySQL 8.0.31 and an HTTPS reverse proxy. Hosting needs the existing Node, MySQL and private storage setup, a proxy that permits the 512 KiB curriculum requests, and access to the PDF.js module worker in the Vite build. Apply the additive migration with the database and media backed up. The PDF viewer and worker download only when selected. PDF text depends on the document. Browser checks used Chrome. Native-speaker editorial review and manual assistive-technology checks remain outstanding. MySQL can roll back an overlapping write across courses if it detects a deadlock. The editor can retry the action.

### Next recommended stage

Stage 7 covers educational videos, Shorts and AI content and requires separate approval.

**STAGE 6 COMPLETED. I HAVE STOPPED WORKING. WAITING FOR YOUR APPROVAL BEFORE STARTING THE NEXT STAGE.**

## Stage 7 — Educational videos, Shorts, and AI content

**Completed on 26 November 2026.** The platform now offers free educational videos, a mobile Shorts feed, and a collection of AI-generated and AI-assisted materials that have been reviewed by people.

### Implementation and user experience

- The **Educational media** manager presents searchable and filterable entries for videos, Shorts and AI resources. Staff can select or privately preview local media, set a category, add translations, record AI provenance, and link a course and lesson. The workflow supports educational review, optional translation review, a recorded human approval, publication, archive and confirmed deletion.
- Guests can browse, search, filter and open videos, Shorts and the AI collection in English, Pashto and Dari. Learners can select the content language independently of the interface. Video details show the source, creator, license, related curriculum and AI disclosure where applicable. The player uses local pre-encoded qualities, audio-only files, captions and transcripts from the existing library.
- The Shorts feed displays one vertical item at a time. It supports touch swipe, keyboard and button navigation, explicit play and pause, mute and captions. Playback pauses outside the viewport or when the document is hidden. Other clips do not preload. Settings for limited connections use a smaller rendition when available and omit optional thumbnail requests.
- The React and Express entry points keep the existing session, course, taxonomy, media and design system behavior. Existing light, dark, RTL and LTR preferences apply to the new pages. The 12 original design reference images matched their recorded SHA-256 hashes.

### Files and database

| Area | Change |
| --- | --- |
| `server/src/modules/learning-media/` | Sequelize models, relational reads and writes, Joi validation, lifecycle, reviewer and AI provenance, migration, and administrator and guest APIs |
| `server/src/modules/media/{contract,store,routes}.ts` and `client/src/features/media/` | Apply and explain the education review hold during file publication |
| `server/src/app.ts`, `server/src/index.ts`, `server/src/identity/cli.ts`, `server/src/config/environment.ts`, `server/src/modules/courses/reader.ts`, and `.env.example` | Mount the new APIs and migration, configure the Shorts duration limit, and reuse Stage 6 public curriculum visibility |
| `client/src/features/learning-media/`, `client/src/App.tsx`, learner and admin shells, and discovery | Admin workspace, guest catalog, video details, Shorts, AI collection, responsive navigation and translations |
| `client/src/features/courses/student/LessonMedia.tsx` and related strings | Share the existing video, audio and resource player with the new guest pages |
| `server/tests/learning-media.integration.test.ts`, `server/tests/fixtures/media/portrait-short.mp4`, `README.md`, and `docs/PROGRESS.md` | MySQL integration coverage, synthetic 9:16 fixture, operational instructions and progress |

Migration `006-learning-media` adds the InnoDB tables `learning_media` and `learning_media_translations` with 24 columns, 12 indexes and 15 constraints. These include two primary keys, one additional unique constraint, eight foreign keys and four checks. It grants `learning-media:manage` and `learning-media:publish` to the built-in administrator and super administrator roles. File publication holds and published references use the existing media references table.

### Security and privacy

Administration requires an administrator session and the management permission. Approval, publication and archive require the separate publication permission. Working with draft files also requires the existing media management grant. The app holds a linked draft file and its direct derivatives private until approval. The review records the reviewer, time, note and expected file version. Editing the file invalidates approval for entry publication. Public responses expose reviewed items, valid related content and public rights information. Editorial notes, file storage paths and reviewer identifiers stay private. Guest browsing and playback require no account, and learner activity is ephemeral.

Publication, browsing and playback run on the existing same-origin server. AI materials are prepared offline and reviewed by staff. There are no service dependencies for generating AI content or serving videos.

### Testing results

| Check | Result |
| --- | --- |
| `npm run lint`, `npm run typecheck` and `git diff --check` | Passed |
| `npm test` with local isolated MySQL 8.0.31 | 19 passed, 0 failed, 0 skipped. Test coverage includes migration repeatability, bilingual queries, Short aspect and duration validation, role and origin checks, concurrent save conflicts, draft file and caption approval holds, media archive guards, AI attribution privacy, stale review rejection after a file version change, and related curriculum withdrawal |
| `npm run build` | Both workspaces passed. Vite reported the two existing upstream Zod annotation warnings and the existing optional PDF viewer size warning |
| `npm run dev` and compiled `node app.js` behind local HTTPS | Development proxy returned readiness, guest catalogs and protected route responses. Production CLI applied the migration to a fresh schema and reran it successfully. Compiled app verified public no-store responses and rejection of insecure administrator access |
| Live Chrome administrator-to-guest workflow | Authenticated staff created a bilingual AI-assisted video and a Short, privately previewed the draft file, reviewed entries, recorded required approval, and published. Guests exercised search, native 360p playback and seeking over HTTP 206, audio-only playback, captions, transcript, a related lesson and course, independent Dari content, and the AI illustration. The Shorts flow exercised 9:16 playback, touch swipe, keyboard, mute, captions, offscreen pause and active-file-only loading. Archive and confirmed deletion were verified |
| Live Chrome layout and accessibility | 168 checks across seven routes, all eight prescribed viewport sizes, and English, Pashto and Dari. Passed 42 automated WCAG axe scans with zero violations. Visually inspected a desktop video detail and dark mobile Dari Short |
| Supplemental Chrome with mocked API fixtures | Learner pages passed 120 responsive checks and 30 axe scans. Administrator pages passed 72 responsive checks and 18 axe scans. All reported zero violations. A 390 px emulated 3G profile with Save-Data requested the lowest linked Short rendition only after Play |
| `npm audit` and `npm audit --omit=dev` | Zero known vulnerabilities |

All disposable test services were stopped and their temporary connection credentials removed. Test content ran only in the isolated local schemas.

### Known issues and hosting

Live cPanel and Passenger remain unverified. Local tests used Node 22.14.0, MySQL 8.0.31 and an HTTPS reverse proxy. Stage 7 uses the existing Node, MySQL, disk and byte-range setup. It introduces no new package dependencies. Keep using off-server encoding and the configured media upload and storage limits. `SHORT_MAX_SECONDS` defaults to 90. Shorts that depend on camera rotation metadata or have no measurable duration may need re-encoding. Independently published media follows its own library status when an educational entry is archived. Native-speaker review and manual assistive-technology checks remain outstanding.

### Next recommended stage

Stage 8 covers the digital library and requires separate approval.

**STAGE 7 COMPLETED. I HAVE STOPPED WORKING. WAITING FOR YOUR APPROVAL BEFORE STARTING THE NEXT STAGE.**
