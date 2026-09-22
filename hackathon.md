# Hackathon log

- **Project:** Realtrail
- **Event:** Convex All Gas Hackathon
- **What it does:** AI-assisted estate operations control center that turns resident and property issues into tracked cases with verified resolution.
- **Live app:** not deployed
- **Repo:** https://github.com/onyebuchidaniel60/Realtrail
- **Frontend:** Convex static hosting
- **Convex deployment:** https://utmost-stork-432.eu-west-1.convex.cloud
- **Components:** none
- **Convex features:** schema, tables, indexes, queries, mutations, actions, HTTP actions, scheduled functions, realtime queries
- **Auth:** Clerk
- **AI models:** OpenAI Responses API for triage and drafts (model ids via OPENAI_TRIAGE_MODEL / OPENAI_DRAFT_MODEL)
- **Started:** 2026-09-20T09:11:06Z
- **Last updated:** 2026-09-22T13:16:28Z

## Log

### 2026-09-19 - b88c96c
Repository created with a placeholder README. No application code yet.

### 2026-09-20 - 992273f
Pinned Node 22 via `.nvmrc` (0357231) and committed the Realtrail specification baseline: product spec, architecture, implementation plan, agent rules, and blueprint (992273f) (`PROJECT_SPEC.md`, `ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`, `AGENTS.md`, `REALTRAIL_COMPLETE_BLUEPRINT.md`).

### 2026-09-20 - 94dfe37
Scaffolded the frontend foundation: Vite + React + TypeScript + Tailwind v4 + shadcn/ui primitives + routing + Vitest + Playwright, with lint, typecheck, unit, build, and e2e scripts all passing (`package.json`, `vite.config.ts`, `src/`, `tests/`).

### 2026-09-20 - 3dc853d
Resolved scaffold inconsistencies: verified the shadcn `cn` package as the canonical class helper and removed oxlint in favor of eslint (`package.json`, `eslint.config.js`).

### 2026-09-20 - 3db4f32
Docs checkpoint: caught up the AI handoff after the Phase 1.1 checkpoints (`AI_HANDOFF.md`).

### 2026-09-20 - a2bea25
Installed the project-local Convex hackathon skill and initialized this build log (`.agents/skills/convex-hackathon-skill/`, `hackathon.md`).

### 2026-09-20 - d0f1000
Installed the Convex capability skill set (including the Convex agent skill) with a `.claude/` mirror for editor compatibility. No schema, functions, auth, or cloud linkage yet (`.agents/skills/`, `.claude/skills/`).

### 2026-09-20 - 504b311
Added the environment template (`.env.example`, variable names only, no secrets) and the Convex-precedence section in `AGENTS.md`: Convex guidance wins on Convex-platform questions, Realtrail docs win on product, scope, security, and integration questions.

### 2026-09-20 - ecf7bf7
Docs checkpoint: AI handoff updated after the hackathon setup audit (`AI_HANDOFF.md`).

### 2026-09-20 - 18fb13f
Phase 1.2: initialized the Convex backend with the base schema (`users`, `workspaces`, `workspaceMembers`), error helpers, and a schema test; provisioned the cloud dev deployment in EU West (`utmost-stork-432`) (79c3aed). Handoff updated (18fb13f). Convex features: schema, tables, indexes (`convex/schema.ts`, `convex/lib/errors.ts`).

### 2026-09-20 - d7974a1
Reconciled `ARCHITECTURE.md` index strategy names with Convex convention (`ARCHITECTURE.md`).

### 2026-09-20 - d86cb42
Phase 1.3-A: added the Clerk auth structure — identity helpers plus workspace-membership and role authorization helpers — and wired ClerkProvider into the app entry (80db840). Handoff updated (d86cb42) (`convex/lib/auth.ts`, `convex/lib/authorization.ts`, `convex/auth.config.ts`, `src/main.tsx`).

### 2026-09-20 - a80bfec
Reconciled `ARCHITECTURE.md` data-model index names with Convex convention (`ARCHITECTURE.md`).

### 2026-09-20 - 0dab3cf
Phase 1.3-B: covered the auth and authorization helpers with tests (11 tests via convex-test identity simulation) and set the Clerk env vars on the deployment (746e0fd). Handoff updated (0dab3cf) (`convex/lib/auth.test.ts`, `convex/lib/authorization.test.ts`).

### 2026-09-20 - 82200e8
Phase 1.4-A: added `users.syncUser` (Clerk identity mirroring), `workspace.getCurrent`, and `workspace.create` (atomic workspace plus owner membership plus first property) with tests (suite total 27) (da572c3). Handoff updated (82200e8) (`convex/users.ts`, `convex/workspace.ts`). Convex features: queries, mutations.

