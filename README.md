# womenriseafg

womenriseafg is a free learning workspace for Afghan girls and women. Guests can explore four planned subject outlines and choose an interface language and appearance. Optional accounts use a username and password. Upcoming sections and demonstration content are labeled in the interface.

## Pages

| Address | What you can try |
| --- | --- |
| `/`, `/explore` | Browse the four subject areas and open a topic outline |
| `/settings` | Set the interface language and light, dark or system appearance |
| `/status` | Run the Stage 1 public API connection check and retry after a failure |
| `/register`, `/login`, `/account` | Create or sign in to an optional student account, review the current session, or sign out |
| `/admin/login`, `/admin`, `/admin/components` | Sign in as an administrator and open the authorized workspace |
| `/admin/education` | Browse and manage categories, subjects, education levels, grades, languages and tags |
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

The production entry, `app.js`, selects production mode and starts the compiled Express application. It serves the built client and API from one origin. Use this entry for a compatible cPanel Passenger application. Keep the application root, secret settings and storage outside any directory exposed by the web server. The provider must redirect public HTTP to HTTPS before forwarding requests, overwrite forwarded protocol and client IP headers, and restrict direct access to Node. Set `AUTH_PUBLIC_ORIGIN` and `AUTH_TRUSTED_PROXY_IPS` to match the hosting configuration. Confirm the provider's Node version, Node application manager, MySQL access, filesystem permissions and routing before deployment. Stage 13 covers hosting preparation.

## Prepare the application database

1. Set the environment for the intended database. Use a dedicated runtime account with SELECT, INSERT, UPDATE and DELETE on the identity and education tables. For the explicit migration, use an account that also has CREATE, ALTER, INDEX and REFERENCES on this schema. Stage 4 was tested with MySQL 8.0.31 and needs a server that enforces CHECK constraints.
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
| `npm test` | Run the foundation tests using Node's test runner |
| `npm run build` | Build both workspaces for production |
| `npm start` | Serve the built application from Express |
| `npm audit --omit=dev` | Review the installed runtime dependency tree for known advisories |
| `npm run db:migrate` | Apply and verify identity and education migrations for the configured MySQL schema |
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
| `STORAGE_ROOT` | `storage` | Private storage location for future media. Relative paths resolve from the repository root |
| `LOG_LEVEL` | `info` | Structured server logging level |
| `AUTH_PUBLIC_ORIGIN` | Local API and Vite origins | In production, set the exact browser-facing HTTPS origin with no trailing slash. Account writes remain unavailable without it |
| `AUTH_TRUSTED_PROXY_IPS` | Empty | Comma-separated exact IP addresses of trusted HTTPS proxies. Configure these only after confirming the proxy overwrites forwarded headers |

## Foundation API

| Method and path | Result |
| --- | --- |
| `GET /api/v1/health` | HTTP 200 with `{"status":"ok"}` when Express is running |
| `GET /api/v1/ready` | HTTP 200 with `{"status":"ready"}` after a successful Sequelize connection check, or HTTP 503 if MySQL cannot be reached or authenticated |

Both endpoints are public and read-only. Query parameters are rejected. Public error responses omit credentials, SQL and internal exception details. To verify a local connection after startup, open the readiness endpoint through either the frontend dev server or the production origin. An HTTP 503 calls for checking the schema, credentials, address and port.

Account endpoints are under `/api/v1/auth`. `GET /auth/session` reads the current identity, and `POST /auth/register`, `/auth/login`, `/auth/admin-login` and `/auth/logout` validate a JSON request from the configured origin. `GET /api/v1/admin/access` checks an administrator-authenticated session and the current permission grant on the server. Auth responses have `Cache-Control: no-store`.

Credential requests are limited to 20 per IP in 15 minutes within each Node worker. Restarting a worker clears its counter. On a multi-worker host, verify whether the hosting proxy applies a shared limit. Correct proxy forwarding is also important for learners who share a network.

The administrator audit records successful sign-in, sign-out, bootstrap and recovery with an internal account ID. Keep the application and operator logs private. Use the configured log retention policy and the daily expired-session cleanup for the identity data.

Run the MySQL integration tests only with a disposable loopback MySQL instance and a fresh schema with a name beginning `womenriseafg_test_`. Set `WOMENRISEAFG_IDENTITY_TEST=1` with the corresponding `DB_*` variables, then run `npm test`. Both suites apply migrations and create and remove test data.

## Educational organization

Migration `003-education-organization` adds education entries, languages and translations. It initializes 19 categories, eight subjects, three education levels, grades 1–12 and the English, Pashto and Dari content languages. It also grants the education management and publishing permissions to the built-in administrator and super administrator roles. The interface language remains independent of the catalog languages.

Use the education dashboard to search and filter lists, open an entry, edit its localized labels, or move it through Draft, Educational review, optional Translation review, Approved, Published and Archived. Use Return to Draft before modifying an approved or archived entry. Archived entries and drafts can be deleted when they are unreferenced. Language codes stay fixed after creation so that existing translations keep their references.

List and edit APIs use `/api/v1/admin/education`. Requests require an administrator session and `education:manage`. Publication and archiving also require `education:publish`. Updates, status changes and deletes require the current record version returned by a read. Public taxonomy lists use `GET /api/v1/education/:kind` with optional `q`, `page` and `pageSize`. They return published entries with translations in published languages. Categorized subjects also require a publicly visible category. The administrator dashboard counts stored statuses.

The lockfile pins Sequelize's transitive UUID library to the patched CommonJS-compatible 11.1.1 release. Use the pinned npm version when updating dependencies to preserve that override. Reassess it when Sequelize updates its dependency range.

## Repository guide

- `client/src/` holds React Router layouts, shared theme and language preferences, semantic CSS tokens, UI primitives, subject discovery, administration previews and the API status view.
- `client/public/` holds the local illustration, favicon and license notices. Vite bundles the Inter and Noto Sans Arabic webfonts with the application.
- `server/src/` holds validated configuration, the MySQL connection factory, the Express application, versioned health routes, input validation, error handling and the process entry.
- `server/tests/` contains foundation, identity and education regression tests.
- `docs/PROGRESS.md` records stage results and the current approval boundary.
- `AGENTS.md` records the owner's stage rules.
- `How the complete website should look/` holds the owner's original local references. The directory is excluded from Git and build artifacts.

The next planned stage is Stage 5, centralized media management. It requires separate owner approval.
