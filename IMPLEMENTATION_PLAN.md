# REALTRAIL — IMPLEMENTATION_PLAN.md

## Operating rule

This plan follows `PROPER_VIBE_CODING_WORKFLOW.md`:

```text
SPECIFICATION
    ↓
ARCHITECTURE
    ↓
INSPECT REPOSITORY
    ↓
IMPLEMENT ONE SMALL PHASE
    ↓
TEST
    ↓
INSPECT
    ↓
FIX
    ↓
COMMIT
    ↓
CHECKPOINT
    ↓
NEXT PHASE
```

Never implement multiple phases in one agent instruction.

Each phase ends at a STOP/VERIFY gate.

---

# Phase 0 — Repository Reconnaissance

## Objective

Understand the repository before making changes.

## Dependencies

None.

## Tasks

1. Read:
   - `PROJECT_SPEC.md`
   - `ARCHITECTURE.md`
   - `IMPLEMENTATION_PLAN.md`
   - `AGENTS.md`
2. Inspect repository structure.
3. Inspect package manager and existing dependencies.
4. Inspect `package.json`.
5. Inspect current Convex setup, if present.
6. Inspect environment files without printing secret values.
7. Inspect existing components and entry points.
8. Report any conflicts with this blueprint.
9. Do not modify application code.

## Expected output

Reconnaissance report only.

## Tests

None.

## Acceptance criteria

- repository structure documented;
- existing architecture documented;
- conflicts identified;
- no source files changed.

## Git checkpoint

No commit unless documentation-only changes are required.

## STOP/VERIFY

Stop after report.

---

# Phase 1 — Project Foundation

## Objective

Establish fixed frontend/backend/auth foundation.

## Dependencies

Phase 0.

## Tasks

- configure React + Vite + TypeScript;
- configure Tailwind;
- configure shadcn/ui primitives;
- add Convex;
- add Clerk;
- wire Clerk + Convex;
- configure Node 22 for Convex actions;
- add environment schema;
- add lint/typecheck/test scripts;
- create root routes;
- create protected app shell;
- create initial sidebar shell.

## Files/components expected

- `src/main.tsx`
- `src/App.tsx`
- `src/router/*`
- `src/components/layout/*`
- `src/components/auth/*`
- `convex/auth.config.ts`
- `convex/schema.ts`
- `convex/lib/auth.ts`
- `convex/lib/authorization.ts`
- test setup.

## Database changes

- `users`
- `workspaces`
- `workspaceMembers`

## API changes

- `workspace.getCurrent`
- `workspace.create`

## UI

- sign-in;
- sign-up;
- protected shell;
- basic responsive sidebar.

## Tests

- authenticated query;
- unauthenticated rejection;
- cross-workspace membership rejection;
- frontend auth states.

## Acceptance

- user can authenticate;
- Convex recognizes identity;
- workspace membership can be created;
- no protected query works without auth;
- lint/typecheck/test pass.

## Git checkpoint

`chore: establish Realtrail foundation`

## STOP/VERIFY

Do not begin onboarding UI for Phase 2 until Phase 1 tests pass.

---

# Phase 2 — Workspace and Property Structure

## Objective

Create the operational estate hierarchy.

## Dependencies

Phase 1.

## Tasks

- onboarding form;
- create workspace;
- create initial property;
- create buildings;
- create units;
- enforce workspace relations;
- implement property queries.

## Database

- `properties`
- `buildings`
- `units`

## API

- `workspace.completeOnboarding`
- `properties.list`
- `properties.create`
- `buildings.list`
- `buildings.create`
- `units.list`
- `units.create`

## UI

- onboarding;
- properties page;
- building/unit forms.

## Tests

- onboarding atomicity;
- property ownership;
- building/property consistency;
- unit/building consistency;
- cross-workspace IDOR tests.

## Acceptance

A new owner can create a workspace with one property and at least one building/unit.

## Git checkpoint

`feat: add estate structure and onboarding`

## STOP/VERIFY

---

# Phase 3 — Case Domain and State Machine

## Objective

Implement the central Case aggregate and lifecycle.

## Dependencies

Phase 2.

## Tasks

- cases schema;
- case number generation;
- state transition helper;
- role checks;
- create/update/assign/note;
- activity timeline.

## Database

- `cases`
- `caseActivities`

## API

- `cases.createManual`
- `cases.get`
- `cases.list`
- `cases.updateFields`
- `cases.assign`
- `cases.addNote`
- `cases.transitionStatus`
- `cases.close`
- `cases.reopen`

## UI

