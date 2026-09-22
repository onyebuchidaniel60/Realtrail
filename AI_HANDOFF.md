# REALTRAIL — AI_HANDOFF.md

## 1. Project

**Realtrail** is an AI-assisted estate operations control center.

Core workflow:

```text
REPORT
  ↓
UNDERSTAND
  ↓
COORDINATE
  ↓
TRACK
  ↓
RESOLVE
```

Central object:

**Case**

---

# 2. Source of truth

Read in this order:

1. `PROJECT_SPEC.md`
2. `ARCHITECTURE.md`
3. `IMPLEMENTATION_PLAN.md`
4. `AGENTS.md`
5. this file

Do not redesign the product from scratch.

---

# 3. Current architecture

```text
React + TypeScript + Vite
        ↓
Clerk auth
        ↓
Convex React client
        ↓
Convex
 ├── database
 ├── queries
 ├── mutations
 ├── actions
 ├── scheduler
 └── HTTP actions
        ├── OpenAI
        ├── Firecrawl
        └── AgentMail
```

Hosting:
- Convex static hosting;
- public `convex.site` URL for hackathon.

---

# 4. Current MVP

Must prove:

```text
Resident email
   ↓
AgentMail
   ↓
Case
   ↓
OpenAI triage
   ↓
Manager review
   ↓
Firecrawl vendor discovery
   ↓
AI email draft
   ↓
Manager approval
   ↓
AgentMail vendor email
   ↓
Vendor reply
   ↓
Schedule / work
   ↓
Resident confirmation
   ↓
Resolved
   ↓
Manager closes
```

---

# 5. Case states

```text
NEW
TRIAGED
IN_PROGRESS
VENDOR_CONTACTED
SCHEDULED
WORK_IN_PROGRESS
AWAITING_CONFIRMATION
RESOLVED
CLOSED
```

Negative confirmation:
`AWAITING_CONFIRMATION → WORK_IN_PROGRESS`

Reopen:
`CLOSED → IN_PROGRESS`

---

# 6. Current phase

**Phase 8 — AI Drafting and AgentMail Sending (in progress). Sub-task 8-A complete (backend). 8-B pending (live send verification, human step). 8-C pending (draft UI).**

---

# 7. Completed work

At project creation:

- product definition complete;
- MVP scope complete;
- user roles complete;
- case lifecycle complete;
- data model complete;
- architecture complete;
- security architecture complete;
- UI/UX structure complete;
- integration architecture complete;
- phased implementation plan complete.

Application implementation (in progress):

