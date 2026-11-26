# womenriseafg

womenriseafg is a free learning workspace for Afghan girls and women. Guests can browse published courses, videos, Shorts, reviewed AI learning resources and digital books, and choose an interface language and appearance. Optional accounts use a username and password. Upcoming sections and demonstration content are labeled in the interface.

## Pages

| Address | What you can try |
| --- | --- |
| `/`, `/explore` | Browse the four subject areas and open a topic outline |
| `/courses`, `/courses/:slug`, `/learn/:courseSlug/:lessonSlug` | Browse published courses, open the curriculum, and take free lessons as a guest |
| `/videos`, `/shorts`, `/ai-learning` | Browse and open free educational videos, vertical Shorts and reviewed AI learning resources |
| `/library`, `/library/:slug`, `/library/:slug/read` | Browse free books, check publication details, and read PDFs online or download when permitted |
| `/settings` | Set the interface language and light, dark or system appearance |
| `/status` | Run the Stage 1 public API connection check and retry after a failure |
| `/register`, `/login`, `/account` | Create or sign in to an optional student account, review the current session, or sign out |
| `/admin/login`, `/admin`, `/admin/components` | Sign in as an administrator and open the authorized workspace |
| `/admin/education` | Browse and manage categories, subjects, education levels, grades, languages and tags |
| `/admin/media` | Upload, preview, organize, publish and clean up local media assets |
| `/admin/courses` | Build and order curricula, manage translations and resources, and publish reviewed courses |
| `/admin/learning-media` | Prepare and review video, Short and AI resource entries for publication |
| `/admin/books` | Upload or select book PDFs and covers, edit translations and publication details, and review books |
| `/design-preview` | Open the public Stage 2 component gallery and try its local examples |

Explicit language and theme choices are saved in browser storage and can be cleared in Settings. The sign-in cookie is managed separately, and Account includes a sign-out action for shared devices. The page search covers workspace navigation. The public gallery uses sample data.

## Run locally

Use Node.js 22.13 or later in the 22.x series, or a supported release from Node 24 onward. This project pins npm 11.21.3 and was tested with Node 22.14.0. From the project root:

1. Run `npm ci`.
2. Copy `.env.example` to `.env`. Use `Copy-Item .env.example .env` in PowerShell or `cp .env.example .env` on Linux.
3. Set the connection variables for a dedicated MySQL database using `utf8mb4`. Run the database migrations below before exercising accounts and the taxonomy. Public static pages and the health check can be exercised while the database is unavailable.
4. Run `npm run dev`, then open http://127.0.0.1:5173. The client dev server proxies requests under `/api` to Express on the configured port. Stop the command with Ctrl+C.

For separate terminals, use `npm run dev:server` and `npm run dev:client`. By default Express listens at 127.0.0.1:3000. Keep the development API reachable over IPv4 loopback for the Vite proxy. A responding API can serve its health endpoint even while the database is unavailable.

## Build and run the production application

Run `npm run build` from the root to compile the client to `client/dist/` and the backend to `server/dist/`. Provide the application database credentials, including a nonblank `DB_PASSWORD`, in the server environment or root `.env`. Run `npm start` and open http://127.0.0.1:3000 (or the configured port).

The production entry, `app.js`, selects production mode and serves the built client and API from one origin. For cPanel, run `npm run package:deployment -- /absolute/private/path/womenriseafg-deployment.tar.gz` to build and package a clean release. The [deployment runbook](docs/DEPLOYMENT.md) covers provider checks, secure Passenger or TCP proxy setup, private storage, database initialization, backups, and rollback.

## Prepare the application database

1. Set the environment for the intended database. Use a dedicated runtime account with SELECT, INSERT, UPDATE and DELETE on the application tables, including books and translations. For the explicit migration, use an account that also has CREATE, ALTER, INDEX and REFERENCES on this schema. The application was tested with MySQL 8.0.31 and needs a server that enforces CHECK constraints.
2. Run `npm run build`, then `npm run db:migrate` using the migration account with at least two available MySQL connections. The migrations record their versions, check table definitions and apply additively. Keep a database backup before applying changes to an existing environment.
3. Initialize the first super administrator once from a trusted shell. Run the bootstrap command and supply a unique passphrase through standard input. The same local operator workflow can recover an active administrator account and revoke all of its current sessions.

