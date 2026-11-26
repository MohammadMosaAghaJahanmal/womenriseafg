# Deploy womenriseafg on one Linux cPanel account

This runbook prepares a future authorized deployment. Use one HTTPS origin for the React app, the Express API, and locally stored media. MySQL and the Node application stay on the same hosting account. Examples use `learn.example.com`, the cPanel account `account`, and a release directory named `RELEASE_ID`. Substitute values from the approved hosting plan.

## Confirm the hosting plan

Record the provider, exact plan, domain, account owner, and support reference before deployment. The items below require provider confirmation and an authorized staging smoke test. Public cPanel documentation describes available features. Each hosting plan can enable a different subset.

| Area | What to confirm |
| --- | --- |
| Node and npm | Use an up-to-date supported Node.js LTS release. The project accepts Node 22.13 or later in the 22.x line and Node 24 or newer. Node 22 is the locally tested release line. Confirm the exact Node and npm binaries used by Passenger, the account shell and cron. The build uses npm 11.21.3. Ask whether the account can fetch locked production packages from the npm registry. |
| Application manager | Confirm cPanel's Application Manager, CloudLinux's Node.js selector or equivalent, an `app.js` CommonJS entry at the domain root `/`, a private application directory, the worker account, shell access to run the CLI, restarts and access to logs. Identify native Passenger or a private TCP reverse proxy. |
| MySQL | Confirm MySQL with InnoDB, enforced `CHECK` constraints, `utf8mb4`, named locks, foreign keys and separate user grants. MySQL 8.0.31 is the tested baseline. MySQL began enforcing these constraints in 8.0.16. An alternate database version or MariaDB requires a migration check on a scratch schema. Confirm TCP hostname and port, per-user connection and query limits, and backup and restore access. |
| Video, audio and PDF | Get written confirmation that serving locally stored educational MP4, audio and PDFs is permitted on the plan. Confirm HTTP byte ranges, streaming duration and concurrency policies, proxy buffering or timeout limits and any media or fair-use restrictions. |
| Disk and inodes | Confirm the account's disk and file-count quotas, the database quota, and how releases, npm packages, pending uploads, media variants, logs and backups count. Leave space and inodes for a staged upgrade and one restore. Confirm that private media uses a real directory and supports hard links within one filesystem. |
| Bandwidth | Confirm monthly egress, fair-use thresholds, measurement and overage policy. Estimate egress from actual media sizes and average watch duration or download volume, plus assets and PDFs. Include repeated sessions, exports and backup transfers where billed. |
| CPU and RAM | Confirm CPU, memory, worker entry-process and concurrent connection limits. A Node worker can run two scrypt operations at once with about 32 MiB of working memory each, in addition to its normal RSS. The DB pool uses up to three connections per worker. Keep connections available for administration and migration. Measure representative sign-in and stream traffic under the approved plan. |
| Upload request limits | Check Apache or the front proxy, WAF and Passenger limits on body size, request duration and idle time. The app's file limit defaults to 128 MiB. Keep enough room in the host limit for the multipart envelope, or lower `MEDIA_MAX_UPLOAD_BYTES` to fit the host. Set the quota before publishing large media. |
| HTTPS and proxy | Confirm certificate issuance and renewal, HTTP-to-HTTPS redirection at the edge, domain root mapping, and the exact trusted connection between the web server and Node. Require one canonical HTTPS origin. |
| Scheduled tasks | Confirm Cron Jobs access, minimum intervals, runtime and timezone. Confirm the cron account can read private config, run the correct Node binary and append to a private log. |
| Backups | Confirm available partial and full backup formats, what includes private storage, databases and grants, retention and off-account export. Obtain the provider's restore steps and time estimates. Verify recovery on a fresh schema and storage directory. |