- cases page;
- case cards/table;
- case detail;
- status badges;
- activity timeline.

## Tests

Every allowed transition and every invalid transition.

Also:
- closure role rules;
- resolved-vs-closed rule;
- non-resolution closure rules;
- assignment ownership.

## Acceptance

All case state rules from `PROJECT_SPEC.md` pass.

## Git checkpoint

`feat: implement core case lifecycle`

## STOP/VERIFY

---

# Phase 4 — Dashboard and Realtime Operations

## Objective

Build the manager's operational control center.

## Dependencies

Phase 3.

## Tasks

- dashboard metrics;
- attention list;
- operations flow;
- recent activity;
- realtime queries;
- mobile transformation.

## API

- `dashboard.get`

## UI

- `/overview`;
- metric cards;
- attention card;
- operations state flow;
- up-next list;
- recent activity.

## Tests

- metrics update after mutations;
- case changes appear without refresh;
- empty state;
- loading/error state.

## Acceptance

Second browser sees case change without manual refresh.

## Git checkpoint

`feat: add realtime operations dashboard`

## STOP/VERIFY

---

# Phase 5 — AgentMail Inbox and Webhooks

## Objective

Make external email a real system input/output.

## Dependencies

Phase 3.

## Tasks

- workspace inbox provisioning;
- inbound event schema;
- webhook endpoint;
- signature verification;
- dedupe;
- canonical thread/message fetch;
- local communication storage;
- inbox UI.

## Database

- `communications`
- `inboundEvents`

## API

- `inbox.list`
- `POST /webhooks/agentmail`

## UI

- inbox list;
- conversation pane;
- linked case navigation.

## Tests

- valid webhook;
- invalid signature;
- duplicate event;
- unmapped thread;
- linked thread;
- provider failure.

## Acceptance

A real inbound test email creates one local communication and can be mapped to a case.

## Git checkpoint

`feat: integrate AgentMail inbox`

## STOP/VERIFY

---

# Phase 6 — AI Triage

## Objective

Turn inbound issue text into structured, reviewable triage.

## Dependencies

Phase 5.

## Tasks

- OpenAI client in Convex action;
- triage JSON schema;
- prompt with injection defenses;
- model validation;
- triage persistence;
- retry logic;
- review UI.

## API

- internal `ai.triageInbound`
- `cases.acceptAiTriage`

## UI

- AI summary card;
- suggested priority/category;
- review corrections.

## Tests

- valid model response;
- malformed model response;
- unavailable model;
- prompt injection payload;
- missing property;
- valid candidate relation.

## Acceptance

Inbound email → AI suggestion → manager review → `TRIAGED`.

## Git checkpoint

`feat: add AI case triage`

## STOP/VERIFY

---

# Phase 7 — Vendor Discovery

## Objective

Use Firecrawl for real vendor research.

## Dependencies

Phase 3.

## Tasks

- research schema;
- Firecrawl search action;
- limited scraping;
- result normalization;
- evidence;
- saved vendors.

## Database

- `vendors`
- `vendorResearch`
- `vendorResearchResults`

## API

- `vendors.list`
- `vendors.save`
- internal `vendors.discover`

## UI

- vendor page;
- discovery drawer.

## Tests

- search query construction;
- no-secret forwarding;
- failed scrape;
- no results;
- save vendor;
- cross-workspace access.

## Acceptance

Manager can discover and save a real vendor from a case.

## Git checkpoint

`feat: add Firecrawl vendor discovery`

## STOP/VERIFY

---

# Phase 8 — AI Drafting and AgentMail Sending

## Objective

Allow approved outbound communication.

## Dependencies

Phase 5 + Phase 6 + Phase 7.

## Tasks

- draft generation;
- plain-text editor;
- approval mutation;
- send action;
- provider status;
- activity events;
- error states.

## API

- internal `ai.generateDraft`
- `communications.createDraftRecord`
- `communications.approveSend`
- internal `email.sendPendingCommunication`

## UI

- draft modal;
- send confirmation;
- sent message state.

## Tests

- AI draft validation;
- unauthorized send;
- duplicate approval;
- provider failure;
- uncertain send state.

## Acceptance

Manager can review, edit, approve and send a vendor email.

## Git checkpoint

`feat: add approved AI-assisted email`

## STOP/VERIFY

---

# Phase 9 — Resolution Confirmation

## Objective

Separate vendor completion from verified resolution.

## Dependencies

Phase 8.

## Tasks

- confirmation token creation;
- public GET confirmation page;
- public POST confirmation;
- expiry;
- one-time use;
- reminder scheduling;
- resolution activity;
- reopen logic.