Example for Bash. Replace `administrator` with the chosen username.

```bash
read -rsp 'Administrator passphrase: ' wra_admin_passphrase
printf '\n'
printf '%s' "$wra_admin_passphrase" | npm run auth:bootstrap -- administrator
unset wra_admin_passphrase
```

Example for PowerShell 7.

```powershell
$wraAdminPassphrase = Read-Host -MaskInput 'Administrator passphrase'
try { $wraAdminPassphrase | npm run auth:bootstrap -- administrator }
finally { Remove-Variable wraAdminPassphrase }
```

Use `auth:recover` in the same command to set a replacement passphrase. Username rules allow 3–32 ASCII letters, digits and selected punctuation. Passphrases require 15–128 Unicode characters and a maximum of 512 UTF-8 bytes. The default learner session lifetime is eight hours, and the administrator lifetime is two hours. Schedule `npm run auth:purge-sessions` daily under the application account to remove expired records.

## Commands

| Command from project root | Purpose |
| --- | --- |
| `npm ci` | Reproduce the npm workspace install from the lockfile |
| `npm run dev` | Start the Vite and Express watch processes together |
| `npm run lint` | Check workspace JavaScript and TypeScript |
| `npm run typecheck` | Check TypeScript in both workspaces |
| `npm test` | Run the server regression suite using Node's test runner |
| `npm run build` | Build both workspaces for production |
| `npm run package:deployment -- /path/to/release.tar.gz` | Build a fresh cPanel release archive and print its SHA-256 digest |
| `npm start` | Serve the built application from Express |
| `npm audit --omit=dev` | Review the installed runtime dependency tree for known advisories |
| `npm run db:migrate` | Apply and verify identity, education, media, courses, learning media, books, quizzes, discovery, certificates and homepage migrations |
| `npm run auth:bootstrap -- USERNAME` | Establish the first super administrator with a passphrase on standard input |
| `npm run auth:recover -- USERNAME` | Replace an administrator's passphrase and revoke active sessions |
| `npm run auth:purge-sessions` | Remove expired identity sessions |

## Configuration

The server loads the project-root `.env` once at startup and validates it with Joi. Environment variables set by the process or hosting account take precedence. A configuration failure identifies the invalid field names. Keep database credentials on the server and out of client-prefixed variables.

| Variable | Development default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | Runtime mode. The root production entry selects `production` |
| `HOST`, `PORT` | `127.0.0.1`, `3000` | Express listener. The Vite proxy uses `PORT` |
| `DB_HOST`, `DB_PORT` | `127.0.0.1`, `3306` | MySQL TCP connection |
| `DB_NAME`, `DB_USER` | `womenriseafg` for both | Pre-created schema and its application user |
| `DB_PASSWORD` | Empty in development | Application user's password, required in production |
| `STORAGE_ROOT` | `storage` | Private media storage. Relative paths resolve from the repository root |
| `MEDIA_MAX_UPLOAD_BYTES` | `134217728` | Maximum bytes in one uploaded file. Match the provider's request body and upload timeout settings |
| `SHORT_MAX_SECONDS` | `90` | Maximum measured length for a Short and its quality variants. Accepts whole seconds from 1 to 600 |
| `LOG_LEVEL` | `info` | Structured server logging level |
| `AUTH_PUBLIC_ORIGIN` | Local API and Vite origins | In production, set the exact browser-facing HTTPS origin with no trailing slash. Account writes remain unavailable without it |
| `AUTH_TRUSTED_PROXY_IPS` | Empty | Exact IP addresses for a trusted TCP proxy that overwrites forwarding headers. Leave empty for native Passenger, which supplies its secure metadata over the application socket |