### 2026-09-20 - 1d9aaab
Phase 1.4-B: built the frontend shell — routes (`/sign-in` through `/settings`), responsive AppShell with sidebar, protected-route guard, boot-time `users.syncUser`, and an onboarding form calling `workspace.create` (1b43385). Handoff updated (1d9aaab) (`src/routes/`, `src/components/layout/`, `src/hooks/useSyncUser.ts`). Convex features: realtime queries.

### 2026-09-20 - 39a4b51
Phase 2-A: documented the estate tables in `ARCHITECTURE.md` (bdc352a), then added `properties`, `buildings`, and `units` tables with indexes, atomic first-property creation inside `workspace.create`, and CRUD with cross-workspace IDOR enforcement (suite total 52) (6f6359c). Handoff updated (39a4b51) (`convex/schema.ts`, `convex/properties.ts`, `convex/buildings.ts`, `convex/units.ts`). Convex features: schema, tables, indexes, queries, mutations.

### 2026-09-20 - 41aaafb
Phase 2-B: extended onboarding to collect property name and address, and built the Properties screen (property, building, and unit drill-down with create and edit drawers) plus shared EmptyState, LoadingSkeleton, ErrorState, and StatusBadge components (d8bd404). Handoff updated (41aaafb) (`src/routes/Properties.tsx`, `src/routes/Onboarding.tsx`, `src/components/common/`). Convex features: realtime queries.

### 2026-09-20 - 122a0cf
Phase 3-A: documented the case tables in `ARCHITECTURE.md` (c67071a), then implemented the case domain — `cases`, `caseActivities`, and `caseCounters` tables, a pure state-machine helper enforcing the transition and role matrix, per-workspace monotonic case numbers, and create, update, assign, note, transition, close, and reopen mutations with list and get queries (case tests 78; suite total 136) (a4fd7f8). Handoff updated (122a0cf) (`convex/cases/`). Convex features: schema, tables, indexes, queries, mutations.

### 2026-09-21 - e63dab8
Phase 3-B-1: added the Cases screen (metrics strip, filters, desktop table with mobile cards, load-more pagination, New Case dialog) and a read-only Case Detail (header, issue section, activity timeline) (3af44b2). Handoff updated (e63dab8) (`src/routes/Cases.tsx`, `src/components/cases/`). Convex features: realtime queries.

### 2026-09-21 - 6bd375d
Phase 3-B-2: added the Case Detail action panel with contextual next action and six dialogs (edit, assign, status, note, close, reopen) wired to their mutations with toast feedback (e443176). Handoff updated (6bd375d) (`src/components/cases/CaseActionPanel.tsx`, `src/components/cases/dialogs/`). Convex features: realtime queries.

### 2026-09-21 - d8a1cec
Phase 4-A: added the `dashboard.get` query — metrics, capped attention and up-next lists, operations buckets, and denormalized recent activity, all workspace-scoped and bounded via indexes (fddadf6). Handoff updated (d8a1cec) (`convex/dashboard.ts`). Convex features: queries.

### 2026-09-21 - a0d593c
Phase 4-B: built the Overview dashboard UI — greeting header, attention card, metric cards, operations flow, up-next list, and recent-activity list, mobile-responsive with realtime updates (5a301ca). Handoff updated (a0d593c) (`src/routes/Overview.tsx`, `src/components/dashboard/`). Convex features: realtime queries. AgentMail, OpenAI, and Firecrawl integration is still pending (Phases 5-8); the live app is not deployed yet.

### 2026-09-21 - 30fe625
Phase 5-A: inbound email pipeline. Added `communications` and `inboundEvents` tables with indexes, plus AgentMail inbox placeholders on workspaces (07e8db6, c08043f). `POST /webhooks/agentmail` verifies the Svix signature, dedupes by provider event id, and schedules canonical fetching; the AgentMail client is isolated behind a mockable Node-runtime wrapper with a 3-attempt 60s retry policy; `inbox.list` serves paginated threads with denormalized case references. Verified with 32 new tests (suite total 245). No live AgentMail account yet — all provider responses mocked. Convex features: actions, HTTP actions, scheduled functions (`convex/http.ts`, `convex/email/`, `convex/lib/providers/`).

