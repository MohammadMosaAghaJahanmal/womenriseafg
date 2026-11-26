# womenriseafg · Production readiness follow-up

## Status

The updated release implements the local readiness work described below. Hosting, launch material selection and publication remain with the owner, as requested. Local verification used synthetic content and a disposable database.

## Changes

| Area | Delivered behavior |
| --- | --- |
| Staff and roles | Super administrators manage roles, course assignments and a private staff audit. Contributor sessions can edit, translate or approve review work only within their assignment. Role changes revoke previous sessions. |
| Course collection and discovery | Named multilingual course collections have an independent catalogue, search and publication workflow. Collections contain published courses in staff-defined order and can receive learner correction reports. |
| Curriculum and content rights | Image and inline quiz lessons are available. Courses, lesson copy, quizzes and questions support structured source, creator, licence, attribution and AI provenance. New or republished material must meet the applicable review and provenance rules. Existing publications remain readable. |
| Illustration accessibility | AI illustrations accept authored alternative text per translation. New approvals require a description. Earlier published illustrations retain their title fallback until reviewed again. |
| Learner corrections and privacy | The three-language notice is available at /privacy. Guests can report a problem with published material without an account or contact field. Authorized staff resolve and reopen reports. The retention command previews eligible resolved reports by default. |
| Certificate management | Staff configure available printable layouts and localized headings. Exact-code lookup can withdraw or restore public verification. Names entered for printing stay in the browser or its exports. |
| Administration and appearance | The owner-only Operations page shows actual media usage, database status, recent staff activity and operator-recorded backup or restore checks. Core admin catalogues and discovery lists can sort the current page by title. Staff can set the site’s appearance default while each learner’s saved choice takes priority. |
| Learner catalogue and loading | Course cards can save and resume learning through the existing opt-in controls, show completion, and keep card actions clickable. Longer subject labels fit better. Homepage content starts with the hero while its catalogue loads. Failed page assets show a localized retry action. |

## Database and release

Seven additive migrations introduced staff assignments and audit, curriculum authoring, correction reports, course collections, certificate management, illustration descriptions, and operations records. The production-style fixture reached 50 tables and 18 applied migration entries. The migration user ran the CLI twice and the limited runtime user served the site. Follow the included deployment runbook for backup, migration and restart when upgrading an existing installation.

The archive includes the compiled client and server, pinned runtime manifests, the deployment runbook and the privacy operations guide. The package entry listing was inspected for source, test files, installed packages, credentials, storage and database dump exclusions.

| Release property | Value |
| --- | --- |
| File | `womenriseafg-deployment.tar.gz` |
| Size | 3,641,622 bytes |
| SHA-256 | `a57c4d4e73b97ae4496cbf0c41cf38238fe318bb47360e0ca798a31e9a2e69fb` |
| Archive entries | 353 including directories |
| Local runtime | Node 22.14.0, npm 11.21.3, MySQL 8.0.31 |

## Verification

| Check | Result |
| --- | --- |
| `npm test` with identity integration enabled | 42 passed, zero failures and zero skips on isolated MySQL. Covered earlier workflows and staff assignments, corrections, privacy, curriculum, collections, certificate controls and operations. |
| `npm run lint`, `npm run typecheck`, `npm run build`, `npm run package:deployment`, and `git diff --check` | Passed. The staging archive build emitted 20 approved offline assets. Final lint and types ran after the route-retry change. |
| `npm audit`, `npm audit --omit=dev` and locked server runtime install | Zero known vulnerabilities reported. The clean Windows runtime install added 127 packages. |
| Development and extracted production smoke | Development HTML and proxied readiness returned 200. Extracted `app.js` ran with local HTTPS, least-privilege MySQL and existing fixture content. |
| Linux Passenger Node loader | The updated server ran through Ubuntu's Passenger loader on a private Unix socket. Health, SPA routes, protected HTTPS checks, caching and rate-key behavior passed. The delivered archive's compiled server, startup file and dependency manifests matched that tested copy by SHA-256. |
| Chrome workflows | Real HTTPS checks covered scoped course editing and revocation, collections, certificate settings and withdrawal, guest corrections and resolution, inline quiz grading, image/illustration descriptions, actual operations data, opt-in progress and offline permissions. |
| Browser matrix and translation parity | 324 Chrome route checks, 48 homepage layouts and 60 scoped axe scans in light and dark English, Pashto and Dari. Firefox 153 passed 30 localized viewport and route checks, PDF navigation, video metadata and cold offline reload. The structural locale audit covered 19 bundles and 1,547 messages. All 12 design reference hashes matched. |
| Course-card and retry regressions on the delivered archive | Native pointer activation passed for Save, with resume and both title orderings also verified. Blocking the homepage bundle produced a localized error and keyboard recovery in all three locales. Cold offline downloads and playback passed again on the delivered archive. |

A single cold Chrome pair used a 390 × 844 viewport, 200 ms latency, 200 KiB/s download, 90 KiB/s upload and 4× CPU throttling. Standard and data-saving modes transferred 502,025 and 481,334 bytes. LCP was 3.116 and 2.088 seconds. CLS was 0.014 in both modes. A previous throttled asset request left the homepage blank. The delivered build has localized retry handling, which was verified with an induced bundle failure. Field performance and native-device behavior remain separate checks.

The disposable web and MySQL services were stopped. Their listening ports closed and temporary database, administrator and TLS credentials were removed.

## Scope and owner handoff

- The archive includes `docs/DEPLOYMENT.md` and `docs/PRIVACY-OPERATIONS.md`. The owner handles the host, domain and TLS configuration, plan limits, backup scheduling, retention decisions and launch materials with their rights and editorial approval.
- Staff assignments cover course work. Other authoring uses the existing permission-gated CMS. Operations shows staff audit activity and recorded backup checks. Private application and hosting logs carry other security events, and backups and restoration run through operator tools.
- Website appearance and web branding are staff-configurable. Installed PWA icons and metadata use the build configuration. Course progress percentages appear on the course details page.
- Physical-device installation, assistive-technology verification and native-speaker review of actual launch materials remain open. The browser tests apply to the examined fixture states.
- The current build still reports Zod annotation and chunk-size warnings. The locked runtime install reports an existing transitive `dottie` deprecation. Both dependency audits passed.

The implementation touched the course, quiz, discovery, media, identity, staff, correction, certificate, homepage, library and operations modules. It also updated routing, shared catalogue controls, the offline worker, package contents and documentation. The original design reference images matched their baseline.