## Foundation API

| Method and path | Result |
| --- | --- |
| `GET /api/v1/health` | HTTP 200 with `{"status":"ok"}` when Express is running |
| `GET /api/v1/ready` | HTTP 200 with `{"status":"ready"}` after a successful Sequelize connection check, or HTTP 503 if MySQL cannot be reached or authenticated |

Both endpoints are public and read-only. Query parameters are rejected. Public error responses omit credentials, SQL and internal exception details. To verify a local connection after startup, open the readiness endpoint through either the frontend dev server or the production origin. An HTTP 503 calls for checking the schema, credentials, address and port.

Account endpoints are under `/api/v1/auth`. `GET /auth/session` reads the current identity, and `POST /auth/register`, `/auth/login`, `/auth/admin-login` and `/auth/logout` validate a JSON request from the configured origin. `GET /api/v1/admin/access` checks an administrator-authenticated session and the current permission grant on the server. Auth responses have `Cache-Control: no-store`.

Credential requests are limited to 20 per IP in 15 minutes within each Node worker. Restarting a worker clears its counter. On a multi-worker host, verify whether the hosting proxy applies a shared limit. Correct proxy forwarding is also important for learners who share a network.

The administrator audit records successful sign-in, sign-out, bootstrap and recovery with an internal account ID. Keep the application and operator logs private. Use the configured log retention policy and the daily expired-session cleanup for the identity data.

Run the MySQL integration tests only with a disposable loopback MySQL instance and a fresh schema with a name beginning `womenriseafg_test_`. Set `WOMENRISEAFG_IDENTITY_TEST=1` with the corresponding `DB_*` variables, then run `npm test`. Test files run sequentially because the integration suites share the schema and exercise database-wide media usage and cleanup. They apply migrations and create and remove test data.

## Educational organization

Migration `003-education-organization` adds education entries, languages and translations. It initializes 19 categories, eight subjects, three education levels, grades 1–12 and the English, Pashto and Dari content languages. It also grants the education management and publishing permissions to the built-in administrator and super administrator roles. The interface language remains independent of the catalog languages.

Use the education dashboard to search and filter lists, open an entry, edit its localized labels, or move it through Draft, Educational review, optional Translation review, Approved, Published and Archived. Use Return to Draft before modifying an approved or archived entry. Archived entries and drafts can be deleted when they are unreferenced. Language codes stay fixed after creation so that existing translations keep their references.

List and edit APIs use `/api/v1/admin/education`. Requests require an administrator session and `education:manage`. Publication and archiving also require `education:publish`. Updates, status changes and deletes require the current record version returned by a read. Public taxonomy lists use `GET /api/v1/education/:kind` with optional `q`, `page` and `pageSize`. They return published entries with translations in published languages. Categorized subjects also require a publicly visible category. The administrator dashboard counts stored statuses.

## Media library

Migration `004-centralized-media` adds media assets, related files and content references. The Media library accepts H.264 MP4, MP3, AAC M4A, WAV, PNG, JPEG, WebP, PDF, WebVTT and UTF-8 text. Text and caption files are capped at 4 MiB. Image dimensions are capped at 16,000 pixels per side and 64 megapixels. The server checks the file bytes and records available dimensions and duration. Some MP3 and fragmented MP4 files report duration as unknown.

Add a title, license and source for each file. Upload thumbnails, pre-encoded video versions, alternate audio, captions and transcripts as separate assets, then link them from the video or document. Uploading an identical file returns a conflict so it can be reused from the library. The server performs no transcoding. Prepare MP4 variants with H.264 and AAC locally, using a tool such as FFmpeg or HandBrake. Review the media and its rights before confirming publication.

Admin requests use `/api/v1/admin/media` and require `media:manage` plus an administrator session. Publishing and archiving also require `media:publish`. Draft and archived bytes are available only to authorized staff. The public file route is `GET /api/v1/media/:id/file`. Supported streams offer byte ranges, and the public attachment/download response requires permission to download. As with other web players, streaming still sends bytes to the browser.

