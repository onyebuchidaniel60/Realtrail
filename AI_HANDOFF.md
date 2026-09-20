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

**Phase 1 — Project Foundation (in progress). Sub-tasks 1.1 and 1.1b complete; 1.1c completing; 1.2 (Convex init) pending.**

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

**Phase 1.2 — Convex initialization. Region EU West (Ireland) must be selected before `npx convex dev` runs (ARCHITECTURE.md §20; region is irreversible). Scope: convex/schema.ts with users, workspaces, workspaceMembers tables and their required indexes only; convex/auth.config.ts. No Clerk wiring yet (that is Phase 1.3).**
