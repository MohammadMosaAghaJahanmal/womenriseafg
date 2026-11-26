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