- Phase 0 reconnaissance complete.
- Pre-Phase-1 environment setup complete (execution policy, fnm + Node 22 pin, spec baseline commit).
- Phase 1.1 scaffold + Phase 1.1b fixes committed at 94dfe37: Vite + React + TS + Tailwind v4 + shadcn/ui + routing + Vitest + Playwright, all five verification commands passing. (Phase 1.1b: typecheck script fixed to actually catch errors; postcss/autoprefixer/tailwindcss-animate removed; @/ relocation verified clean.)
- Phase 1.1c committed at 3dc853d: `cn` helper verified canonical (shadcn `cn` package, drop-in for clsx + tailwind-merge); oxlint removed, eslint is the linter.
- Convex All Gas Hackathon setup executed per official prompt. Environment: OpenCode (Muse Spark). Convex skills (33) + MCP configured (restart-pending). Hackathon skill installed project-locally. hackathon.md created at project root. Frontend hosting decision recorded: Convex static hosting (convex.site).
- Read-only conflict audit completed: 0 blocking conflicts. Precedence section added to AGENTS.md establishing: Convex wins on Convex-platform questions; our docs win on Realtrail product/scope/security/integration questions. MCP state-modifying tools constrained to per-task human approval.
- convex/_generated/ bindings committed (fresh-clone reproducibility).
- Phase 1.2: Convex cloud dev deployment provisioned at eu-west-dev (EU West, Ireland; https://utmost-stork-432.eu-west-1.convex.cloud). Base schema (users, workspaces, workspaceMembers) deployed. convex-test harness operational. Convex MCP server confirmed active post-restart.
- Phase 1.3-A: Installed @clerk/clerk-react and @clerk/testing. Created convex/lib/auth.ts (getAuthenticatedIdentity, getCurrentUser, requireUser). Created convex/lib/authorization.ts (requireWorkspaceMembership, requireRole, requireResourceWorkspaceMembership). ClerkProvider wired into src/main.tsx. convex/auth.config.ts updated to reference CLERK_FRONTEND_API_URL (env var not yet set).
- Reconciled ARCHITECTURE.md §31 index names with Convex convention (by_workspaceId, by_userId, by_workspaceId_and_userId).
- Phase 1.3-B: CLERK_FRONTEND_API_URL set as a Convex env var. VITE_CLERK_PUBLISHABLE_KEY configured in .env.local. auth.config.ts verified against the deployed Cloud dev deployment. Auth and authorization helpers covered by tests (count: 11 — 6 auth, 5 authorization, all passing via convex-test withIdentity).
- ARCHITECTURE.md §6 index names reconciled with Convex convention (d7974a1 covered §31; this task covered §6).
- Phase 1.4-A: Added users.syncUser mutation (mirrors Clerk identity to users table, idempotent). Added workspace.getCurrent query (returns workspace + member + needsOnboarding; handles unauthenticated and no-membership cases). Added workspace.create mutation (atomic workspace + owner membership; rejects duplicate membership; validates timezone and currency). All three covered by tests (total test count: 27 — 13 existing + 4 users + 10 workspace).
- Phase 1.4-B: Frontend shell and routing complete. Routes: /sign-in, /sign-up, /onboarding, /overview, /cases, /inbox, /properties, /vendors, /settings (placeholders for later phases). AppShell with responsive sidebar (persistent ≥1280px, collapsible tablet, drawer mobile). ProtectedRoute guard. Boot-time users.syncUser call. Onboarding form calls workspace.create. Placeholder pages render for later-phase screens. Design tokens deferred to Phase 12.
- Phase 2-A: Added properties, buildings, units tables with indexes. Extended workspace.create to create the first property atomically (single mutation, atomic). Added properties/buildings/units CRUD mutations and list queries with cross-workspace IDOR enforcement. All covered by tests (total test count: 52).
- Phase 2-B: Extended onboarding form to collect property name/address (removed compat shim). Built Properties screen with property/building/unit hierarchy navigation and create/edit drawers. Added shared components: EmptyState, LoadingSkeleton, ErrorState, StatusBadge. Frontend tests cover the property/building/unit drill-down.
- Phase 3-A: Added cases, caseActivities, caseCounters tables with indexes. Implemented state machine helper (pure logic, all transitions + role rules). Added cases.createManual (with per-workspace monotonic case numbers), cases.updateFields, cases.assign, cases.addNote, cases.transitionStatus, cases.close, cases.reopen. Added cases.get (with computed allowedActions) and cases.list (search, filters, pagination). Cross-workspace IDOR returns NOT_FOUND per Phase 2-A convention. Case tests: 78 across state-machine (34), mutations (34), queries (10); suite total 136.
- Phase 3-B-1: Cases list screen with metrics strip, filters (search/status/priority/property/category/assignee/sort), desktop table + mobile cards, pagination via "Load more". New Case dialog calling cases.createManual. Read-only Case Detail (header, issue section, activity timeline) with desktop side-panel layout and mobile full-screen. PriorityBadge added. MetricCard added.
- Phase 3-B-2: Case Detail action panel with contextual next action. Six dialogs: EditCaseDialog, AssignDialog, StatusChangeDialog, NoteDialog, CloseCaseDialog, ReopenDialog — each wired to its mutation and respecting allowedActions. ConfirmDialog for destructive actions. Toast feedback via sonner. All actions respect role-based restrictions from the backend.
- Phase 4-A: Added dashboard.get query returning metrics (open, urgent, waitingOnVendor, awaitingConfirmation, resolvedThisWeek), attention list (capped 10, priority then age sorted), operations buckets per status, upNext (capped 5), recentActivity (capped 10, denormalized with caseNumber + caseTitle). All workspace-scoped, bounded via indexes. 4h and 24h thresholds are hardcoded pending Phase 10 env vars.
- Phase 4-B: Overview dashboard UI — greeting header, attention card, four metric cards with variants, operations flow visualization, up-next list, recent activity list. Consumes dashboard.get. Realtime updates verified via test. Mobile-responsive layout (2-col metrics, horizontal-scroll operations flow, stacked sections). Empty state for zero-case workspaces.
- Session bootstrap correction: hackathon.md was stale from Phase 1.2 onward due to an incorrect DO-NOT ban on the file in phase task prompts. Backfilled via the hackathon skill from git history through Phase 4-B. Rule going forward: hackathon.md is updated by the hackathon skill at the end of every phase task, per AGENTS.md §15. It is never included in a DO-NOT list.
- Phase 5-A: Added communications and inboundEvents tables with indexes. Implemented svix signature verification (pure, Web Crypto). Added POST /webhooks/agentmail with dedupe, scheduling, and idempotent retry. Canonical message fetch isolated behind convex/lib/providers/agentmail.ts (Node runtime, mockable via __setFetchMessageForTests). Added inbox.list query with pagination and denormalized case references. No live AgentMail account yet — all tests use mocks. Test count: 245 (was 213).
- Phase 5-B: Live AgentMail account wired. AGENTMAIL_API_KEY and AGENTMAIL_WEBHOOK_SECRET set as Convex env vars. Inbox provisioning implemented (createInbox wrapper + internal provisionAgentMailInbox action + public provisionMyWorkspaceInbox action). Workspace inbox provisioned at onyebuchi-6730@agentmail.to. End-to-end smoke test passed: real inbound email → webhook → inboundEvents row processed → communications row created. Test count: 250 (was 245).
- Phase 5-C-1: Added readAt to communications. Added communications.getThread, communications.linkToCase, communications.markRead, communications.markThreadRead. inbox.list now returns readAt and workspace-scoped unreadCount. Test count: 268.
- Phase 5-C-2: Inbox UI complete — conversation list with unread indicators and linked-case badges, filter tabs (All/Residents/Vendors), conversation view with plain-text messages, auto-mark-read on open, link-to-case dialog with case search. Mobile: list → conversation → back. Sidebar unread badge added. Fixed linkToCase to bump case.lastActivityAt. Test count: 291.
- Phase 6-A: OpenAI client wrapper (Responses API, structured output, mockable). Triage prompt with injection defenses. ai.triageInbound action integrated into the inbound pipeline. cases.acceptAiTriage mutation. Referential ID checks drop invalid AI candidates. Triaged cases start in status NEW with aiTriageStatus completed. Test count: 324.
- Phase 6-A-correction: OpenAI wrapper is now provider-neutral via OPENAI_BASE_URL. OpenRouter is supported (adds HTTP-Referer, X-OpenRouter-Title headers and require_parameters: true when the base URL is openrouter.ai). Vitest maxWorkers pinned to 1 for deterministic full-suite runs.
- Phase 6-A-routing: OpenRouter requests now include a provider object pinning routing to azure/swedencentral with allow_fallbacks: false and require_parameters: true. Fixed the previous misplacement of require_parameters (was top-level, now inside provider per OpenRouter's API shape).
- Phase 6-B: Live OpenRouter wiring verified end-to-end. Human set OPENAI_BASE_URL, OPENAI_API_KEY, OPENAI_TRIAGE_MODEL, OPENAI_DRAFT_MODEL on the deployment. Isolated wrapper probe authenticated and returned valid structured output via Azure Sweden Central. Real inbound email triaged first-try: inboundEvents processed, communications marked triaged, case created NEW/completed/v1 with AI_TRIAGE_COMPLETED activity. No code changes (docs only).
- Phase 6-C: AI Summary card in Case Detail (renders when aiTriageStatus is completed, pending, failed, or not_started). Review triage sheet with editable fields and "AI suggested" hints. acceptAiTriage mutation wired. CaseActionPanel primary action for NEW cases now opens the review sheet. Plain-text rendering enforced — AI output never renders as HTML. Test count: 346.
- Phase 7-A: Added vendors, vendorResearch, vendorResearchResults tables. Firecrawl client wrapper (search + scrape) with test seams. Deterministic query construction (no internal case data leaked). Deterministic rank bands (no numeric scoring). Contact extraction from scraped markdown. vendors.discover action with 60s per-case rate limit. vendors.save, vendors.update, vendors.list queries/mutations. vendorResearch.getResearch query. All tests use mocked Firecrawl. Test count: 403.
- Phase 7-B: Live Firecrawl wired. FIRECRAWL_API_KEY set as Convex env var (by human). End-to-end discovery verified against a real case: search query constructed from category + locality, results normalized with rank bands, contact info extracted where available. No internal case data leaked to Firecrawl.
- Phase 7-C: Vendors screen (table/cards, search, category filter, add/edit drawer). Vendor section in Case Detail (vendor card, link/unlink). Discovery drawer with refinement input, rank-banded result cards, evidence snippets, save-to-vendors action, and automatic case linkage via cases.setVendor. Added case.vendorId field + setVendor mutation + cases.get vendor summary. Test count: 435.
- Phase 8-A: Outbound drafting + send backend (no UI, no live sends — all provider calls mocked). sendMessage wired in the AgentMail wrapper (POST /v0/inboxes/{id}/messages/send, Bearer, 30s timeout, clientId sent as the Idempotency-Key header per current docs; timeout/malformed-200 map to uncertain errors via isUncertainSendError). Draft prompt module with injection defenses (untrusted_thread delimiters) and do-not-invent rules. draftEmail in the OpenAI wrapper (strict {subject, textBody} schema, model from OPENAI_DRAFT_MODEL). ai.generateDraft internalAction (vendor recipient resolves to stored vendor email; resident recipient validated; prior 5 messages as context; persists draft + DRAFT_GENERATED activity; never sends). communications.createDraftRecord (manual-draft path, DRAFT_CREATED/DRAFT_GENERATED). communications.approveSend (human gate: draft-only CONFLICT guard, closed-case rejection, schedules the worker, no provider call inside). email.sendPendingCommunication worker (pending_send → sending claim → sent with provider ids + EMAIL_SENT; 429/5xx retry 3x at 60s; 4xx/config fail fast; timeout/unknown → send_uncertain with no auto-retry). listByCase query (chronological, no provider IDs). Added sendAttempts to communications. Test count: 492 (was 435; +57).

---

# 8. Known decisions

Fixed:

- Convex backend;
- React/Vite frontend;
- Clerk auth;
- AgentMail;
- OpenAI;
- Firecrawl;
- Convex Scheduler;
- no separate API server;
- no Postgres;
- no Redis;
- no payments;
- no resident/vendor portals in MVP;
- no autonomous case closure.

---

# 9. Important files

```text
PROJECT_SPEC.md
ARCHITECTURE.md
IMPLEMENTATION_PLAN.md
AGENTS.md
AI_HANDOFF.md
hackathon.md
```

Scaffold configuration added in Phase 1.1:

```text
.nvmrc (Node 22 pin — required on every fresh shell)
components.json (shadcn/ui config)
playwright.config.ts
vite.config.ts (includes Vitest block)
```

Hackathon setup artifacts:

```text
hackathon.md (root — judge-facing build log)
.agents/skills/convex-hackathon-skill/ (project-local skill we installed)
.agents/skills/convex*/ (33 Convex capability skills — regenerable via `npx convex ai-files install`)
.claude/ (mirror of .agents/skills for Claude Code compatibility)
skills-lock.json (Convex ai-files lockfile)
CLAUDE.md (Convex-managed pointer block; no Realtrail content)
convex/_generated/ (generated bindings; committed per Convex docs)
convex/_generated/ai/guidelines.md (Convex API guidance — authoritative on Convex-platform questions)
.env.example (committed environment template — no secrets)
```

Phase 1.2 backend files:

```text
convex/schema.ts
convex/auth.config.ts (placeholder — Clerk wiring in 1.3)
convex/lib/errors.ts
convex/schema.test.ts
```

Phase 1.3-A auth structure:

```text
convex/lib/auth.ts
convex/lib/authorization.ts
```

Phase 1.4-A API surface:

```text
convex/users.ts
convex/workspace.ts
convex/properties.ts
convex/buildings.ts
convex/units.ts
```

Phase 2-B frontend:

```text
src/routes/Properties.tsx
src/components/common/EmptyState.tsx
src/components/common/LoadingSkeleton.tsx
src/components/common/ErrorState.tsx
src/components/common/StatusBadge.tsx
```

Phase 3-A case domain:

```text
convex/cases/stateMachine.ts (single source of truth for transition rules)
convex/cases/queries.ts
convex/cases/mutations.ts
convex/cases/number.ts
```

Phase 3-B-1 case browse UI:

```text
src/routes/Cases.tsx
src/components/cases/CaseTable.tsx
src/components/cases/CaseCard.tsx
src/components/cases/CaseDetail.tsx
src/components/cases/NewCaseDialog.tsx
src/components/cases/PriorityBadge.tsx
src/components/common/MetricCard.tsx
```

Phase 3-B-2 action layer:

```text
src/components/cases/CaseActionPanel.tsx
src/components/cases/dialogs/*.tsx
src/components/common/ConfirmDialog.tsx
src/components/common/toast.ts
```

Phase 4-A dashboard backend:

```text
convex/dashboard.ts
```

Phase 4-B dashboard UI:

```text
src/components/dashboard/AttentionCard.tsx
src/components/dashboard/MetricCardsRow.tsx
src/components/dashboard/OperationsFlow.tsx
src/components/dashboard/UpNextList.tsx
src/components/dashboard/RecentActivityList.tsx
```

Phase 1.4-B frontend shell:

```text
src/routes/ (all route components)
src/components/layout/AppShell.tsx
src/components/layout/Sidebar.tsx
src/components/layout/ProtectedRoute.tsx
src/hooks/useSyncUser.ts
```

Phase 5-A inbound pipeline:

```text
convex/http.ts
convex/lib/providers/svix.ts
convex/lib/providers/agentmail.ts
convex/email/processInbound.ts
convex/email/queries.ts
```

Phase 5-B live wiring:

```text
convex/workspaces/provisioning.ts
```

Phase 5-C-1 inbox backend:

```text
convex/email/mutations.ts
```

Phase 5-C-2 inbox UI:

```text
src/routes/Inbox.tsx
src/components/inbox/ConversationList.tsx
src/components/inbox/ConversationView.tsx
src/components/inbox/LinkToCaseDialog.tsx
```

Phase 6-A triage backend:

```text
convex/lib/providers/openai.ts
convex/lib/providers/triagePrompt.ts
convex/email/triage.ts
convex/cases/triage.ts
```

Phase 6-C review UI:

```text
src/components/cases/AISummaryCard.tsx
src/components/cases/ReviewTriageSheet.tsx
```

Phase 7-A vendor discovery backend:

```text
convex/lib/providers/firecrawl.ts
convex/lib/providers/vendorSearch.ts
convex/lib/providers/vendorNormalize.ts
convex/vendors.ts
convex/vendors/discover.ts
```

Phase 7-C vendor UI:

```text
src/routes/Vendors.tsx
src/components/vendors/VendorCard.tsx
src/components/vendors/VendorFormDrawer.tsx
src/components/vendors/CategoryMultiSelect.tsx
src/components/vendors/RankBadge.tsx
src/components/cases/VendorDiscoveryDrawer.tsx
```

Phase 8-A outbound drafting backend:

```text
convex/email/draft.ts
convex/email/sendPendingCommunication.ts
convex/lib/providers/draftPrompt.ts
```

Recommended application structure:

```text
src/
convex/
tests/
docs/
```

---

# 10. Verification commands

Established commands:

```text
npm run dev
npm run lint
npm run typecheck
npm run test:once
npm run build
npm run test:e2e
```

The exact script names were established in Phase 1.1.

---

# 11. Known risk areas

Watch especially:

- workspace isolation;
- AgentMail duplicate webhook delivery;
- public confirmation token replay;
- AI prompt injection;
- vendor email send uncertainty;
- state transition races;
- cross-workspace property/unit IDs;
- accidentally exposing private email content;
- accidentally exposing provider API keys;
- rendering untrusted email HTML.
- fnm requires per-shell bootstrap via $PROFILE (configured 2026-09-20; fresh shells now auto-switch via .nvmrc).
- Tailwind is v4 (CSS-first). Do not reintroduce postcss.config.js or tailwind.config.js.
- shadcn/ui CLI is pinned to 4.20.0 in components.json; 4.21.0 had a workspace-config load bug at init time.
- AGENTS.md now contains a "Precedence — Realtrail docs vs Convex-provided guidance" section. Convex is authoritative on Convex-platform questions; our docs are authoritative on Realtrail product/scope/security/integration questions.
- The Convex MCP server has state-modifying tools (data, run, runOneoffQuery, envSet, envRemove). It must not be used outside the assigned task or against production without explicit human approval.
- hackathon.md is public-facing. Never write secrets, tokens, real emails, addresses, or internal case data to it.
- The hackathon skill must be re-run periodically (`/hackathon`) to keep the build log current, only after a task's verification commands pass.
- MCP server is configured but inactive until OpenCode is restarted.
- ARCHITECTURE.md §31 index names may need reconciliation with current Convex guidance (e.g. `by_workspaceId_and_userId` vs `by_workspace_user`). Per the precedence rule, Convex's convention wins on index naming.
- Active Convex deployment: eu-west-dev (dev type). Do not push to prod without explicit approval.
- Convex MCP state-modifying tools (data, run, runOneoffQuery, envSet, envRemove) require per-task human approval per the AGENTS.md precedence section.
- Convex MCP server spawns multiple instances across OpenCode sessions. This is an observation, not a fault; instances consolidate on full editor restart.
- CLERK_FRONTEND_API_URL is not yet set on the Convex deployment. auth.config.ts references it; schema pushes may fail until it is set. Phase 1.3-B sets it.
- VITE_CLERK_PUBLISHABLE_KEY in .env.local is now the real Clerk key (set in Phase 1.3-B); the file remains gitignored and must never be committed.
- Identity key choice: we use `clerkUserId` (from identity.subject) as the primary identity key, NOT `tokenIdentifier`. Rationale: Realtrail is Clerk-only; no multi-provider scenario exists; schema was deployed with `by_clerkUserId`. If a second auth provider is ever added, revisit.
- The user mirroring pattern: getCurrentUser in convex/lib/auth.ts only mirrors users in mutation context. The frontend MUST call users.syncUser once on app boot before any query that depends on the user row existing. Phase 1.4-B implements this call in the app boot sequence.
- Multi-workspace users are not supported in MVP. workspace.create rejects a second workspace. workspace.getCurrent returns the most recent membership if multiple exist (defensive).
- workspace.create now requires propertyName and propertyAddress. Any caller with the old signature will fail validation.
- Building.propertyId is the source of truth for unit.propertyId. Do not accept unit.propertyId from client input.
- Onboarding form fields grew from 3 to 5. The property must be created atomically with the workspace (backend does this in a single mutation).
- Properties screen has no delete flow in MVP — deliberate. Do not add one without explicit approval.
- Existence-hiding convention established in Phase 2-A: cross-workspace access throws NOT_FOUND, not FORBIDDEN. Apply this pattern to case-related queries and mutations in Phase 3.
- Case status transitions MUST go through cases.transitionStatus or cases.close. Do not patch `status` directly from any other mutation. The state machine helper is the authority; bypassing it is a bug.
- Cases cannot be CLOSED via cases.transitionStatus. Closing has its own mutation with reason validation.
- RESOLVED cannot be set via cases.transitionStatus — it comes from the resident confirmation flow (Phase 9) or authorized manager action via a dedicated mutation added in that phase.
- Staff cannot close cases or downgrade URGENT priority. This is enforced at the mutation layer.
- caseNumber allocation uses caseCounters with a transaction-safe increment. Never use timestamps or Math.random for case numbers.
- Filter state is local (not URL-persisted) in Phase 3-B-1. Deep-linking a filtered view is a future enhancement.
- Assignee filter only supports "me" and "unassigned" in MVP until member-list UI exists (later phase).
- Case Detail is read-only in 3-B-1. Action panel and dialogs land in 3-B-2. Do not add actions to CaseDetail.tsx yet — the placeholder comment marks where they go.
- The metrics strip computes from the loaded page, not from a workspace-wide aggregate. Counts may be inaccurate for large workspaces with pagination. Note this as a known limitation; address in a later phase if needed.
- The action panel derives its primary action from status. Two states (NEW, WORK_IN_PROGRESS) currently fall back to "Change status" until Phase 6 (AI triage review) and Phase 9 (request confirmation) provide their dedicated actions. Replace the fallback when those phases land.
- Close and Reopen are irreversible. Both dialogs require explicit confirmation. Do not remove the confirmation step.
- Toast feedback is the only cross-cutting notification mechanism. All future mutations should fire a toast on success; field-level validation errors render inline only.
- dashboard.get hardcodes 4h (vendor follow-up) and 24h (confirmation reminder) thresholds. Phase 10 replaces these with REALTRAIL_* env vars.
- operations buckets tabulate from a single cases query. If a workspace exceeds ~500 cases, this may become slow. Add per-status .count() queries if needed.
- attention list currently cannot include "communication failed" cases because the communications table does not exist yet (Phase 5). Add this trigger in Phase 5 when the field exists.
- Attention card count under-reports if attention list exceeds 10 (backend cap). Dashboard.get may need an attentionCount field in a future phase.
- Operations flow shows six stages (NEW → TRIAGED → IN_PROGRESS → VENDOR_CONTACTED → AWAITING_CONFIRMATION → RESOLVED). SCHEDULED, WORK_IN_PROGRESS, and CLOSED are surfaced as secondary counts. The flow is visual-only; making it filter the Cases screen is a Phase 12 enhancement.
- Full-suite test flakes under load remain a known infrastructure issue. maxWorkers: 2 mitigation is in place.
- Design tokens are NOT yet applied. The shell uses shadcn neutral/slate defaults. Phase 12 applies brand colors (lavender primary, lime positive, warm yellow warning, off-white background).
- Onboarding collects only workspace details. Phase 2 extends it to collect property name/address and initial building/unit.
- The boot-time users.syncUser call runs in the AppShell wrapper. Any route outside AppShell (sign-in, sign-up) does not run it. This is intentional — the user row is only needed for authenticated routes.
- hackathon.md must be updated at the end of every phase, after the phase's verification commands pass, per AGENTS.md §15. If a phase report does not include a HACKATHON.MD UPDATE section with a commit hash, the update was skipped — treat this as a process failure and correct before proceeding.
- AGENTMAIL_WEBHOOK_SECRET is not set. The webhook endpoint rejects every request until Phase 5-B sets it. Do not configure the webhook in AgentMail until then.
- HTTP actions run in a V8 isolate (no Node crypto). Svix verification uses crypto.subtle. Node runtime is only for convex/lib/providers/agentmail.ts ("use node").
- The by_agentMailInboxId index on workspaces is required for inbound routing. Do not remove it.
- Retry policy: 3 attempts at 60s intervals, then failed permanently. Failed events stay in inboundEvents.
- payloadHash is stored but not yet used — reserved for future reconciliation. providerEventId is the current dedupe key.
- Fresh non-interactive shells default to Node 24. Run `fnm use 22` at the start of every task before running npx/npm.
- Live AgentMail credentials are set on the Convex deployment. Rotate via the AgentMail dashboard if leaked. Never commit them.
- Inbox provisioning is currently called manually (either via a temporary CLI mutation or the public action). Phase 5-C or 11 should wire it to workspace.create / onboarding.
- The webhook secret must match between AgentMail's configuration and AGENTMAIL_WEBHOOK_SECRET. If inbound events fail signature verification, check both sides.
- The live AGENTMAIL_API_KEY is inbox-scoped (no inbox:create, no inbox:read). provisionAgentMailInbox/createInbox needs an org-scoped key; the smoke-test workspace uses the pre-created inbox instead. Discover scope via GET /v0/auth/me.
- AgentMail API corrections applied in 5-B (docs-verified): base https://api.agentmail.to, /v0 prefix, snake_case fields, webhook envelope is { event_type, event_id, message: {...} }. Svix verification needed no changes.
- unreadCount in inbox.list is computed in-memory over a bounded page. For workspaces with >1000 communications, this may undercount. Add a counter table only with explicit approval.
- linkToCase only supports inbound communications. Outbound linking is out of scope.
- A test workspace (jd730jjct6kj4dyq27rwccfc0x8ety58) was created during Phase 5-B smoke testing. It contains test data and is not the human's primary workspace. Clean up in Phase 11 or via a manual admin task.
- Workspace check (5-C-2): the dev deployment holds exactly one workspace (the smoke one) and one membership (the smoke-test user). The human has no membership anywhere, so workspace.getCurrent cannot return the smoke workspace for them — onboarding will create their own. No conflict, no action needed.
- Inbound emails render as plain text only. Never render HTML from email bodies. This is a security requirement (§14 XSS in ARCHITECTURE.md).
- Auto-mark-read fires once per thread open after a short delay. If a user rapidly switches threads, the timer may fire for the wrong thread — the ref guard prevents duplicates on the same thread. This is acceptable MVP behavior.
- The sidebar unread badge uses the workspace-wide unreadCount. Filter-specific counts are not pre-fetched; only the currently-selected filter has a badge in the tab bar.
- OPENAI_API_KEY, OPENAI_TRIAGE_MODEL, OPENAI_DRAFT_MODEL are NOT set on the Convex deployment. Live triage will fail until Phase 6-B sets them.
- AI output is advisory. Cases created from triage start in status NEW and require human review via acceptAiTriage before they become TRIAGED.
- AI never sets priority to URGENT downgrading a human-set URGENT — enforced at the mutation layer.
- Referential checks drop invalid AI-selected property/building/unit/case IDs. The raw AI output is preserved in aiTriageOutput for audit.
- Email content is treated as untrusted data, wrapped in delimiters. Do not remove the injection-defense directives from triagePrompt.ts.
- Provider is selected by OPENAI_BASE_URL. Phase 6-B sets this to https://openrouter.ai/api/v1 with model IDs prefixed "openai/". OpenAI direct is also supported with unprefixed model IDs.
- OpenRouter structured output compliance depends on routing. require_parameters: true is set to force strict endpoint selection. If malformed responses ever appear, the triage action falls back to its failure path (no case created, retry with backoff).
- Test flakes are resolved by maxWorkers: 1. Do not raise it without evidence that fork-spawn flakes are gone.
- OpenRouter routing is pinned to azure/swedencentral with allow_fallbacks: false. If that provider is unavailable, triage fails and retries (existing retry path). Do not add fallback providers without explicit human approval — deterministic provider identity is intentional.
- Provider slug "azure/swedencentral" was verified against OpenRouter's UI by the human. If OpenRouter renames the slug, requests will fail; re-verify at https://openrouter.ai/openai/gpt-4o-mini.
- Live OpenRouter credentials set on the Convex deployment (by the human, not the agent). If triage stops working, first check OpenRouter credits (402) and provider availability (azure/swedencentral).
- Provider routing has allow_fallbacks: false. If Azure Sweden Central is unavailable, triage fails and retries up to 3 times.
- AI output is rendered as plain text only. Never use dangerouslySetInnerHTML for AI-generated content. This is a security requirement (§16 in ARCHITECTURE.md).
- The "AI suggested" hints are advisory. Accepting triage replaces AI values with the human-edited form values — the original aiTriageOutput is preserved on the case for audit.
- Known infrastructure flake: test:once intermittently fails on frontend userEvent tests at maxWorkers: 1 (documented from Phase 6-B). Investigation queued as a follow-up task. Not a code regression.
- FIRECRAWL_API_KEY is not set. Live discovery will fail until Phase 7-B configures it.
- Vendor search queries must never include internal case data (title, description, notes, resident contact). The buildVendorSearchQuery helper enforces this — do not bypass it.
- Rank bands are deterministic; do not introduce numeric or model-based vendor scoring.
- Scraped content is untrusted. Evidence strings are truncated and rendered as plain text in the UI.
- The discovery rate limit is a 60s per-case cooldown, implemented as a check on existing pending research. No new infrastructure.
- Vendor list is capped at 200 rows without pagination. If a workspace exceeds this, pagination needs to be added.
- The discovery drawer saves the vendor AND links it to the case in two separate mutations. If the second fails, the vendor exists but isn't linked. Consider a follow-up consolidation if this becomes a UX issue.
- Vendor data comes from Firecrawl scraping — always rendered as plain text, never as HTML. Rank bands are advisory.
- Case Detail vendor card's "Contact vendor" button is a Phase 8 placeholder. Do not implement outbound sending here.
- Live Firecrawl credentials set on the Convex deployment. If discovery stops working, check Firecrawl credits and API status first.
- Discovery is capped at 3 scraped results per run (rate limit + scraper time). If more results are needed, this is a future enhancement.
- AI drafts, human approves, worker sends: generateDraft and createDraftRecord can only ever produce status="draft" rows. Only approveSend (authenticated member) moves a draft to pending_send, and only the send worker calls the provider. There is no code path from model output to a sent email.
- Outbound send idempotency is layered: approveSend's draft-only CONFLICT guard (one schedule per approval), the worker's transactional pending_send → sending claim (duplicate workers return "skipped"), the stable Idempotency-Key header (communication id, so provider retries replay instead of duplicating), and no auto-retry on unknown outcomes.
- send_uncertain is terminal for automation: timeouts, unreadable 200 bodies, and unexpected throws mark the row send_uncertain with a redacted lastError and an EMAIL_SEND_UNCERTAIN activity. A manager must resolve it (Phase 12 UI). Never auto-retry uncertain sends.
- generateDraft is internal-only with no caller identity: vendor references are workspace-checked server-side, but the caseId is trusted from the internal caller. The Phase 8-C public wrapper must enforce membership (NOT_FOUND on mismatch) before calling it.
- Same-file ctx.runQuery/runMutation calls need care with api.d.ts inference: the ACTION HANDLER needs an explicit return type annotation (triageInbound pattern). Annotating only the result binding is not enough — without it, the whole module collapses to any (TS7022) and cascades into src/ implicit-any errors.
- npm run lint is green again (resolved by the lint-cleanup task at a0dc9c4: typed mock params kept with scoped disables, NUL-regex test got a scoped disable, CategoryMultiSelect constant got a scoped disable). Lesson: convex's bundled typecheck (dev --once) is stricter than npm run typecheck — dropping mock params broke it (mock.calls tuple widens to []), so verify lint fixes with dev --once, not just npm scripts.
- Box slowness flake (2026-09-22 session): full test:once with default 5s timeouts flaked on random frontend userEvent files (varying sets per run, all timeouts, zero logic failures); backend chunk passed 356/356 on defaults and frontend passed 136/136 with --testTimeout=30000. If the full run flakes again, split convex/ vs src/ before suspecting a regression. No timeout config was changed.

---

# 12. Hackathon state

The current official Convex All Gas page states:

- submissions: September 22, 2026 at 12:00 PM PT;
- public repo required;
- root `hackathon.md` required;
- public live app URL required;
- three-minute video required;
- `convex.site` or `chatgpt.site` is the stated public hosting target.

Verify the official page immediately before final submission in case requirements change. 

**Scope decision:** The hackathon deadline risk has been explicitly accepted. The project proceeds at full MVP scope per IMPLEMENTATION_PLAN.md. A partial submission at the deadline is acceptable; the full plan is not compressed.

---

# 13. Next exact task

**Phase 8-B — live send verification. Human provides a target email address (their own mailbox). Agent sends a real email via the pipeline, verifies arrival, verifies the communication transitions through pending_send → sending → sent.**
