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

## Stage 8 — Digital library

**Completed on 26 November 2026.** Staff can upload, review, and publish multilingual book listings. Guests can browse the library and read published books for free in the browser.

### Implementation and user experience

- The book manager provides search, filters, and pagination. Editors can upload a PDF or cover directly from the form or choose existing media, privately preview draft files, and set the author, publisher, edition, year, PDF language, category, education level, and school grade. The review workflow records approval before publication and supports archive and confirmed deletion.
- The public library offers grid and list layouts, search by title or author, and filters by category, PDF language and education level. Book details include publication and licensing information, file size, and an explicit **Read online** action. The download action follows the PDF's media permission. Learners can select a description language separately from the interface and the PDF's language.
- The reader loads PDF.js and the book only when opened. It renders one page at a time and supports sequential and direct page navigation, Arabic and Western page digits, zoom, actual size, fit width, fullscreen or an expanded view, and selectable page text where available. The zoomed page scrolls within the reading area. [PDF.js document-loading options](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html)
- The new screens reuse the existing mobile, RTL, light and dark design and media upload workflow. The course and AI resource previews use the same local PDF worker and retain their smaller preview interface. All 12 original design references matched their SHA-256 baseline.

### Files and database

| Area | Change |
| --- | --- |
| `server/src/modules/books/` | Sequelize models, Joi validation, multilingual catalog search, review lifecycle and book APIs |
| `server/src/app.ts`, `server/src/index.ts`, `server/src/identity/cli.ts` | Mount the book routes, share the file streamer and include the Stage 8 migration |
| `server/src/modules/media/` | Apply the existing education review hold to a linked draft PDF and cover |
| `client/src/features/library/`, `client/src/App.tsx`, admin and learner shells, and discovery | Book editor and guest library, route links, translations and responsive styles |
| `client/src/features/pdf/openPdf.ts`, `client/src/features/courses/student/PdfPreview.tsx` | Share the same local PDF.js worker and document-opening settings |
| `server/tests/books.integration.test.ts`, `README.md`, `docs/PROGRESS.md` | Integration coverage, operator instructions and stage record |

Migration `007-digital-library` adds InnoDB tables `books` and `book_translations` with 28 columns, 13 indexes and 17 constraints. These include two primary keys, one additional unique constraint, ten foreign keys and four checks. The migration grants `book:manage` and `book:publish` to the built-in administrator and super administrator roles. The existing media references table records the book's review holds and protects published files.

### Security and privacy

The server checks administrator session scope and `book:manage` for all staff endpoints. Approval, publication and archive also require `book:publish`. Draft file access requires `media:manage`. Writes use the existing origin and version checks. Approval records the reviewer, note and expected versions of the PDF and cover. The public catalog omits staff review fields and internal PDF IDs. The inline file route checks current book publication before serving a full, partial or conditional response. Attachment requests require the PDF's download grant. Guest reading requires no account, and reader position stays in memory while the reader is open.

### Testing results

| Check | Result |
| --- | --- |
| `npm run lint`, `npm run typecheck` and `git diff --check` | Passed |
| `npm test` on disposable MySQL 8.0.31 | 21 passed, 0 failed, 0 skipped. Covered migration repeatability, normalized translations, rights and role checks, malformed upload rejection, PDF and cover review holds, re-review after a cover version change, publication, archive, inline and attachment headers, exact byte ranges, 416 responses and conditional requests |
| `npm run build` | Both workspaces built. Vite reported the two existing upstream Zod annotation warnings and the size warning for the lazy PDF.js code |
| `npm run dev` and compiled `node app.js` behind local HTTPS | Verified development proxy and direct routes, readiness, denied guest administration, no-store catalog metadata and refusal of insecure admin access. The migration CLI applied migration 007 to a fresh schema and reran successfully |
| Local HTTPS Chrome publication and reading | Exercised real in-editor PDF upload, draft preview, cover selection, bilingual metadata, approval, publication, catalog filters, grid/list switching and authorized attachment bytes. Read a 1,641-byte, one-page guide and a 27,199,432-byte, 48-page workbook. Verified separate page controls, invalid page handling, localized page entry, zoom, fit width, fullscreen, page text, HTTP 403 for a restricted attachment and withdrawal on archive. The 51 initial workbook range responses totaled 3,672,008 bytes |
| Live Chrome responsive and accessibility checks | 120 layout and direction checks across five routes, eight viewport sizes, and English, Pashto and Dari. All 30 automated WCAG axe scans reported zero violations. The production reader rendered both standard and embedded fonts under the same Content Security Policy |
| Supplemental Chrome fixture checks | Guest fixture tests passed 96 responsive checks and 24 automated axe scans. Administrator fixture tests passed 72 responsive checks and 18 scans. All reported zero violations. Exercises included in-editor cover upload, fallback fullscreen, low-data browsing, and the existing course PDF preview |
| `npm audit` and `npm audit --omit=dev` | Zero known vulnerabilities |

The PDF skill's `pdfinfo` and Poppler render checks confirmed both fixtures' page counts and dimensions. The one-page guide and the workbook's first and last pages were visually inspected. A visual check found gaps in PDF lettering on an RTL page. Setting the canvas direction independently of the translated interface restored the letter placement in the guide, workbook and embedded-font samples. Verified the fix visually under the production policy.

Test content and the database changes used isolated services. The services were stopped, temporary credentials cleared, and generated test documents removed.

### Known issues and hosting