Set `STORAGE_ROOT` to a canonical, writable directory outside the web document root. Upload staging and permanent objects stay on the same volume and require hard-link support. The dashboard shows media bytes tracked by MySQL and available space on the volume. The file system's free-space reading may differ from the hosting account's quota. Confirm the provider's disk, inode, bandwidth, proxy upload and time limits before enabling large uploads.

The Unattached files filter lists unlinked drafts and archived assets. Review and confirm each deletion individually. The cleanup action retries files already marked for deletion and removes unregistered objects and temporary uploads after a 24-hour grace period. Published and linked assets have reference guards. Back up the MySQL schema and private media directory together before migrations or hosting changes.

The lockfile pins Sequelize's transitive UUID library to the patched CommonJS-compatible 11.1.1 release. Use the pinned npm version when updating dependencies to preserve that override. Reassess it when Sequelize updates its dependency range.

## Courses and lessons

Use **Manage courses** in the administration dashboard to create a draft, add course translations, and build its curriculum. Give each lesson a unique code within the course. Chapters and lessons have independent translations. Use the reorder controls to set the reading order and attach published media for video, audio and PDF lessons. Text lessons need a body in a published content language. Add optional resources, a thumbnail, taxonomy and related courses from the existing libraries.

Save the curriculum before moving it through educational review, optional translation review, approval and publication. Publishing makes the course and lessons freely available to guests. Archive a course to withdraw it. Return an approved or archived course to Draft before editing. Changing a published course or lesson code changes its public URL when it is republished. Draft and archived courses can be deleted after confirmation.

The public catalog is at `/courses`, course details are at `/courses/:slug`, and lessons are at `/learn/:courseSlug/:lessonSlug`. Courses can be searched and filtered by subject, level and content language. Lesson navigation follows the saved curriculum order. Learners can choose a content language independently of the interface language and explicitly load streaming media or PDF previews. The application hosts the preview code and worker alongside the built client.

Public APIs are under `/api/v1/courses`. The admin API under `/api/v1/admin/courses` requires an administrator session and `course:manage`. Publishing and archiving also require `course:publish`. Changes use version checks. Course creation and updates accept a curriculum JSON body up to 512 KiB after authorization and origin checks. One course can have up to 20 chapters and 100 lessons.

Migration `005-course-learning` adds courses, chapters, lessons, translations, lesson resources, tags and related course links to the existing MySQL schema. Run the migration after building the server. Back up the database and private media directory together. Published courses guard referenced media against archive or deletion. Attachments use each media file's existing download permission.

## Educational videos, Shorts and AI learning resources

Prepare and encode media off-server. Upload finished local files through **Media library** and record their source, license and creator. Attach thumbnails, captions, transcripts, audio-only alternatives and pre-encoded quality versions in the library. For Shorts, use an upright H.264 MP4 with encoded dimensions near 9:16 and a measurable duration. Apply the same requirements to its quality variants. Use landscape or portrait assets for regular educational videos.

Open **Educational media** to create a video, Short or AI learning resource, add translations, and optionally link a course and one of its lessons. Videos and Shorts need a published category and at least one description in a published language before approval. For AI-assisted or AI-generated content, record the tool and its contribution. AI resources can reuse local images, audio, PDFs, captions and transcripts. The guest collection shows the AI classification and tool. Preparation notes and review records are visible to staff.

For a new draft file, attach it before submitting the entry for human review. The reviewer checks accuracy, suitability, accessibility and rights, then records a note on approval. Approval releases the file for publication in the media library. Publish its attached files first, then publish the primary file and the reviewed entry. Approval is bound to the selected file version. If the file is edited, return the entry to Draft and repeat review. Existing published files can be reused. Archiving an entry removes it from the catalogs. An independently published file follows its media library status.

