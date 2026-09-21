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
- **AI models:** none
- **Started:** 2026-09-20T09:11:06Z
- **Last updated:** 2026-09-21T22:50:40Z

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