[Node.js release schedule](https://nodejs.org/en/about/previous-releases) · [cPanel Application Manager](https://docs.cpanel.net/cpanel/software/application-manager/) · [MySQL CHECK constraints](https://dev.mysql.com/doc/refman/8.0/en/create-table-check-constraints.html)

Prepare compressed video, audio, transcripts and captions off-server. Use reviewed variants and files with suitable publication and download rights.

## Prepare and install the release

On a development or release machine, install the locked dependencies and run the production packager. Supply a new filename in a private directory. The packager builds both workspaces and prints the archive's SHA-256. Transfer the archive and digest over an authenticated channel.

```bash
npm ci
npm run package:deployment -- /absolute/private/path/womenriseafg-deployment.tar.gz
```

On the cPanel account, select the provider's approved Node and npm in the shell first. Confirm `node --version` and `npm --version`. Use the account owner, whose files Passenger can read. Pick a new release ID for each candidate. Keep the application, releases, backups, private logs and storage outside `public_html` and every addon domain document root.

```text
/home/account/
  public_html/                      host-managed document root
  womenriseafg/
    releases/RELEASE_ID/             private Application Path, contains app.js
    data/storage/                    private, persistent across releases
    backups/                         private backup working directory
    logs/                            private maintenance logs
```

In a fresh shell as the account owner, verify the archive digest before extraction. The commands below assume the folder for `RELEASE_ID` is new and the archive is in a separate private incoming directory.

```bash
umask 077
wra_base="$HOME/womenriseafg"
wra_release="$wra_base/releases/RELEASE_ID"
wra_archive="$HOME/incoming/womenriseafg-deployment.tar.gz"
sha256sum "$wra_archive"
tar -tzf "$wra_archive"
mkdir -p "$wra_base/data/storage" "$wra_base/backups" "$wra_base/logs" "$wra_base/releases"
mkdir "$wra_release"
tar --no-same-owner -xzf "$wra_archive" -C "$wra_release"
cd "$wra_release"
npm ci --omit=dev --ignore-scripts --workspace @womenriseafg/server
install -m 600 .env.example .env
```

Check that the archive includes `app.js`, the manifests and lockfile, `client/dist/` and `server/dist/`. The built frontend includes its hashed assets, precompressed variants, manifest, service worker, offline fallback, fonts and licence notices. The host installs only the runtime workspace. Express serves the frontend and `/api/v1` through the same startup entry. Use the selected provider's private runtime directory layout if its Node selector manages dependency installation.

## Configure the environment and storage

Edit the private release-root `.env` or use the application manager's environment settings. Process variables take precedence. If the manager supplies the variables, also provide the intended values securely to the database CLI and cron, which run outside Passenger. File-based variables can be reused by the CLI. Keep file permissions `0600` for secrets, backup files, and private logs, and start with `0700` for owner-only directories. Use the provider's documented traversal permissions to let Passenger locate the application. Confirm the process runs as the account owner and keep private media owner-only. Files uploaded by the app are created with `0600`. A restore must preserve their account ownership and permissions.

| Variable | Production value |
| --- | --- |
| `NODE_ENV` | `production`. `app.js` selects production. Set it explicitly for CLI jobs. |
| `HOST`, `PORT` | For the fixed TCP option, use loopback and the provider-assigned private port. Native Passenger controls its app socket. Keep the direct listener outside public access. |
| `DB_HOST`, `DB_PORT` | The provider's private TCP MySQL address and port. Confirm TCP instead of assuming a Unix socket is supported by this configuration. |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD` | The provider's full database and runtime user names, and a strong password. cPanel may add the account prefix. |
| `STORAGE_ROOT` | Full, canonical `/home/account/womenriseafg/data/storage` outside web document roots, with `media/incoming` and `media/objects` on the same filesystem. |
| `MEDIA_MAX_UPLOAD_BYTES` | Integer byte limit within the provider's request limits, including margin for multipart metadata. |
| `SHORT_MAX_SECONDS` | Default 90 seconds. Set the editorial maximum for Shorts and variants. |
| `AUTH_PUBLIC_ORIGIN` | Exact browser-facing origin, e.g. `https://learn.example.com`. Use lower-case hostname and omit the trailing slash. |
| `AUTH_TRUSTED_PROXY_IPS` | Leave empty with native Passenger. For a provider-managed TCP proxy, set only the verified immediate proxy IPs. Require the trusted proxy to overwrite forwarded scheme, host and client address using the actual connection. |
| `LOG_LEVEL` | `info` or the operational level approved for the host. Keep private logs with a retention and rotation limit. |

Verify actual account quota in cPanel because the application's storage usage view can reflect the underlying filesystem. Use the private storage folder with app-managed UUIDs and keep Apache aliases away from it. [Express proxy configuration](https://expressjs.com/en/5x/guide/behind-proxies/)

## Initialize MySQL and the first administrator

1. Use cPanel Database Wizard or the provider's database tools to create a dedicated schema with InnoDB and `utf8mb4`. Add a runtime DB user with `SELECT`, `INSERT`, `UPDATE` and `DELETE` on this schema. Use a separate migration user with those grants plus `CREATE`, `ALTER`, `INDEX` and `REFERENCES`. Allow at least two concurrent connections for migrations. [cPanel Database Wizard](https://docs.cpanel.net/cpanel/databases/database-wizard/)
2. Back up an existing schema and its matching media before upgrading. Run the migration CLI once from the prepared release with the migration user, then rerun it and confirm the schema is current.

   ```bash
   read -r -p 'Migration DB user: ' wra_db_migration_user
   read -r -s -p 'Migration DB password: ' wra_db_migration_password
   printf '\n'
   NODE_ENV=production DB_USER="$wra_db_migration_user" DB_PASSWORD="$wra_db_migration_password" npm run db:migrate
   unset wra_db_migration_user wra_db_migration_password
   ```

3. On a new schema, use the runtime DB user to initialize the first super administrator. Choose a username and enter its unique passphrase into a trusted terminal without shell tracing. Use `auth:recover` with the current administrator username if a later recovery is needed. Recovery resets the password and revokes the administrator's existing sessions.

   ```bash
   read -r -s -p 'Administrator passphrase: ' wra_admin_passphrase
   printf '\n'
   printf '%s' "$wra_admin_passphrase" | NODE_ENV=production npm run auth:bootstrap -- administrator
   unset wra_admin_passphrase
   ```

4. Schedule session cleanup daily under **cPanel → Advanced → Cron Jobs** after the manual command succeeds. This example runs at 02:17 in the scheduler's timezone. Substitute the approved absolute Node path and active release. Update the job when switching releases. Limit log retention.

   ```cron
   17 2 * * * umask 077; cd /home/account/womenriseafg/releases/RELEASE_ID && NODE_ENV=production /opt/cpanel/ea-nodejs22/bin/node server/dist/identity/cli.js purge-sessions >> /home/account/womenriseafg/logs/sessions.log 2>&1
   ```

[cPanel Cron Jobs](https://docs.cpanel.net/cpanel/advanced/cron-jobs/)

## Configure cPanel, Apache and HTTPS

1. Ask the provider to provision the canonical domain and a renewable certificate. In cPanel, check **SSL/TLS Status**, run AutoSSL if available, and enable **Force HTTPS Redirect** for the canonical domain once HTTPS works. Configure the HTTP and alias redirects at the provider's edge. Confirm that a public HTTP request reaches the redirect before Express. [cPanel SSL/TLS Status](https://docs.cpanel.net/cpanel/security/ssl-tls-status/) · [cPanel Domains](https://docs.cpanel.net/cpanel/domains/domains/)
2. Register the release in **cPanel → Software → Application Manager**, or use the provider's equivalent. Use the selected domain, base URL `/`, private path `womenriseafg/releases/RELEASE_ID`, `app.js` startup file and **Production** mode. If the control panel requires a different application directory or blocks root mapping, ask the provider to configure an isolated application vhost. Published links, static assets and the service worker use root-relative paths. [Install a Node.js application in cPanel](https://docs.cpanel.net/knowledge-base/web-services/how-to-install-a-node.js-application/)
3. For native Passenger, confirm the official Node loader and access restrictions on the application Unix socket. Passenger introduced secure headers in 5.0.21. Confirm that the TLS vhost supplies `!~Passenger-Proto` as `https` and `!~Passenger-Client-Address` as a literal IP. If the host terminates TLS before Apache, ask how the original HTTPS scheme and IP are preserved in that trusted path. For a private TCP proxy, confirm it overwrites forwarding headers, preserves the real client address, and reaches only the loopback listener. Run the TLS and client-address checks on authorized staging. [Passenger port binding](https://www.phusionpassenger.com/docs/advanced_guides/in_depth/node/reverse_port_binding.html) · [Passenger secure HTTP headers](https://www.phusionpassenger.com/docs/advanced_guides/in_depth/node/secure_http_headers.html)
4. Route all requests for this origin to the app, including `/api/v1`, React deep links, and the worker. Express serves SPA HTML only for navigation and preserves API and asset error responses. A blanket `.htaccess` fallback to `index.html` would bypass this handling. Leave directory listing disabled. Set Apache request body and timeout limits with provider approval. [Apache LimitRequestBody](https://httpd.apache.org/docs/2.4/mod/core.html#limitrequestbody)
5. Keep all uploaded files behind the app's controlled media and book routes. Apache may serve approved build assets through its static configuration if the provider needs it. Use a separate published copy or explicit read-only mappings for public build assets such as `/assets/`, `/art/`, and `/icons/`. Keep the HTML, all SPA routes, API, worker and manifest with Express. The static mapping must preserve correct JavaScript module, CSS, font, image and audio MIME types, immutable caching for hashed assets, revalidation of stable names, compression negotiation and missing-file 404 responses. Verify the configuration on authorized staging before enabling it. Raw storage, draft files, exports, source maps and release data stay private. [Apache file configuration](https://httpd.apache.org/docs/2.4/howto/htaccess.html)

Use the manager's **Restart** action when available. For a provider using the default Passenger restart file, run the following from the registered release. Request `/api/v1/health` after the restart to trigger lazy startup and then check readiness.

```bash
cd "$HOME/womenriseafg/releases/RELEASE_ID"
umask 077
mkdir -p tmp
touch tmp/restart.txt
```

[Passenger restart instructions](https://www.phusionpassenger.com/docs/tutorials/reloading_code/node/)

## Staging acceptance checks

Run against an authorized staging origin and a dedicated staging database. Substitute a reviewed test video ID and a two-page PDF from fixtures created there. Keep HTTP status and header results in the release record, omitting credential values and headers that contain them.

```bash
wra_origin=https://learn.example.com
curl -sSI http://learn.example.com/
curl --fail --silent --show-error "$wra_origin/api/v1/health"
curl --fail --silent --show-error "$wra_origin/api/v1/ready"
curl -fsSI "$wra_origin/courses"
curl -fsSI "$wra_origin/sw.js"
curl -fsSI "$wra_origin/manifest.webmanifest"
curl -sSi "$wra_origin/api/v1/nonexistent"
curl -fsS -D - -o /dev/null -H 'Range: bytes=0-99' \
  "$wra_origin/api/v1/media/REVIEWED_TEST_VIDEO_ID/file"
```

- Confirm the HTTP edge redirects to the canonical HTTPS address with a valid certificate. Health and readiness return 200 and the guest catalog responds. A missing API or asset returns 404. Refresh a real course and lesson deep link.
- Check the worker and manifest use revalidation. Check account and administrator pages and auth responses use `no-store`. Anonymous access to the administrator API returns 401. Sign in and out with a staging learner and administrator. The production session cookie is `Secure`, `HttpOnly` and `SameSite=Strict`. Check a learner receives 403 on the administrator API. Confirm the provider's proxy reports distinct real client addresses safely.
- Confirm approved uploads succeed near the planned size limit and a controlled oversized file is rejected. Confirm video and PDF seeking use 206 with the expected `Content-Range`, content type and file length. Confirm a restricted file can be viewed as allowed and its attachment request is denied. Keep draft media and other private paths inaccessible.
- Check English, Pashto and Dari routes, including offline access initiated by the user. Confirm the service worker loads and its scope is the canonical origin. Verify the host serves all build files, including the PDF.js module worker, and prevents HTTP access to configuration, backup, source and storage paths.
- Check the scheduled job's result and the private log, confirm a restart retains persisted data, and capture account CPU, memory, disk, inode and bandwidth observations at approved staging traffic.

## Backup and restore

Take a coordinated backup before every migration and on an agreed schedule. Pause writes and media uploads for the snapshot window so the database export and local files agree. Keep previous release archives and lockfiles, a protected record of production settings, the schema export, and private storage. Store secrets encrypted separately or in the approved secret manager. Backups contain private data. Restrict access, transfer over a protected channel, and keep a verified encrypted copy off-account. Record UTC date, release ID, checksum, database version, media file count and restoration test date. Confirm the provider's backup paths and retention. A full account restore through cPanel typically requires provider access to WHM. [cPanel Backup Wizard](https://docs.cpanel.net/cpanel/files/backup-wizard/)

If the provider supplies compatible MySQL CLI tools, use an account with access to export the application schema. Replace the example hostname, port, account names and date before running. The CLI prompts for the database password.

```bash
umask 077
wra_backup="$HOME/womenriseafg/backups/SNAPSHOT_ID"
mkdir "$wra_backup"
mysqldump --protocol=TCP -h 127.0.0.1 -P 3306 -u account_backup -p \
  --default-character-set=utf8mb4 --single-transaction --quick --no-tablespaces \
  --skip-add-locks --skip-add-drop-table --skip-triggers --set-gtid-purged=OFF \
  account_womenriseafg > "$wra_backup/database.sql"
tar -czf "$wra_backup/storage.tar.gz" -C "$HOME/womenriseafg/data" storage
(cd "$wra_backup" && sha256sum database.sql storage.tar.gz > SHA256SUMS)
```

Check success of each command before moving on. `--single-transaction` gives an InnoDB snapshot. Keep schema-changing operations paused during the export. If the host restricts dump options, use the provider's supported export and verify it can be imported into an empty schema. [MySQL mysqldump](https://dev.mysql.com/doc/refman/8.0/en/mysqldump.html)

Restore into a new empty private schema and a fresh storage directory first. Confirm the target names and verify the checksums and archive paths. The example presumes a restore user with the required privileges on the new schema and a backup file made with the commands above.

```bash
umask 077
wra_backup="$HOME/womenriseafg/backups/SNAPSHOT_ID"
wra_restore="$HOME/womenriseafg/data/restore-SNAPSHOT_ID"
(cd "$wra_backup" && sha256sum -c SHA256SUMS)
tar -tzf "$wra_backup/storage.tar.gz"
mkdir "$wra_restore"
tar --no-same-owner -xzf "$wra_backup/storage.tar.gz" -C "$wra_restore"
mysql --protocol=TCP -h 127.0.0.1 -P 3306 -u account_restore -p --default-character-set=utf8mb4 \
  account_wra_restore < "$wra_backup/database.sql"
```

Connect a matching release to the restored schema and storage using a separate private configuration. Verify readiness, catalog and metadata counts, administrator access, and sampled video and PDF ranges. Before exposing a restored database, have the operator invalidate restored sessions in that verified schema to prevent old sessions from becoming active again. Obtain owner approval before restoring over any live state or switching production to restored data. Compare activity after the backup cutoff to identify data that needs reconciliation.

## Upgrade and rollback

Stage the new release in a new private directory. Use its own dependency install and protected configuration. Back up the running release, its database and media. Rehearse migration on a restored copy and confirm rollback compatibility. During the approved maintenance window, pause writes and apply the tested migrations against the intended schema. Set the application manager to the new release path, restart, update cron and run staging acceptance checks before reopening access. Keep the previous tested release and the matching backup until the new release is accepted.

If code startup or routing fails and the previous release supports the current schema, point the manager and cron back to the previous release, restart and run the same checks. If schema or data compatibility changed, keep the platform in maintenance, preserve a snapshot of the failed state, and restore the last good database and matching storage to new locations. Validate them with the previous release before any approved switch. Check outstanding writes and reconcile updates after the rollback point with the owner. Group the HTML, service worker and hashed assets by release so old pages can recover by reloading and workers can refresh their offline copies.

## Troubleshooting

| Symptom | Where to check |
| --- | --- |
| Passenger 500, 502 or spawn timeout | View the account's application log. Check the selected Node version, private release path, installed server workspace, `app.js`, both build directories, secret settings and worker permission. Restart using the applicable manager. |
| Health works and readiness returns 503 | Check MySQL TCP reachability, account prefixes, schema grant, password and connection quota. If readiness passes while catalog queries fail, check that the intended schema is migrated. |
| Sign-in returns `HTTPS_REQUIRED` or rejects origin | Check the canonical HTTPS hostname, exact `AUTH_PUBLIC_ORIGIN` and the approved proxy mode. Under native Passenger confirm secure metadata reaches Node. Under TCP verify the actual immediate IP and edge HTTPS forwarding. |
| Unexpected 429 or sign-in busy | Check application logs and provider resource limits. Throttling is per source IP per worker. Confirm correct client-address metadata before changing the proxy setup. |
| Deep link returns Apache 404 or an API returns HTML | Confirm the origin's root mapping and remove catch-all index rewrites from the provider config through the approved control panel workflow. Keep `/api/v1` under Express. |
| Upload fails with 413, storage unavailable or timeout | Compare provider request limits and timeouts with `MEDIA_MAX_UPLOAD_BYTES`, actual account disk and inode quota, private storage ownership and hard-link support. Prepare smaller files off-server if needed. |
| Video fails to seek or PDF never renders | Verify permitted publication, exact media type, byte-range responses and front-proxy timeouts. Confirm PDF.js module assets have the JavaScript MIME type. |
| Stale page, missing chunk or offline shell unavailable | Confirm the current HTML, assets, manifest, fallback and worker came from one build, that the origin is secure, and that the browser can fetch the worker and build assets. Retry enabling offline access while connected and reload after a release refresh. |
| Migration lock or privilege failure | Confirm the schema and migration account have the required grants and two available connections. Check for another active migration before retrying in the approved window. |

