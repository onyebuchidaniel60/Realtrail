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

**Phase 1 — Project Foundation (in progress). Sub-tasks 1.1 through 1.3 complete. 1.4-A complete (backend API surface). 1.4-B pending (frontend shell + routing).**

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

**Phase 1.4-B — frontend app shell and routing. Scope: /sign-in route with Clerk <SignIn>, /sign-up route with Clerk <SignUp>, /onboarding route calling users.syncUser then workspace.create, protected /overview route, AppShell layout with responsive sidebar skeleton, route guards that redirect unauthenticated users to /sign-in, and a boot-time users.syncUser call.**
