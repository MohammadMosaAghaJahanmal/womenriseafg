# womenriseafg development rules

Build the free multilingual learning platform for Afghan girls and women in the project's numbered stages. The owner's master development brief and their explicit stage authorizations govern scope. The website name is womenriseafg.

## Stage boundaries

Start by reading this file, README.md and docs/PROGRESS.md. Confirm the currently authorized stage from the owner's message. Inspect the repository, Git status and the relevant existing code before editing. Preserve working behavior and user changes. Implement only that stage's acceptance checklist. A mention of a later feature is a roadmap item. Obtain explicit approval for the next stage or for splitting an authorized stage into separate tasks. Discuss destructive changes and a backup strategy with the owner before proceeding.

Record actual commands, results, limits and remaining work in docs/PROGRESS.md. Report the stage number, name and status, implementation, preserved functionality, files changed, database changes, UI, security and privacy, test results, issues, hosting compatibility and next stage. Stop after each stage and wait for explicit approval. For a completed stage end with “STAGE [NUMBER] COMPLETED. I HAVE STOPPED WORKING. WAITING FOR YOUR APPROVAL BEFORE STARTING THE NEXT STAGE.” Report an incomplete stage accurately.

## Architecture and product constraints

Use the single-provider modular monolith. Keep React, Vite and TypeScript in client/ and Express, Joi, Sequelize and MySQL in server/. Use the approved stage-specific libraries as their features arrive. Use /api/v1 on the same origin, one Linux cPanel account, local media storage, and a built frontend in production. Keep databases, source, secret configuration and private uploads outside the public document root. Select dependencies compatible with the host's supported Node version.

All educational content is free. Guest learning must remain available. Minimize learner data, make local progress and downloads opt-in, and keep private account data out of caches and logs. Use server-side authorization for future privileged features. Track content rights and human review. Host required assets locally. Prepare media variants off-server.

Preserve the original design references. Use the master brief for the single design system, Pashto (ps) and Dari (fa-AF) RTL, English (en) LTR, independent interface/content languages, keyboard access, dark mode and low-data behavior as those stages are approved. Do not ship demo metrics, inactive actions, unlicensed assets or unrelated features.

## Verification

Run applicable lint, types, tests, production build and normal development and production entry points. Inspect API behavior, data changes, permissions and privacy impacts. With UI changes check responsive sizing, RTL/LTR and loading, empty and error states as applicable. Use isolated data for integration checks. Only claim checks actually executed. Confirm live hosting and deployment with the owner in their authorized stages.