The APIs are under `/api/v1/videos`, `/api/v1/shorts`, `/api/v1/ai-learning` and `/api/v1/admin/learning-media`. Admin actions require an administrator session and `learning-media:manage`. Approval, publication and archiving also require `learning-media:publish`. Working with private files requires `media:manage`, and publishing files in the library requires `media:publish`. Migration `006-learning-media` adds learning media and translations, including review and AI provenance fields. The same-origin host serves playback and prepared quality versions.

## Digital library

Open **Book management** to create a book, upload or select its PDF and optional cover, and add the author, publisher, edition, year, language and taxonomy details. Set **PDF language** to the language of the actual file. Catalog titles and descriptions can have separate translations. Enter the source and rights on the PDF and cover in the media library. The PDF's **Allow public download** permission controls the library's download action.

Submit the book for educational review and add a review note on approval. Approve first when working with a draft PDF or cover, publish the files in the Media library, then publish the book. Book approval is tied to both file versions. Return the book to Draft and review again if a file changes. Archiving withdraws the book catalog and reader routes. Independently published media follows its media library status.

Guests can search by title or author and filter by category, PDF language and education level. **Read online** starts the local PDF viewer with page navigation, zoom, fit width, and fullscreen or an expanded view. The PDF and worker load upon opening the reader. The book file endpoint honors byte ranges so the viewer can fetch the pages it needs. A text alternative is available for pages with extractable text.

The public endpoints are `/api/v1/books`, `/api/v1/books/:slug` and `/api/v1/books/:slug/file`. The last endpoint serves inline reading and checks download permission for `?download=true`. Staff endpoints under `/api/v1/admin/books` require an administrator session and `book:manage`. Approval, publication and archive additionally require `book:publish`. Draft file access requires `media:manage`. Migration `007-digital-library` adds books, translations and review metadata. Use the existing private disk storage and confirm that the host forwards byte ranges and supports the configured upload size and time limits.

## Learning engagement and discovery

Learners can open published content, take quizzes and follow learning paths as guests. **My learning** and **Settings** offer an explicit option to save progress in the current browser. **Turn off and clear** removes its lesson progress, reading and playback positions, bookmarks, recent activity and quiz result summaries. A shared browser can display this data to anyone who uses it. Clearing browser learning leaves any public certificate record previously issued in place.

Use **Quiz management** to build quizzes from the reusable question bank. A question can contain translations, explanations and one or more correct selections, true or false, or accepted short answers. Use each option's same position and meaning across languages. To revise a question linked to a quiz, create a replacement and update the quiz in Draft. Submit quizzes for educational review and use translation review when applicable. The grading endpoint checks the published version and scores submitted answers on the server. It returns scores and explanations only after submission. The browser can save a score summary with consent.

Use **Paths and Daily Learning** to publish ordered activities. Daily Learning can rotate through published activities, rotate through an editor's selected list, or be hidden. Rotation uses the Kabul calendar date. **Search** offers multilingual suggestions, content filters and pagination. Recommendations use the current activity's public subject and category, with level and grade as ranking signals. They use no learner history.

After completing all currently published lessons in a course, a learner can prepare a free certificate and choose a template. The optional name stays on the certificate page. **Print or save as PDF** uses the browser's print dialog. Enabling public verification creates a record accessible by its unique link. The record contains the course, issuance date, locale and random identifier. Certificates describe self-reported lesson completion.

Migrations `008-quizzes`, `009-discovery` and `010-certificates` extend the existing MySQL schema. Built-in administrators receive `quiz:manage`, `quiz:publish`, `discovery:manage` and `discovery:publish`. The service uses the existing MySQL 8 same-origin setup. Search uses indexed publication and reference checks with bounded result pages. It requires no external search service or worker. Run the migration CLI with a backup and confirm the provider's MySQL version and query limits before live deployment.

## Homepage and multilingual publishing

Open **Homepage settings** in administration to reorder sections, change visibility, select featured courses and recommended books, and manage multilingual announcements. Use the drag handle or the labeled move buttons to reorder sections. The homepage displays each optional section when it is enabled and has eligible published content. Continue Learning appears for learners who enabled device learning and have a resumable activity.

