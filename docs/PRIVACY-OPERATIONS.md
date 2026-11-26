# Learner privacy and correction reporting

The public privacy notice at `/privacy` explains guest access, optional accounts, local learning, certificates, corrections, and shared devices in Pashto, Dari, and English. Review those translations with native speakers and confirm the production policy values below for the selected hosting plan.

## Review correction reports

Published course, lesson, video, Short, AI resource, book, quiz, learning path, and course collection pages offer a correction link. A learner can submit a short plain-text description from the same site without signing in. The server verifies the resource is published before storing the canonical public path, its reference, the message, and timestamps. The submission has no account identifier, email field, or stored network address. Rate limiting uses the connection address in memory within each Node worker, and the host's access logs follow its own policy.

Open **Content corrections** in the administrator workspace. Access requires an administrator-scoped session and `corrections:manage`. Read the issue as text, open the associated learning resource, and make any changes through its normal editorial workflow. Mark the report resolved after investigating it. Use the resolved view to reopen a report if necessary. Staff logs record the status change and authorized actor without the learner's message or report identifier.

## Decide and maintain retention

Record the approved retention periods, responsible operator, access scope, backup locations, and restoration checks before accepting launch data. Confirm the hosting company's separate access-log and backup retention and align the public notice with the approved policy. Existing records stay intact when installing the correction migration.

| Data | Current behavior | Operator decision |
| --- | --- | --- |
| Learner and staff sessions | Sessions last up to eight and two hours respectively. Sign-out revokes the session. The existing `npm run auth:purge-sessions` command removes expired records. | Confirm the daily schedule, log location and restoration procedure. |
| Optional user accounts | Stores the username, password hash, account status and role information. Changing browser preferences or clearing local data leaves server account records in place. | Set and document retention, account closure handling and authorized review criteria. Account deletion and associated records require the approved operational procedure. |
| Certificate verification | A public verification record is stored only when the learner enables it. The optional print name stays in the browser or exported document. Authorized staff can withdraw verification for an exact code. | Confirm verification retention and who may withdraw or restore verification. |
| Corrections | Staff review open reports and resolve them explicitly. A separate command previews or removes older resolved reports using the chosen age. | Approve the age and how to review reports still open. Schedule the apply command only after confirming the preview and backup requirements. |
| Staff and hosting logs | Structured application logs omit request bodies, correction text and session credentials. The provider may record connection metadata independently. | Limit access, establish rotation periods, and verify provider logging and retention. |
| Backups and exports | Database backups can include records described above. Device exports and browser history are managed outside the application. | Establish encrypted storage, access, expiry and verification after restore. Protect backup copies as strictly as the live database. |

Build the server, then preview corrections resolved before the chosen cutoff from the application root. For example, the following preview counts reports that were resolved more than 90 days ago. It prints counts and the cutoff without the messages.

```bash
node server/dist/modules/corrections/retention-cli.js 90
```

For the approved operation, use the runtime database connection and give the exact configured schema name so a wrong environment exits before opening the database connection. Replace the age and schema with the approved values. The cleanup only affects eligible resolved reports.

```bash
node server/dist/modules/corrections/retention-cli.js 90 --apply account_womenriseafg
```

Use the existing procedures in [the deployment runbook](DEPLOYMENT.md) to verify credentials, backups and database restoration. Review any restored reports and sessions against the accepted maintenance policy before use.