Live cPanel, Passenger and cross-browser behavior remain unverified. The local test used Node 22.14.0, MySQL 8.0.31, Chrome and an HTTPS reverse proxy. Stage 8 uses the existing storage, upload limits and local PDF.js dependency. Hosting needs byte-range support and timeouts and request limits appropriate for the PDFs in the library. Text extraction depends on the document. The reader presents a read-only page view. Independently published files follow the media library's publication status after a book is archived. The existing administrator dialog library emits a browser warning for its blocked inline scroll-lock style. Dialog controls remained functional in Chrome. Native-speaker editorial review and manual assistive-technology checks remain outstanding.

### Next recommended stage

Stage 9 covers learning engagement and discovery and requires separate approval.

**STAGE 8 COMPLETED. I HAVE STOPPED WORKING. WAITING FOR YOUR APPROVAL BEFORE STARTING THE NEXT STAGE.**

## Stage 9 — Learning engagement and discovery

**Completed on 26 November 2026.** Guests can study published material, take a quiz, follow a learning path and browse recommendations. Saving progress on the device is optional.

### Implementation and preserved functionality

- **My learning**, **Saved resources** and **Settings** expose the opt-in and clear controls. The homepage shows resumable lessons, videos and reading when available and the configured Daily Learning activity. Course learners can see lesson completion and percentage, resume a lesson, and open its linked quizzes. Videos, Shorts and PDF reading retain their existing playback, permission and low-data controls.
- Staff can write and translate reusable questions and explanations, attach and order them in quizzes, choose a passing score and move quizzes through review and publication. Guests receive scores and explanations after submission and can retake quizzes. Whole-number scores round down and multiple-answer questions require the complete correct set.
- Free completion certificates require all currently published lessons. Learners can choose from two templates, enter an optional name, and print or save a PDF. Public verification is separately opt-in and uses a random receipt code.
- Learning paths contain ordered courses, lessons, videos, Shorts, books or quizzes. A learner who enables device learning can see path progress. Staff can switch Daily Learning between automatic rotation, a curated rotation and off. Rotation uses the Kabul calendar date.
- Global search covers published courses, lessons, videos, Shorts, books, AI learning, subjects, categories, paths and quizzes. It provides debounced suggestions, language and taxonomy filters, keyboard access and pagination. Related items use the source's published subject and category, with level and grade as ranking signals. The page does not use learner history for recommendations.
- The new screens use the existing design system and the English, Pashto and Dari interface settings. All 12 original visual references match their SHA-256 baseline.

### Files and database

| Area | Changes |
| --- | --- |
| `client/src/features/engagement/` and the course, lesson, media and PDF reader entry points | Opt-in browser progress, bookmarks, history, resume controls and certificates |
| `client/src/features/quizzes/`, `client/src/features/discovery/`, the homepage and both navigation shells | Staff and guest quizzes, paths, daily settings, search, related items and localized responsive UI |
| `server/src/modules/quizzes/`, `server/src/modules/discovery/`, `server/src/modules/certificates/` | Validation, publication, scoring, MySQL search and receipt verification |
| `server/src/app.ts`, `server/src/index.ts`, `server/src/identity/cli.ts` | Same-origin v1 API wiring and migration entry point |
| `server/tests/engagement.test.ts`, `server/tests/engagement.integration.test.ts`, `README.md`, `docs/PROGRESS.md` | Regression coverage, setup and stage record |

The CLI applies three additive migrations. `008-quizzes` adds eight tables for quizzes, the question bank, translations, answer keys and quiz ordering. `009-discovery` adds four tables for paths, translations, ordered activities and daily settings. `010-certificates` adds one table for opted-in verification receipts. The quiz and discovery migrations grant management and publication permissions to the built-in administrator roles. Learner progress, bookmarks and quiz attempts require no server tables.

### Security and privacy

Guest learning requires no account. The shared-device warning precedes opt-in. When enabled, this browser stores the completed lesson IDs, positions, bookmarks and quiz score summaries. The clear action removes these. Submitted answers go to the same-origin grader and are excluded from browser learning storage and application logs. Staff mutations use server-side permission, version and origin checks. Quiz answers are omitted from the public pre-attempt API. The certificate name stays in page memory. An optional verification record contains a code, course, locale and issuance timestamp, and the public API requires the exact code. Application API responses use `Cache-Control: no-store`.

### Verification

| Check | Result |
| --- | --- |
| `npm run lint`, `npm run typecheck`, `git diff --check` | Passed |
| `npm test` on isolated MySQL 8.0.31 | 26 passed, 0 failed, 0 skipped. Added tests for course completion set membership, scoring and passing thresholds, translated short answers, no answer disclosure before submission, role and origin checks, curriculum changes, search normalization and pagination, ordered paths, daily curation and certificate privacy |
| `npm run build` | Both workspaces built. Vite reported upstream Zod annotation notices and large chunks for the application and the lazy PDF reader |
| `npm run dev` and compiled `node app.js` behind a local HTTPS gateway | Vite served the search route and proxied readiness and search. The compiled application served the new deep links and v1 APIs. The migration CLI succeeded on a fresh fixture schema and reran successfully |
| Chrome guest flow on local HTTPS | Exercised opt-in, lesson completion and resume, saved resources, video position, two-page PDF resume, quiz validation and retake, quiz summaries, path progress, Daily Learning, the global keyboard shortcut, suggestions, Dari search filters, empty search, certificate verification and local clearing. Simulated an API failure and verified the search loading state, error message and live retry. No runtime JavaScript errors or cross-origin requests appeared in that guest flow |
| Chrome staff flow on local HTTPS | Created a bank question and a quiz through the editor, selected an existing question, created an ordered path from published content and changed Daily Learning settings |
| Responsive and automated accessibility | 192 dark-mode combinations across eight routes, eight viewport sizes and all three interface locales. All 21 axe scans passed for the seven checked learner surfaces in English, Pashto and Dari |
| Certificate print and PDF | Chrome exported both templates. Poppler and pypdf confirmed one landscape A4 page per template. The rendered pages and expected text were inspected, including the distinct verification label |
| `npm audit --omit=dev` | Reported 0 known runtime vulnerabilities |

