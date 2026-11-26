# womenriseafg

womenriseafg is a free learning workspace for Afghan girls and women. Stage 2 provides guest-accessible layouts in English, Pashto and Dari. Learners can explore four planned subject outlines and choose a language and appearance. Upcoming sections and demonstration content are labeled in the interface.

## Stage 2 pages

| Address | What you can try |
| --- | --- |
| `/`, `/explore` | Browse the four subject areas and open a topic outline |
| `/settings` | Set the interface language and light, dark or system appearance |
| `/status` | Run the Stage 1 public API connection check and retry after a failure |
| `/admin`, `/admin/components` | Open the public layout preview, exercise table and form controls, compare component states and play a local audio sample |

Only explicit language and theme choices are saved in the browser. The page search covers workspace navigation. Preview pages contain no student records or administrative write actions.

## Run locally

Use Node.js 22.13 or later in the 22.x series, or a supported release from Node 24 onward. This project pins npm 11.21.3 and was tested with Node 22.14.0. From the project root:

1. Run `npm ci`.
2. Copy `.env.example` to `.env`. Use `Copy-Item .env.example .env` in PowerShell or `cp .env.example .env` on Linux.
3. Set the connection variables for a MySQL database you control. Use a UTF-8 database with the `utf8mb4` character set. Use a dedicated account. Read-only access to the selected schema is sufficient at this stage. The application checks the connection without creating or synchronizing tables.
4. Run `npm run dev`, then open http://127.0.0.1:5173. The client dev server proxies requests under `/api` to Express on the configured port. Stop the command with Ctrl+C.

For separate terminals, use `npm run dev:server` and `npm run dev:client`. By default Express listens at 127.0.0.1:3000. Keep the development API reachable over IPv4 loopback for the Vite proxy. A responding API can serve its health endpoint even while the database is unavailable.

## Build and run the production application

Run `npm run build` from the root to compile the client to `client/dist/` and the backend to `server/dist/`. Provide the application database credentials, including a nonblank `DB_PASSWORD`, in the server environment or root `.env`. Run `npm start` and open http://127.0.0.1:3000 (or the configured port).

The production entry, `app.js`, selects production mode and starts the compiled Express application. It serves the built client and API from one origin. Use this entry for a compatible cPanel Passenger application. Keep the application root, secret settings and storage outside any directory exposed by the web server. The provider must terminate HTTPS and forward requests to the application. Confirm the provider's Node version, Node application manager, MySQL access, filesystem permissions and routing before deployment. Stage 13 covers hosting preparation.

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

## Foundation API

| Method and path | Result |
| --- | --- |
| `GET /api/v1/health` | HTTP 200 with `{"status":"ok"}` when Express is running |
| `GET /api/v1/ready` | HTTP 200 with `{"status":"ready"}` after a successful Sequelize connection check, or HTTP 503 if MySQL cannot be reached or authenticated |

Both endpoints are public and read-only. Query parameters are rejected. Public error responses omit credentials, SQL and internal exception details. To verify a local connection after startup, open the readiness endpoint through either the frontend dev server or the production origin. An HTTP 503 calls for checking the schema, credentials, address and port.

The lockfile pins Sequelize's transitive UUID library to the patched CommonJS-compatible 11.1.1 release. Use the pinned npm version when updating dependencies to preserve that override. Reassess it when Sequelize updates its dependency range.

## Repository guide

- `client/src/` holds React Router layouts, shared theme and language preferences, semantic CSS tokens, UI primitives, subject discovery, administration previews and the API status view.
- `client/public/` holds the local illustration, favicon and license notices. Vite bundles the Inter and Noto Sans Arabic webfonts with the application.
- `server/src/` holds validated configuration, the MySQL connection factory, the Express application, versioned health routes, input validation, error handling and the process entry.
- `server/tests/` contains the Stage 1 regression suite.
- `docs/PROGRESS.md` records stage results and the current approval boundary.
- `AGENTS.md` records the owner's stage rules.
- `How the complete website should look/` holds the owner's original local references. The directory is excluded from Git and build artifacts.

The next planned stage is Stage 3, database, authentication and authorization. It requires separate owner approval.