## Database

- `confirmationTokens`
- `notifications`

## API

- `cases.requestConfirmation`
- `GET /confirm`
- `POST /confirm`

## Tests

- valid yes;
- valid no;
- expired token;
- reused token;
- wrong workspace/case;
- case already closed;
- concurrent confirmation attempts.

## Acceptance

Yes → `RESOLVED`; No → `WORK_IN_PROGRESS`; closure still requires manager/owner.

## Git checkpoint

`feat: add verified resolution flow`

## STOP/VERIFY

---

# Phase 10 — Reminder and Attention System

## Objective

Ensure waiting states produce operational attention.

## Dependencies

Phase 9.

## Tasks

- vendor follow-up schedule;
- resident reminder schedule;
- escalation;
- unread notifications;
- dashboard attention logic.

## Tests

Use fake timers and scheduled-function support.

Convex's testing tools support testing scheduled functions with fake timers. citeturn930017search0

## Acceptance

A waiting case creates the appropriate follow-up state and does not repeat reminders after completion.

## Git checkpoint

`feat: add operational reminders`

## STOP/VERIFY

---

# Phase 11 — Properties, Vendors and Settings Polish

## Objective

Finish supporting application surfaces without adding ERP scope.

## Tasks

- properties page polish;
- vendors page polish;
- settings;
- workspace preferences;
- integration status.

## Do not add

- accounting;
- leases;
- rent;
- complex resident records;
- asset management.

## Tests

Access/visibility tests.

## Git checkpoint

`feat: complete supporting operations screens`

## STOP/VERIFY

---

# Phase 12 — Responsive UX and Accessibility Pass

## Objective

Bring the entire app to the defined visual system and responsive standard.

## Tasks

- desktop layout;
- tablet layout;
- mobile card transformation;
- touch targets;
- keyboard navigation;
- focus states;
- screen-reader labels;
- empty/loading/error states;
- visual consistency.

## Acceptance

- no major horizontal overflow at supported breakpoints;
- mobile case detail is single-column;
- tables transform into cards;
- all critical actions are keyboard accessible;
- color is not the only status signal.

## Git checkpoint

`refactor: complete responsive and accessibility pass`

## STOP/VERIFY

---

# Phase 13 — Security and Abuse Audit

## Objective

Dedicated adversarial review, separate from feature coding.

## Tasks

Review:
- authentication;
- authorization;
- IDOR;
- webhook signature verification;
- replay;
- duplicate events;
- confirmation token security;
- XSS;
- SSRF;
- prompt injection;
- secrets;
- privilege escalation;
- race conditions;
- external API abuse.

Do not change code in first pass.

## Output

Security findings report.

## Acceptance

No unresolved P0/P1 vulnerabilities.

## Git checkpoint

`security: complete adversarial audit`

## STOP/VERIFY

---

# Phase 14 — Test and Production Hardening

## Objective

Prove the whole product.

## Tasks

- unit tests;
- Convex integration tests;
- frontend tests;
- Playwright E2E;
- production build;
- environment verification;
- smoke test production;
- deployment rehearsal.

## Required commands

```text
npm run lint
npm run typecheck
npm run test:once
npm run build
npm run test:e2e
```

## Git checkpoint

`test: complete MVP verification`

## STOP/VERIFY

---

# Phase 15 — Hackathon Packaging and Deployment

## Objective

Prepare actual submission assets.

## Tasks

- public GitHub repository;
- `hackathon.md`;
- public `convex.site` URL;
- three-minute demo;
- README;
- verify sponsor stack evidence;
- final screenshots;
- final smoke test.

The current Convex All Gas page states that the submission requires a public repo, `hackathon.md`, live app URL, and three-minute video. citeturn383237search0

## Acceptance

A fresh browser can open the public app and complete the core case workflow.

## Git checkpoint

`chore: prepare hackathon submission`

## STOP/VERIFY

---

# Small-Task Rule

Within each phase, do not issue one giant coding request.

Example:

```text
Phase 3
  Task 3.1 schema
  STOP
  Task 3.2 authorization
  STOP
  Task 3.3 create case
  STOP
  Task 3.4 state transition
  STOP
  Task 3.5 case UI
  STOP
```

Every task must include:
- exact files;
- acceptance criteria;
- tests;
- "Do not change unrelated functionality";
- "STOP after task."

---

# Agent Verification Template

After every task:

```text
Implemented:
- ...

Files changed:
- ...

Tests run:
- ...

Actual results:
- ...

Known issues:
- ...

Git commit:
- ...

STOPPED.
```