Under **Branding**, staff can set the platform name, select a public logo and browser icon from the media library, and enter a slogan and mission in English, Pashto and Dari. Publish branding images through the existing media review workflow before selecting them. When an image is withdrawn, the built-in mark or browser icon is used. The editor saves with a version check so concurrent changes can be reviewed before reloading the settings.

The interface language controls the menus, controls and direction. Content language can be selected independently on the homepage and in the learning catalogs. Results label the preview language, available translations and the PDF language where applicable. Explore links directly to published subjects. Search normalizes Arabic-script letter and digit variants while respecting the selected content language.

Popular courses are ranked by cumulative opens of the published course page. The browser sends only the course code without credentials, and MySQL stores the per-course total. Related course suggestions use published subject, category and education level. Settings explains course-open measurement in all three languages.

Migration `011-homepage` adds `homepage_settings` and `homepage_course_opens`, and grants `homepage:manage` to the built-in administrators. The public homepage and branding are available at `/api/v1/homepage` and `/api/v1/homepage/branding`. The editor uses the protected `/api/v1/admin/homepage` endpoint. The configuration and counts share the existing MySQL database and selected images use the existing private media storage.

## Offline learning and data saving

Open **Downloads** and choose **Enable offline access**, or confirm **Save offline copy** from a lesson or an eligible file. Choose individual published lessons, permitted PDFs, videos, Shorts, or lesson attachments. The site checks publication and file-download permissions before transferring files. Saved PDF links use the browser's PDF support. Offline video and audio play from the local copy.

Downloads shows progress, cancellation, saved copies, and an estimated storage budget. The browser can enforce a smaller limit than the app's 128 MiB per file, 384 MiB total and 512 saved copies. **Remove all downloads** removes the copies and cancels transfers. **Clear this browser’s learning data** also clears learning history, display settings, data-saving preferences and the app-managed offline cache. The browser or device controls manage installed apps, history and exported files.

**Settings → Data saving** can follow the connection, stay on, or stay off. Data saving omits decorative images and thumbnails, reduces animation, and prefers smaller prepared video variants and audio-only playback where available. Media loads when the learner starts playback or confirms a download. Supply variants and transcripts in the media library using the existing off-server preparation workflow.

The PWA is available from the built site on HTTPS or a supported loopback origin. The Vite development server provides online development. The service worker is enabled on explicit request and precaches only the public app shell and Downloads route. The build includes Brotli and gzip static variants. Express negotiates those variants and serves versioned assets with immutable caching, while the worker and manifest revalidate and private routes use no-store. Keep the manifest, icons, worker, fallback and compressed files with the rest of the client build.

If the browser removes part of the offline app shell, **Downloads** offers **Enable offline access** again. This restores missing app files when a connection is available. Previously saved lessons and permitted files are managed separately in Downloads.

The production server serves approved build assets and uses `no-store` and `noindex` for account, administrator, certificate and local-learning pages. Keep uploads, source, backups and configuration outside the web document root. The credential rate limit operates per source IP and per Node worker.

## Repository guide

- `client/src/` holds React Router layouts, shared theme and language preferences, semantic CSS tokens, UI primitives, subject discovery, administration previews and the API status view.
- `client/public/` holds the local illustration, favicon and license notices. Vite bundles the Inter and Noto Sans Arabic webfonts with the application.
- `server/src/` holds validated configuration, the MySQL connection factory, the Express application, versioned health routes, input validation, error handling and the process entry.
- `server/tests/` contains foundation, identity, education, media, course, learning media, book, learning-engagement and homepage regression tests.
- `docs/PROGRESS.md` records stage results and the current approval boundary.
- `AGENTS.md` records the owner's stage rules.
- `How the complete website should look/` holds the owner's original local references. The directory is excluded from Git and build artifacts.

The next planned stage is Stage 14, final production readiness review. It requires separate owner approval.