An initial MySQL run exposed a reused Sequelize column definition during question creation and excessive search planning time. Corrected the model definitions and bounded the search statement's optimizer work. The full suite passed after the timed-out fixture query was closed. [MySQL optimizer hints](https://dev.mysql.com/doc/refman/8.4/en/optimizer-hints.html)

Fixtures used separate integration and browser schemas. The development server, compiled app, HTTPS gateway and MySQL instance were stopped. The loopback ports were verified closed and temporary credentials and print fixtures were removed.

### Hosting and limitations

The stage uses Node 22.14.0, MySQL 8, same-origin hosting and the existing private storage model. It adds no runtime package or external service. Live cPanel and Passenger, production-volume search performance, cross-browser behavior, native-speaker review and manual assistive-technology testing remain unverified. Review the host's MySQL limits and apply the migration CLI with a backup before a future authorized deployment.

Learning data is browser-specific. Clearing it leaves opted-in certificate verification records in place. Certificates document self-reported course completion using the date the receipt was issued. Printing and PDF saving use the browser.

### Next stage

Stage 10, complete homepage and multilingual experience, requires separate approval.

**STAGE 9 COMPLETED. I HAVE STOPPED WORKING. WAITING FOR YOUR APPROVAL BEFORE STARTING THE NEXT STAGE.**

## Stage 10 — Complete homepage and multilingual experience

**Completed on 26 November 2026.** The womenriseafg homepage now brings together published resources and lets administrators manage its sections, branding and announcements.

### Implementation and preserved functionality

- The compact hero and Start Learning action lead to the public courses. The homepage supports Continue Learning, Browse by Subject, Featured Courses, Popular Courses, Recommended Courses, latest videos, Shorts, recommended books, AI educational lessons, learning paths, Daily Learning, recently added resources, the mission and footer. Optional sections appear when enabled and populated.
- Staff can reorder sections by dragging or with labeled move buttons, hide sections, select published courses and books, and manage multilingual announcements. Branding settings control the platform name, logo, browser icon, slogan and mission. The shell and browser titles use the configured name.
- Popular courses use actual aggregate course opens. Course suggestions use subject, category and level. Featured courses and selected books follow staff ordering. Recently added resources use published catalog data. Explore and its legacy subject links lead to live subject-filtered search.
- The interface, navigation, settings and available-translation notices are in English, Pashto and Dari. Catalog and search filters are independent of the interface language. Pashto and Dari use RTL layouts, and English uses LTR. Cards identify preview and PDF languages separately. Changing the interface language during a quiz preserves the attempt's selected question language.
- The homepage reuses the existing visual system and local hero illustration. It uses compact cards on mobile and lazy-loads published thumbnails. All 12 original design references matched the SHA-256 baseline. Guest learning, access checks, media permissions, opt-in progress and certificates were exercised during verification.
- The old subject-outline preview, downloads placeholder and obsolete navigation-search styling were removed. The component library remains available in administration.

### Files and database

| Area | Changes |
| --- | --- |
| `client/src/features/homepage/` | Published homepage cards, content-language control, low-data hero, announcements, branding provider and staff settings |
| `client/src/features/discover/`, both navigation shells, `client/src/App.tsx` and `client/src/main.tsx` | Live subject navigation, homepage and editor entry points, responsive footer, browser branding and removal of previews |
| Course, lesson, media, book, quiz and discovery client modules | Language labels and filtering, RTL/LTR presentation, consistent fallback and course-open measurement |
| `server/src/modules/homepage/`, `server/src/app.ts`, `server/src/index.ts`, `server/src/identity/cli.ts` | Homepage data, versioned configuration, count collection, permission and migration wiring |
| `server/src/modules/discovery/` and the quiz reader | Content-language matching, preferred-language ranking and multilingual normalization |
| `server/tests/homepage.test.ts`, `server/tests/homepage.integration.test.ts`, `server/tests/engagement.integration.test.ts`, `README.md` and `docs/PROGRESS.md` | Regression coverage, operator instructions and stage record |

Migration `011-homepage` adds InnoDB tables `homepage_settings` and `homepage_course_opens`. The settings table uses a singleton primary key, JSON-object constraint and modification version. The totals table uses a course primary key and foreign key, a positive-count constraint and an index for ranking by opens. The migration grants `homepage:manage` to the built-in administrator roles and seeds the default branding and section order.

### Security and privacy

Homepage configuration writes require an administrator session, homepage permission, an allowed origin, valid JSON and the current version. The server validates that selected content and images are published and rechecks their visibility when serving the homepage. The public API uses `Cache-Control: no-store`. The course-open signal omits credentials and sends only the published course code. The database retains the course ID and its cumulative total. The public feed exposes ranking order. It omits raw counts and learner data. Settings describes course-open measurement in all three interface languages.

### Verification