### 2026-09-21 - 662c371
Phase 5-B: live AgentMail wiring. Set the API key and webhook secret as Convex env vars, verified the API surface against the official docs, and corrected three provisional assumptions from 5-A (base URL, `/v0` prefix, snake_case fields and webhook envelope). Implemented inbox provisioning (`createInbox` with `client_id` idempotency plus internal and public provisioning actions) with 5 new tests (suite total 250). Provisioned the workspace inbox and validated the full pipeline with a real inbound email: webhook verified, event processed, communication stored (3e2aa90). Handoff updated (662c371) (`convex/workspaces/provisioning.ts`, `convex/lib/providers/agentmail.ts`).

### 2026-09-21 - 0ceacd4
Phase 5-C-1: inbox backend for the upcoming UI. Added read state to communications, a thread query returning reading-order messages plus the linked case, manual link-to-case with a timeline activity, and single plus thread-level mark-read. The inbox list now returns read state and a workspace-scoped unread count (cc800c6). Covered with 18 new tests (suite total 268). Handoff updated (0ceacd4) (`convex/email/mutations.ts`, `convex/email/queries.ts`).

### 2026-09-21 - dd8fd58
Phase 5-C-2: inbox UI. Conversation list with unread dots, linked-case badges, and filter tabs; conversation view with reading-order plain-text messages, auto-mark-read, and a link-to-case dialog with case search. Mobile list-to-conversation navigation plus a sidebar unread badge. Also fixed link-to-case to refresh the case's activity ordering. Covered with 22 new frontend tests plus 1 backend test (suite total 291). Handoff updated (dd8fd58) (`src/routes/Inbox.tsx`, `src/components/inbox/`).

### 2026-09-21 - 76bc89c
Phase 6-A: AI triage backend. OpenAI Responses API wrapper with strict JSON-schema output and local shape validation; deterministic triage prompt that treats email as untrusted data; triage action creating NEW cases with referential ID checks and its own retry budget, scheduled from the inbound pipeline; manager accept-triage mutation with role and hierarchy rules. No live key yet — all model responses mocked. Covered with 33 new tests (suite total 324). Handoff updated (76bc89c) (`convex/lib/providers/openai.ts`, `convex/email/triage.ts`, `convex/cases/triage.ts`).

### 2026-09-21 - cf806df
Correction: the triage client is now provider-neutral via a base-URL setting, with OpenRouter supported (routing headers plus strict-output enforcement), and the test runner is pinned to a single worker for deterministic full-suite runs (327 tests green). Handoff updated (cf806df) (`convex/lib/providers/openai.ts`, `vite.config.ts`).

### 2026-09-21 - 436790d
Routing fix: OpenRouter triage requests now pin to Azure Sweden Central with fallbacks disabled and strict-output routing enforced inside a proper provider object (the previous top-level flag would have been ignored). Covered by updated provider tests (suite total 328). Handoff updated (436790d) (`convex/lib/providers/openai.ts`).

### 2026-09-22 - 626cf8e
Phase 6-B: live triage verified end-to-end. With provider credentials set on the deployment, a wrapper probe authenticated and returned valid structured output via Azure Sweden Central; a real inbound email then triaged first-try into a NEW case with manager-reviewable suggestions and a timeline activity. No code changes — verification and docs only. Handoff updated (626cf8e).

### 2026-09-22 - f73999c
Phase 6-C: manager review UI for AI triage. Case Detail gained an AI summary card with a review entry point; the review sheet offers editable fields with advisory hints, collapsible AI details, and accept flow into TRIAGED. All AI text renders as plain text only. Covered with 18 new tests (suite total 346). Handoff updated (f73999c) (`src/components/cases/AISummaryCard.tsx`, `src/components/cases/ReviewTriageSheet.tsx`).

### 2026-09-22 - e8dabf5
Phase 7-A: vendor discovery backend. New tables for the vendor directory and research runs; a docs-verified Firecrawl client (v2 API) with deterministic category-plus-locality search, rule-based rank bands, and bounded contact extraction; a discover action with a per-case cooldown plus save, update, list, and research queries. All provider calls mocked. Covered with 57 new tests (suite total 403). Handoff updated (e8dabf5) (`convex/lib/providers/firecrawl.ts`, `convex/vendors/`).

### 2026-09-22 - c3d6a0a
Phase 7-B: live vendor discovery verified. With the provider key set on the deployment, an isolated search probe returned real results; a discovery run against the triaged water-pressure case then completed with a real ranked provider, extracted contact details, and bounded evidence. No code changes — verification and docs only. Handoff updated (c3d6a0a).