| Check | Result |
| --- | --- |
| `npm run lint`, `npm run typecheck`, `git diff --check` | Passed |
| `npm test` with `WOMENRISEAFG_IDENTITY_TEST=1` on disposable MySQL 8.0.31 | 29 passed, 0 failed, 0 skipped. Covered repeatable migrations, permissions, origin and version checks, published-only panels and brand assets, atomic course-open totals, Arabic-script normalization, strict language filtering and language preference |
| `npm run build` | Both workspaces built. Vite emitted two upstream Zod annotation notices and bundle-size warnings for the main client and lazy PDF reader |
| `npm run dev`, migration CLI and compiled `node app.js` behind local HTTPS | The frontend, readiness and homepage API responded. The CLI applied migration 011 to a fresh browser schema and reran successfully. The public endpoint returned no-store data, and guest access to homepage management returned HTTP 401 |
| Chrome staff and guest flows on the compiled site | Verified published logo and favicon selection, slogan and name changes, featured course and book selection, three-language announcements, section reorder and hide, public rendering and ranking from real browser opens. Confirmed an English course in a Pashto interface and exercised Pashto and Dari search |
| Chrome homepage states | Verified loading, simulated service failure and live retry, empty-language reset, low-data mode without the decorative hero image, live subject redirects and opt-in resume. The guest flow made no cross-origin requests and loaded no audio or video on the homepage |
| Chrome multilingual and responsive checks | 141 route and viewport checks spanning major guest and staff pages. 24 additional homepage checks across eight viewport sizes and three locales. Verified RTL/LTR direction, mobile drawer keyboard handling and Start Learning above the first screen |
| Automated accessibility | 15 axe scans on the compiled learner site passed. An additional editor harness with simulated API responses passed 36 layout checks and 12 axe scans across all three languages. The harness also exercised pointer and keyboard reorder and stale-edit recovery |
| Translation coverage | Checked matching keys and interpolation placeholders in 14 static bundles with 1,234 source messages, including both new homepage bundles |
| `npm audit --omit=dev` | Reported zero known runtime vulnerabilities |

Browser QA exposed a layout issue when a desktop section contained one card. Bounded the artwork and kept the card in a regular column. Rechecked it visually in English on desktop and Dari on mobile. The test services used separate private integration and browser schemas. The development instance, compiled application, HTTPS gateway and MySQL were stopped. The loopback ports were verified closed and temporary credentials removed.

### Hosting and known limits

The stage uses the existing Node, MySQL, same-origin API and local media setup. It introduces no runtime package dependency or third-party analytics service. Popularity counts cumulative opens, including repeat visits to a course. Live cPanel and Passenger deployment, production-load measurements, browsers beyond Chrome, manual assistive-technology testing and native-speaker editorial review remain unverified.

### Next stage

Stage 11 covers PWA, offline learning, and performance. It requires separate approval.

**STAGE 10 COMPLETED. I HAVE STOPPED WORKING. WAITING FOR YOUR APPROVAL BEFORE STARTING THE NEXT STAGE.**

## Stage 11 — PWA, offline learning, and performance

**Completed on 26 November 2026.** Learners can enable offline access, save individual lessons and permitted files, and open or clear those copies while disconnected. Installation is optional.

### Implementation and preserved functionality

- Vite PWA and Workbox provide a manifest, app icons, an explicitly enabled app shell, and an offline fallback in English, Pashto, and Dari. The fallback opens Downloads. Guest learning and the published online catalogs continue to work.
- Learners can save lesson text and selected files with valid download permissions. Downloads shows transfer progress, cancellation, device storage estimates and saved copies. The app opens local PDF copies through the browser or exports them. Video and audio play from the local copy.
- Shared-device controls can clear downloads, learning progress, bookmarks, display preferences, data-saving preferences, and the app-managed offline cache. Learners can also remove individual items or clear downloads alone. The confirmation directs them to browser and device controls for installed apps, history and exports.
- The localized data-saving setting supports automatic, always-on and off. It omits decorative images and thumbnails, reduces animation, prefers the lowest prepared video variant, and prioritizes audio-only playback where available. Learners start media explicitly. Transcripts and known file sizes remain available.
- Homepage, Explore and Daily Learning load on demand. The mobile hero uses a 19,982-byte responsive image alongside the 72,866-byte full image. Homepage reads reuse a matching Daily Learning card and index translated taxonomy labels once per response. All 12 original design references matched their SHA-256 baseline.

### Files and database

| Area | Changes |
| --- | --- |
| `client/src/sw.ts`, `client/src/features/pwa/` and public icons and fallback | Explicit offline shell setup, optional installation, localized fallback and cache recovery |
| `client/vite.config.ts`, package manifests and lockfile | Vite PWA, Workbox, static-shell selection and Brotli and gzip build output |
| `client/src/features/offline/`, learner navigation, Settings and lesson, media and book entry points | IndexedDB records, progress, cancellation, permission-checked save actions, local playback and shared-device clearing |
| `client/src/features/data-saving/`, homepage, media players and covers | Localized settings, lower-bandwidth playback, lazy routes and responsive art |
| `server/src/app.ts`, homepage reader and store, and `server/tests/foundation.test.ts` | Static compression and caching, private navigation protection, and focused read optimization |
| `README.md` and `docs/PROGRESS.md` | Operating instructions and verification record |

IndexedDB stores summaries, file contents and transactional download reservations in the browser. MySQL requires no Stage 11 migration. The same-origin site uses the existing local media storage and publication controls.

### Security and privacy

The worker allowlists the public application files and localized fallback. API, account, administrator and private responses stay out of CacheStorage. Fingerprinted assets are immutable, the worker and manifest revalidate, and protected pages and APIs use no-store. Downloads use the existing permission-checked same-origin attachment routes with credentials and referrers omitted. Responses must be valid attachments with an allowed media type. Cancelled, interrupted or quota-failed transfers leave partial files out of the saved list. Clearing invalidates pending writes across tabs. Storage estimates are approximate and the browser can evict local data. [MDN StorageManager estimate](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate)

### Verification

| Check | Result |
| --- | --- |
| `npm run lint`, `npm run typecheck`, `git diff --check` | Passed |
| `npm test` on isolated MySQL 8.0.31 | 31 passed, 0 failed, 0 skipped. Included static cache headers, compressed representations, private navigation and media range behavior |
| `npm run build` | Both workspaces built. Vite PWA emitted 20 allowlisted app-shell entries totaling 950.26 KiB decoded. Vite reported upstream Zod annotation notices and bundle-size warnings |
| `npm run dev` and compiled `node app.js` on local HTTPS | Vite served Downloads and proxied API readiness. The compiled site served its worker, manifest and offline routes. The main script transfer was 177,559 bytes with Brotli and 569,888 bytes with identity encoding. Worker revalidation and no-store account and API headers were verified |
| Chrome guest journey on compiled HTTPS | Verified opt-in, restricted-file denial, saving a lesson, PDF and video, cold offline navigation and reload, PDF export bytes, offline video seeking, cross-tab deletion, reconnect, a user-triggered simulated install event, clearing while offline and a quota check that prevented transfer |
| Focused Chromium storage and worker checks | Verified empty startup, streaming progress, interrupted transfer and retry, quota rollback, redirect and foreign-route rejection, concurrent writes and clears, cache privacy and recovery after cache eviction |
| Localized responsive and accessibility checks | 24 Downloads layouts across eight viewport sizes and three locales, nine axe scans for Downloads and Settings, and three localized cold offline fallbacks passed |
| `npm audit` and `npm audit --omit=dev` | Both reported zero known vulnerabilities |