### 2026-09-22 - 33c33fd
Phase 7-C: vendor UI completing Phase 7. A Vendors screen with table and mobile cards, search, category filter, and an add/edit drawer; a vendor section in Case Detail; and a discovery drawer that searches, shows rank-banded evidence cards, and saves plus auto-links in one flow. Covered with 32 new tests (suite total 435). Handoff updated (33c33fd) (`src/routes/Vendors.tsx`, `src/components/vendors/`, `src/components/cases/VendorDiscoveryDrawer.tsx`).

### 2026-09-22 - 18d4027
Phase 8-A: outbound drafting and send backend (no UI, no live email yet). AI drafts vendor and resident emails from case context; a human approval gate moves drafts to pending and schedules a send worker with 3-attempt retry, immediate failure on rejections, and no auto-retry on uncertain outcomes. Drafts, approvals, and delivery states are stored per case with timeline activities. Covered with 57 new tests (suite total 492). Convex features: queries, mutations, actions, scheduled functions (`convex/email/draft.ts`, `convex/email/sendPendingCommunication.ts`, `convex/email/mutations.ts`, `convex/email/queries.ts`). Outbound send path wired on the dev deployment; first live email reserved for Phase 8-B verification. Handoff updated (18d4027).

### 2026-09-22 - ec22766
Phase 8-C: end-to-end AI-assisted outbound email from the case view. A draft composer with AI drafting, manual editing, and a send-confirmation gate that is the only approval path; a communications section renders the plain-text history with delivery states; Contact vendor and Contact resident buttons open the flow. Live send had already been verified in 8-B. Covered with 29 new tests (suite total 521). Convex features: queries, mutations, realtime queries (`src/components/cases/DraftComposerSheet.tsx`, `src/components/cases/SendConfirmationDialog.tsx`, `src/components/cases/CommunicationsSection.tsx`). Handoff updated (ec22766).

### 2026-09-22 - 5f66900
Phase 9-A: resident confirmation backend separating vendor completion from verified resolution. Signed one-time tokens (hash-only storage, 72h default expiry) with a request mutation that moves cases to awaiting confirmation and emails the link, plus an internal consume mutation resolving yes to RESOLVED and no back to work in progress. Covered with 26 new tests (suite total 547). Convex features: schema, tables, indexes, queries, mutations (`convex/cases/confirmation.ts`, `convex/lib/confirmationToken.ts`). Handoff updated (5f66900).

### 2026-09-22 - 4f74bfc
Phase 9-B: public one-time resident confirmation link. A GET page renders Yes/No forms without touching the database; POST consumes the token into a generic success or error page with no case data leakage and no distinction between failure modes. Resolution vs closure is now provable end-to-end on the backend. Covered with 19 new tests (suite total 566). Convex features: HTTP actions (`convex/http.ts`). Handoff updated (4f74bfc).

### 2026-09-22 - 0a77146
Phase 9 complete: signed one-time resident confirmation link plus the manager request UI and live end-to-end verification. Managers request and resend confirmation from the case view with timeline labels for each outcome; a real confirmation email was clicked through to a resident-confirmed RESOLVED case with no delivery or token issues. Covered with 21 new tests (suite total 587). Convex features: queries, mutations, realtime queries (`src/components/cases/ConfirmationPanel.tsx`, `convex/cases/confirmation.ts`). Handoff updated (0a77146).

### 2026-09-22 - 61dd06e
Phase 10: real operational reminders delivered as in-app notifications. Vendor follow-ups fire after silent outbound mail, resident nudges and escalation follow the confirmation chain, all dedupe-safe and state re-checked; the dashboard attention surface now consumes delivery failures and unread counts, with a sidebar badge and drawer. Covered with 44 new tests (suite total 631). Convex features: queries, mutations, actions, scheduled functions (`convex/notifications/`, `convex/lib/reminders.ts`). Handoff updated (61dd06e).

### 2026-09-22 - b8eb6d7
Phase 11: supporting screens polish. The settings screen now edits workspace name, timezone, and currency (owner-only), shows presence-only integration health with the workspace intake address, and signs out from the account section — no secret names or values rendered. The properties screen gained a query-error state; vendors gained "Open related cases", filtering the cases queue through router state with no URL persistence. A token-gated internal workspace cleanup mutation landed with tests; the live smoke-workspace run stays deferred until the admin token exists. Covered with 34 new tests (suite total 665). Convex features: queries, mutations (`convex/workspace/settings.ts`, `convex/admin/cleanup.ts`, `src/routes/Settings.tsx`). Handoff updated (b8eb6d7).