The cold Chrome mobile test used a 390 × 844 viewport, 200 ms latency, 200 KiB/s download, 90 KiB/s upload, and 4× CPU throttling. With the HTTP cache disabled and the worker bypassed, data saving reduced transfer from 503,667 to 482,976 bytes and LCP from 3.192 to 2.784 seconds. Reserving homepage height reduced measured CLS from 0.233 to 0.092. These are local laboratory measurements. [Chrome DevTools network throttling](https://developer.chrome.com/docs/devtools/network/reference)

The development server, compiled application, HTTPS gateway, and isolated MySQL instance were stopped. Their loopback ports were verified closed and temporary credentials removed.

### Hosting and known limits

The built site uses the existing single-host Node and MySQL architecture. Deploy the manifest, worker, fallback, hashed assets and compressed variants together. The worker needs a secure browser context. Downloads are capped at 128 MiB per file, 384 MiB total and 512 entries, subject to available browser storage. Live cPanel and Passenger deployment, native installation on an end-user device, browsers beyond Chrome and performance under live traffic remain unverified. The existing dialog library emits a blocked scroll-lock style warning under the production policy. The tested dialogs operated normally. [MDN Using Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)

### Next stage

Stage 12 covers security, privacy, accessibility, and quality assurance. It requires separate approval.

**STAGE 11 COMPLETED. I HAVE STOPPED WORKING. WAITING FOR YOUR APPROVAL BEFORE STARTING THE NEXT STAGE.**


## Stage 12 — Security, privacy, accessibility, and quality assurance

**Completed on 26 November 2026.** Stage 12 reviewed and hardened the existing platform. Free guest learning, optional learner accounts, restricted administration, content review, independent interface and content languages, and opt-in local learning were exercised with isolated fixtures.

### Security and privacy

- The production static server now allowlists public build assets. Regression coverage checks that licence notices, generated scripts and media assets remain available and that unexpected backups, source maps and internal build metadata return 404.
- Account, administrator, certificate and local-learning pages use `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow`. The content security policy restricts workers to the site's own origin and blocks frames. Browser-side Zod validation uses its standard parser, so strict CSP can stay enabled without a runtime code-generation exception. [Zod compilation documentation](https://zod.dev/compile)
- Same-origin logout expires the browser credential even if the database cannot complete revocation. A locked transaction reads and revokes the session, so concurrent logout requests emit one successful administrator audit entry. The API rejects incomplete Unicode characters before hashing passwords. The administrator CLI validates UTF-8 input and usernames before hashing or normalization. [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- Reviewed server-side administrator grants, validated inputs, bound SQL parameters, session expiry, origin and content-type checks, request-size and credential limits, publication and file permissions, and logging. Tests verified secure HTTP-only session cookies, anonymous access to published content, learner denial from administrator APIs, and omission of query values, cookies, referrers and bodies from request logs. [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)

### Accessibility and learner experience

- Shared dialogs use native modality and stylesheet-based scroll locking. They keep focus inside while open, return focus to the trigger on close, and focus the main landmark if an administrator action removes the trigger. Select controls have explicit labels, mobile navigation leaves focused controls visible, and the desktop breadcrumb divider mirrors in RTL.
- Downloads checks the complete public offline shell and offers to restore missing files when the browser evicts part of it. Browser verification covered partial and full eviction, explicit opt-in, cold offline navigation, saved video playback and PDF export, and local data clearing across reloads.
- Verified the original 12 design reference files against their SHA-256 baseline. The accessibility review used WCAG 2.2 AA as its target. [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

### Files and database

| Area | Files |
| --- | --- |
| Production HTTP policy and regression coverage | `server/src/app.ts`, `server/tests/foundation.test.ts` |
| Session and password handling | `server/src/identity/cli.ts`, `server/src/identity/store.ts`, `server/src/modules/auth/credentials.ts`, `server/src/modules/auth/routes.ts`, `server/tests/identity.integration.test.ts` |
| Keyboard and accessible controls | `client/src/components/ui/Primitives.tsx`, `client/src/components/ui/primitives.css`, `client/src/layouts/StudentLayout.tsx`, `client/src/layouts/shell.css`, `client/src/features/admin/admin.css`, `client/src/styles.css` |
| CSP-compatible validation | `client/src/validation.ts`, `client/src/features/auth/AuthPages.tsx`, `client/src/features/auth/api.ts`, `client/src/features/engagement/local.ts`, `client/src/features/media/MediaUpload.tsx` |
| Offline shell integrity | `client/src/sw.ts`, `client/src/features/pwa/shell.ts` |
| Dependencies and operating notes | `client/package.json`, `package-lock.json`, `README.md`, `docs/PROGRESS.md` |

Stage 12 requires no MySQL migration or IndexedDB upgrade. The existing MySQL migrations applied successfully and reported current on rerun. Server updates and browser checks used synthetic data on isolated MySQL 8.0.31 and private local storage. Removed the unused Radix dialog dependency from the client.

### Verification

The commands below ran from the repository in Node 22.14.0 with npm 11.21.3. `$work` refers to the chat's private scratch directory, which held the Chrome harnesses and disposable data.

| Check | Result |
| --- | --- |
| `npm run lint`, `npm run typecheck`, `git diff --check` | Passed. |
| `npm test` with `WOMENRISEAFG_IDENTITY_TEST=1` and the isolated MySQL connection | 35 passed, 0 failed, 0 skipped. Covered validation, permissions, log redaction, session lifecycle and concurrency, published catalogs, uploads, media rights, ranges and quiz grading. Separate CLI probes passed for malformed UTF-8 and out-of-policy usernames. |
| `npm run build`, `npm run dev`, and `node app.js` through a local HTTPS gateway | Both workspaces built. Dev HTML and proxied readiness returned 200. The production entry passed readiness and served the compiled site. Workbox emitted 20 approved precache entries totaling 931.58 KiB. |
| `node $work/stage12-identity-browser.cjs` | Chrome verified guest learning, learner registration, generic failed sign-in, valid Unicode sign-in, secure cookie settings, administrative denial and logout under the production CSP. |
| `node $work/stage12-learner-flow.cjs` and `node $work/stage12-state-check.cjs` | Verified progress opt-in and clearing, continue learning, bookmarks, all four quiz question types, retake, path completion, video seeking and resume, loaded caption cues and transcript, PDF reading and resume, both certificate layouts and verification privacy, and search loading, empty, error and retry states. |
| `node $work/stage12-links.cjs` and `node $work/stage12-cache-check.cjs` | Verified 30 homepage destinations, 86 public build files, three manifest icons, Daily Learning navigation and expected 401 and 404 responses. The main script was 171,488 bytes with Brotli and 550,327 bytes with identity encoding. The worker revalidated and private HTML and API responses used no-store. |
| `node $work/stage12-offline-flow.cjs`, `node --import tsx $work/stage12-pwa-integrity.cjs` and `node $work/stage11-offline-store.cjs` | Verified permissions, transfers and quota rollback, cold offline reloads and deep links, partial and full shell repair, private route exclusions, media playback and export, cross-tab removal and clearing, retry and reconnect. Installation support used a simulated Chrome install prompt. |
| `node $work/stage12-multilingual-browser.cjs`, `node $work/stage12-browser-layout.cjs`, `node $work/stage12-shared-a11y.cjs`, and `node $work/stage12-drawers.cjs` | 144 route checks, 24 homepage and 24 Downloads viewport checks, three localized offline fallbacks, and 45 axe scans with zero violations on tested states. Keyboard checks verified skip navigation, focus on mobile, modal naming and closure, RTL drawers and focus after an administrator form refresh. The drawer harness used intercepted administrator responses. |
| `npm audit` and `npm audit --omit=dev` | Both reported zero known vulnerabilities at the time of the check. |

The cold Chrome mobile benchmark (`node $work/stage12-mobile-performance.cjs`) used a 390 × 844 viewport, 200 ms network latency, 200 KiB/s download, 90 KiB/s upload, and 4× CPU throttling. With the browser cache disabled and the worker bypassed, data-saving mode reduced transfer from 497,818 to 477,127 bytes and measured LCP from 3.244 to 2.972 seconds. Measured CLS was 0.092 in both modes. These single-run laboratory figures describe the test fixture. The Vite build still reports upstream Zod annotation notices and bundle-size warnings.

The development server, compiled app, HTTPS gateway and isolated MySQL instance were stopped. Their loopback ports were verified closed and temporary credentials were removed.

### Hosting and verification limits

The tested production build uses the existing same-origin Node and MySQL architecture. Live cPanel and Passenger deployment, proxy behavior under the hosting provider, performance under live traffic, other browser engines, native installation on a physical device, and screen-reader testing remain unverified. Full WCAG conformance requires broader manual verification. The existing credential limit operates per source IP and per Node worker. Upload checks validate supported formats and publication still requires human review.

### Next stage

Stage 13 covers shared hosting deployment preparation. It requires separate owner approval.

**STAGE 12 COMPLETED. I HAVE STOPPED WORKING. WAITING FOR YOUR APPROVAL BEFORE STARTING THE NEXT STAGE.**


## Stage 13 — Shared hosting deployment preparation

**Completed on 26 November 2026.** The release archive and cPanel runbook are ready for the hosting plan review. Provider and plan confirmation remain pending. All execution used local, isolated fixtures.

### Implementation and preserved functionality

- `npm run package:deployment -- /absolute/private/path/womenriseafg-deployment.tar.gz` builds into fresh temporary directories, checks the frontend output against the same public asset rules used by Express, and creates a release archive with a SHA-256 digest. The archive contains `app.js`, compiled client and server, package manifests and lockfile, configuration template, and the deployment runbook. Source, test fixtures, build metadata, credentials, database dumps, uploads and installed packages stay outside the archive.
- The production entry still serves the React site, Express API and permission-checked media on one origin. It recognizes the native Passenger loader and its private Unix socket and uses Passenger's authenticated HTTPS and client-address metadata. The explicitly configured TCP proxy path also passed. Ordinary forwarding headers do not grant HTTPS status in Passenger mode. [Passenger reverse port binding](https://www.phusionpassenger.com/docs/advanced_guides/in_depth/node/reverse_port_binding.html) · [Passenger secure HTTP headers](https://www.phusionpassenger.com/docs/advanced_guides/in_depth/node/secure_http_headers.html)
- The cPanel runbook covers setup and provider checks, the HTTPS origin and Apache routing, private storage and permissions, MySQL users and migration, administrator bootstrap, cron and restart, staged verification, backup and restore, upgrading, rollback and troubleshooting. [cPanel Application Manager](https://docs.cpanel.net/cpanel/software/application-manager/)

### Release

| Check | Result |
| --- | --- |
| Filename | `womenriseafg-stage-13-deployment.tar.gz` |
| Archive size | 3,535,719 bytes |
| SHA-256 | `a696e1a5a2572bc30d2ecc538b35b03db522310872a6bea943d4d6c35851ebcb` |
| Contents | 325 archive entries including directories, with 86 public build files and the associated compressed variants |
| Host install | `npm ci --omit=dev --ignore-scripts --workspace @womenriseafg/server` |

### Files, database and interface

| Files | Change |
| --- | --- |
| `scripts/package-deployment.mjs`, `package.json`, `eslint.config.mjs` | Release command, clean compilation, archive validation and checksum |
| `client/vite.config.ts` | Resolve the PWA manifest from the actual chosen build directory |
| `server/src/app.ts`, `server/src/config/staticAssets.ts`, `server/src/index.ts` | Shared public asset policy and native Passenger transport while retaining TCP support |
| `server/tests/transport.test.ts` | Passenger IPC and trusted TCP transport regression tests |
| `docs/DEPLOYMENT.md`, `README.md`, `docs/PROGRESS.md` | Hosting runbook, operating instructions and this verification record |

The release uses the existing MySQL schema, browser storage format and interface. The existing migrations ran with a separate migration user, then reported current on rerun. A DML-only runtime user started the application. The extracted release preserved free guest learning, published content and media rights, keyboard navigation and opt-in offline features in local checks. All 12 original design references matched their SHA-256 baseline.

### Testing results

The local build, tests and production install used Node 22.14.0 and npm 11.21.3. `$work` denotes the private scratch directory containing test harnesses and synthetic data.

| Check | Result |
| --- | --- |
| `npm run lint`, `npm run typecheck`, `npm run build`, `git diff --check` | Passed. The client built with 20 Workbox precache entries. |
| `npm test` with `WOMENRISEAFG_IDENTITY_TEST=1` and isolated MySQL 8.0.31 | 38 passed, zero failures and zero skips, including three transport tests. |
| `npm run package:deployment`, `tar -tzf`, `tar -xzf`, and locked server workspace install | Passed. Inspected archive contents and verified the digest of the delivered copy. The install added 127 packages on Windows and Linux. |
| `npm audit`, `npm audit --omit=dev`, and production server workspace audit | Zero known vulnerabilities in each run. |
| `npm run dev` and `node $work/stage13-production.cjs` | Development HTML and proxied readiness returned 200. The extracted release ran migrations, bootstrapped the test administrator and restarted on local HTTPS with persistent MySQL and media. |
| `node $work/stage13-links.cjs` and `node $work/stage13-cache-check.cjs` | Verified 30 homepage destinations, 86 public build files, three manifest icons, SPA fallback, expected 401 and 404 responses, compressed JavaScript, worker revalidation and private route no-store headers. |
| `node $work/stage13-learner-flow.cjs` and `node $work/stage13-offline-flow.cjs` | Chrome verified guest lessons, video and PDF progress, captions and transcript, quiz scoring, certificate privacy, offline opt-in, saves and clearing, download permissions and cold offline playback. |
| `node $work/stage13-backup-restore.cjs` and `node $work/stage13-restored-smoke.cjs` | Logical MySQL export and media archive restored to independent empty locations. All 41 table counts and checksums and all nine media SHA-256 hashes matched. The restored app returned 200 readiness and served the exact requested video bytes with HTTP 206. |
| `npm run auth:purge-sessions` and `node $work/stage13-maintenance.cjs` | The extracted CLI ran successfully. In the restored fixture it removed an expired session and preserved an active one. Eight Bash runbook snippets and the cron command passed syntax checks. |
| `stage13-linux-package.sh` via WSL Ubuntu 22.04.5 | Installed and ran the exact archive with Ubuntu's Passenger 6.0.10 Node loader and the verified Linux Node binary. Confirmed Unix-socket bootstrap, health, safe readiness failure without a database, SPA fallback, worker revalidation, protected headers and distinct client-address rate buckets. Apache integration was outside this local loader test. |

The development and production processes and the local database were stopped. Temporary credentials and the test TLS private key were removed.

### Hosting compatibility and remaining checks

Confirm the selected plan's Node and Passenger versions, MySQL features and grants, Apache and HTTPS behavior, local streaming permission and byte-range behavior, CPU and RAM limits, upload and request limits, disk and inode quotas, bandwidth, scheduled jobs, and backup and restore support. The runbook lists the evidence to obtain for each item. A local Passenger loader check cannot replace an authorized test on that host.

The build reports existing Zod annotation and bundle-size notices. The staged client build also reports that its fresh output directory is outside the project root. The locked install reports an existing transitive `dottie` deprecation. During a native Passenger restart, a protected request still draining after listener closure can be denied. The runbook uses a maintenance window for release changes.

### Next stage

Stage 14 is the final production readiness review. It requires separate owner approval.

**STAGE 13 COMPLETED. I HAVE STOPPED WORKING. WAITING FOR YOUR APPROVAL BEFORE STARTING THE NEXT STAGE.**


## Stage 14 — Final production readiness review

**Review completed on 26 November 2026. Production approval remains pending.** The [requirements traceability report](READINESS.md) maps the master brief to implementation, verification and open items. Stage 14 changed `docs/READINESS.md`, `README.md` and this progress record. The existing interface, runtime code, schema and release package remain in use.

### Verification

- `npm run lint`, `npm run typecheck`, `npm run build` and `git diff --check` passed. `npm audit` and `npm audit --omit=dev` reported zero known vulnerabilities.
- `npm test` ran with `WOMENRISEAFG_IDENTITY_TEST=1` on isolated MySQL 8.0.31. All 38 tests passed with zero skips. The schema contained 41 InnoDB tables and 11 migration records. Separate migration and DML users worked.
- `npm run package:deployment`, extraction and locked server install passed. All 300 files matched the Stage 13 delivery by relative path and SHA-256. Development and extracted production startup passed, including local HTTPS, migrations and administrator bootstrap.
- Chrome verified guest and account flows, authoring through real administrator forms, permission-checked media, captions/transcripts, PDF, quizzes, paths, certificates, cache and offline workflows. The browser matrix ran 288 route checks, 48 homepage and 24 Downloads layouts, three localized offline fallbacks, and 69 scoped axe scans with zero violations. Firefox passed 30 localized route and viewport checks, PDF and video smoke, and an offline reload. The translation audit matched 17 bundles and 1,392 messages. All 12 design reference hashes matched.
- Three completed `stage14-mobile-performance.cjs` pairs measured 497,818 versus 477,127 bytes and median LCP of 3.252 versus 2.844 seconds for standard and data-saving mode. Measured CLS was 0.092. One earlier throttled run timed out. See the report for the full method, ranges and limits. [Core Web Vitals](https://web.dev/articles/vitals)

The local test processes stopped and temporary credentials were removed.

### Release approval

The hosting plan, live edge behavior and quotas remain unverified. Approved courses and media, publication rights and native-speaker review are pending. The report records incomplete administration, contributor assignment, content provenance, privacy retention, correction reporting and manual accessibility checks. The master brief has no stage after Stage 14. Further scope requires separate owner approval.

**STAGE 14 COMPLETED. I HAVE STOPPED WORKING. WAITING FOR YOUR APPROVAL BEFORE STARTING THE NEXT STAGE.**


## Readiness follow-up — Owner-authorized completion work

**Local implementation and verification completed on 26 November 2026.** The owner will handle hosting and approved launch materials. The [follow-up report](READINESS-FOLLOW-UP.md) records the changes, archive checksum and verification limits.

Delivered scoped staff roles and course assignments, published collections, image and inline quiz lessons, authoring provenance, localized illustration text, anonymous corrections and privacy guidance, certificate settings and verification withdrawal, owner operations, a site appearance default and current-page admin sorting. Course cards now support local save and resume. A localized Retry action handles failed route assets.

- Applied seven additive migrations on isolated MySQL 8.0.31 for 18 ledger entries and 50 tables. Ran the production migration command twice. The extracted app used the DML-only runtime login.
- `npm run lint`, `npm run typecheck`, `npm run build`, `npm run package:deployment` and `git diff --check` passed. `npm test` passed all 42 tests with identity integration enabled. Both dependency audits reported zero known vulnerabilities.
- Real HTTPS browser checks covered staff, collections, certificate settings, corrections, illustrations, image and quiz lessons, operations, local course actions and offline learning. The Chrome matrix ran 324 route checks, 48 homepage layouts and 60 scoped axe scans. Firefox performed 30 route and viewport checks, PDF and video smoke and a cold offline reload. Three locales passed keyboard recovery after a simulated bundle failure on the delivered build.
- A local slow-mobile pair measured 502,025 versus 481,334 transferred bytes and 3.116 versus 2.088 seconds LCP in standard and data-saving modes, with CLS 0.014. The report records the earlier throttled asset failure that prompted the retry handling.
- The runtime installed on Windows and ran locally under the Linux Passenger loader. All release runtime files tested on Linux matched the delivered server payload by SHA-256. The twelve design reference hashes matched. Temporary services and credentials were removed.

The remaining host-specific, device and approved-content checks are documented for the owner's launch. Contributor assignments cover course workflows, with other authoring already available through the existing module permissions.


## Local WAMP setup — 26 November 2026

Created the utf8mb4 `womenriseafg` database in WAMP MySQL 8.0.31 on loopback port 3306. The ignored local `.env` uses the requested root connection with a blank database password and the development defaults.

- `npm run build` compiled both workspaces. `npm run db:migrate` applied the migrations, and the second run reported the schema current. The migration ledger has 18 entries.
- The bootstrap CLI created the local super administrator `womenrise-admin`. The browser and API verified administrator sign-in, the Staff and assignments grant and sign-out.
- `npm run dev` was left running in the background. Vite returned HTTP 200 on port 5173 and Express readiness confirmed the MySQL connection on port 3000. The guest catalogue returned 19 categories.
