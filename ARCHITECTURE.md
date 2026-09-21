# REALTRAIL — ARCHITECTURE.md

## 0. Architecture status

**Status:** Fixed implementation architecture for MVP

The coding agent may make implementation-level choices inside this architecture, but it must not replace these architectural decisions without explicit approval.

---

# 1. System Context

```text
                    ┌───────────────────────┐
                    │       Resident        │
                    │       Vendor          │
                    └───────────┬───────────┘
                                │ Email
                                ▼
                     ┌─────────────────────┐
                     │      AgentMail      │
                     │ inbox + threads     │
                     └──────────┬──────────┘
                                │ webhook / API
                                ▼
┌─────────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│ Manager / Staff │────▶│       Convex        │────▶│     OpenAI       │
│ React frontend  │     │ DB + functions      │     │ triage + drafts  │
└───────┬─────────┘     │ realtime + scheduler│     └──────────────────┘
        │               └──────────┬──────────┘
        │                          │
        │                          ▼
        │                 ┌──────────────────┐
        │                 │    Firecrawl     │
        │                 │ vendor discovery │
        │                 └──────────────────┘
        │
        ▼
  Clerk authentication
```

Convex is intentionally the central backend: database, authenticated functions, mutations, actions, scheduling, and realtime synchronization.

Convex's current documentation describes it as a reactive document-relational backend with queries, mutations and actions, and its mutations are transactional. citeturn395735search7turn395735search6

---

# 2. Technology Stack

## Frontend

**React + TypeScript + Vite**

Responsibilities:
- route-level UI;
- responsive layout;
- forms;
- rendering Convex reactive queries;
- local interaction state;
- client validation;
- accessible UI.

Why:
- static deployment;
- fast development;
- minimal runtime infrastructure;
- excellent compatibility with Convex's React client;
- no need for SSR in Realtrail MVP.

Alternative rejected:
- Next.js. Next.js is a strong option and has an official Convex integration, but Realtrail MVP has no SSR requirement. A static React/Vite frontend keeps deployment and routing simpler for the hackathon's public static-hosting model. Convex documents both Next.js integration and static hosting patterns. citeturn254504search4turn254504search0

## UI styling

**Tailwind CSS + shadcn/ui + Radix primitives + Lucide icons**

Responsibilities:
- design tokens;
- accessible primitives;
- consistent controls;
- tables;
- dialogs;
- dropdowns;
- badges;
- sheets/drawers.

Why:
- accessible primitives;
- fast implementation;
- visual customization can follow the Realtrail design system rather than default component appearance.

## Backend

**Convex**

Responsibilities:
- data;
- queries;
- mutations;
- actions;
- realtime;
- scheduled jobs;
- webhook handling;
- authorization;
- AI/external API orchestration;
- case lifecycle.

Convex actions are appropriate for third-party API calls, while mutations are used to enforce transactional invariants and can schedule internal actions. citeturn395735search4turn395735search6

## Authentication

**Clerk**

Responsibilities:
- sign in/sign up;
- session management;
- user identity.

Convex verifies the authenticated identity through its auth context. Clerk documents a first-class Convex integration, including use of `ctx.auth.getUserIdentity()` from Convex functions. citeturn438228search0

Convex Auth is deliberately not selected for this MVP because its current documentation marks the Next.js-related support as experimental/beta, while Clerk has a documented integration. citeturn438228search9turn438228search0

## AI

**OpenAI Responses API**

Model policy:
- triage: `gpt-5-mini` where available;
- manager-facing drafts/summaries: `gpt-5` where available;
- model identifiers stored in server environment variables.

Responsibilities:
- structured request understanding;
- summary;
- category;
- priority suggestion;
- missing-information detection;
- communication drafts.

The official OpenAI quickstart currently demonstrates the Responses API and server-side SDK usage. Structured output should use JSON Schema / Structured Outputs rather than free-form parsing. citeturn798728search0turn798728search5

## Web research

**Firecrawl**

Responsibilities:
- vendor search;
- public site scraping;
- structured source evidence.

Firecrawl's current docs expose search and scrape through its SDK/API. citeturn798728search7

## Email

**AgentMail**

Responsibilities:
- workspace operational inbox;
- inbound email;
- outbound email;
- thread/message correlation;
- webhooks.

AgentMail currently supports multiple inboxes per organization, inbox/thread/message hierarchy, inbox creation, sending messages, and webhooks. citeturn212608search5turn212608search1turn212608search0turn798728search1

## Deployment

**Convex static hosting / `convex.site`**

The hackathon currently requires a public app on `convex.site` or `chatgpt.site`, alongside a public GitHub repository, root `hackathon.md`, and a three-minute demo. The current official Convex page lists the All Gas submission deadline as **September 22, 2026 at 12:00 PM PT**. citeturn383237search0

## Testing

- Vitest
- `convex-test`
- Testing Library
- Playwright

Convex's current testing documentation specifically supports `convex-test` with Vitest, including testing authenticated functions, HTTP actions, and scheduled functions. citeturn930017search0

## Node runtime

Convex's current project configuration supports Node 20, 22, and 24 for Node actions. Use **Node 22** for the MVP and pin it consistently with `.nvmrc` / `package.json` tooling. citeturn254504search6

**IMPLEMENTATION DETAIL — AGENT MAY DECIDE:** exact compatible patch/minor versions of dependencies at Phase 1, provided they remain within the architecture above and the lockfile is committed.

---

# 3. Runtime Architecture

## 3.1 Browser

The browser uses:
- Clerk client;
- Convex React client;
- React state;
- static assets;
- no server secret.

The browser must never directly call:
- OpenAI with secret key;
- Firecrawl with secret key;
- AgentMail with secret key.

## 3.2 Convex function classes

### Public queries
Read data for authenticated users.

### Public mutations
Capture explicit user intent and enforce invariants.

### Public actions
Avoid calling external actions directly from the frontend when a mutation can record intent first.

### Internal queries/mutations/actions
Server-only orchestration and provider work.

Convex's own documentation recommends capturing user intent in a mutation and then scheduling an internal action for third-party API calls. citeturn395735search4

---

# 4. Case-Oriented Domain Architecture

The central aggregate is `Case`.

```text
Workspace
 ├── Members
 ├── Properties
 │    ├── Buildings
 │    │    └── Units
 │
 ├── Cases
 │    ├── Activities
 │    ├── Communications
 │    ├── Vendor Research
 │    ├── Confirmation Tokens
 │    └── Tasks/Attention
 │
 ├── Vendors
 ├── Inbound Events
 └── AgentMail Inbox
```

No entity should be able to bypass workspace ownership.

---

# 5. Convex Schema

Tables:

1. `users`
2. `workspaces`
3. `workspaceMembers`
4. `properties`
5. `buildings`
6. `units`
7. `cases`
8. `caseActivities`
9. `communications`
10. `vendors`
11. `vendorResearch`
12. `vendorResearchResults`
13. `inboundEvents`
14. `notifications`
15. `confirmationTokens`
16. `caseCounters`

### Common ID strategy

Use native Convex document IDs as primary keys.

Use external provider IDs in dedicated fields and unique indexes.

---

# 6. Detailed Data Model

## users

```text
_id
clerkUserId: string
email: string?
name: string?
createdAt: number
updatedAt: number
```

Indexes:
- `by_clerkUserId`

Uniqueness:
- `clerkUserId` unique.

## workspaces

```text
_id
name: string
timezone: string
currency: string
status: "active" | "suspended"
agentMailInboxId: string?
agentMailInboxAddress: string?
createdBy: Id<users>
createdAt: number
updatedAt: number
```

Indexes:
- `by_agentMailInboxId`

`agentMailInboxId` / `agentMailInboxAddress` are placeholders until Phase
5-B provisions the live AgentMail inbox. Inbound routing looks workspaces
up by `agentMailInboxId`; do not remove that index.

## workspaceMembers

```text
_id
workspaceId: Id<workspaces>
userId: Id<users>
role: "owner" | "manager" | "staff"
createdAt: number
updatedAt: number
```

Indexes:
- `by_workspaceId`
- `by_userId`
- `by_workspaceId_and_userId`

Unique invariant:
- one user/role membership per workspace.

## properties

```text
_id
workspaceId: Id<workspaces>
name: string
address: string
city: string?
country: string?
timezone: string
active: boolean
createdAt: number
updatedAt: number
```

Indexes:
- `by_workspaceId`
- `by_workspaceId_and_active`

## buildings

```text
_id
workspaceId: Id<workspaces>
propertyId: Id<properties>
name: string
code: string?
createdAt: number
updatedAt: number
```

Indexes:
- `by_propertyId`
- `by_workspaceId`

## units

```text
_id
workspaceId: Id<workspaces>
propertyId: Id<properties>
buildingId: Id<buildings>
label: string
occupancyStatus: "occupied" | "vacant" | "unknown"
createdAt: number
updatedAt: number
```

Indexes:
- `by_buildingId`
- `by_propertyId`
- `by_workspaceId`

Invariant:
- `building.propertyId == unit.propertyId`
- all belong to same workspace.

## cases

```text
_id
workspaceId: Id<workspaces>
caseNumber: number
title: string
description: string
status: CaseStatus
priority: Priority
category: Category
propertyId: Id<properties>?
buildingId: Id<buildings>?
unitId: Id<units>?
reporterName: string?
reporterEmail: string?
assigneeId: Id<users>?
aiTriageStatus: "not_started" | "pending" | "completed" | "failed"
aiTriageVersion: string?
aiTriageOutput: object?
triageReviewedAt: number?
triageReviewedBy: Id<users>?
nextActionType: string?
nextActionLabel: string?
lastInboundAt: number?
lastOutboundAt: number?
lastActivityAt: number
reopenCount: number
locationUnknown: boolean
closedReason: "resolved" | "duplicate" | "invalid" | "cancelled"?
resolutionSummary: string?
resolutionVendorId: Id<vendors>?
resolutionCostMinor: number?
resolutionCompletedAt: number?
resolvedAt: number?
resolvedBy: "resident" | "manager" | "owner"?
closedAt: number?
closedBy: Id<users>?
createdBy: Id<users>
createdAt: number
updatedAt: number
```

Indexes:
- `by_workspaceId`
- `by_workspaceId_and_status`
- `by_workspaceId_and_priority`
- `by_workspaceId_and_propertyId`
- `by_workspaceId_and_assigneeId`
- `by_workspaceId_and_lastActivityAt`
- `by_agentmail_thread` if stored as case-level thread mapping
- text search indexes on title/description as supported by Convex.

Case number:
- monotonically increasing within workspace;
- allocate inside transaction with a workspace counter record or deterministic counter table.
- do not use timestamps as case numbers.

## caseActivities

```text
_id
workspaceId: Id<workspaces>
caseId: Id<cases>
type: ActivityType
actorType: "user" | "system" | "ai" | "resident" | "vendor"
actorUserId: Id<users>?
summary: string
metadata: object?
createdAt: number
```

Indexes:
- `by_caseId`
- `by_workspaceId_and_createdAt`

Activity records are append-only in MVP.

## caseCounters

```text
_id
workspaceId: Id<workspaces>
nextNumber: number
```

Indexes:
- `by_workspaceId`

Per-workspace monotonic counter for case numbers. Allocated inside the
creating mutation's transaction; never timestamps or random values.

## communications

```text
_id
workspaceId: Id<workspaces>
caseId: Id<cases>?
direction: "inbound" | "outbound"
participantType: "resident" | "vendor" | "other"
agentMailInboxId: string
agentMailThreadId: string
agentMailMessageId: string?
status: "received" | "draft" | "pending_send" | "sending" | "sent" | "failed" | "send_uncertain"
fromEmail: string
toEmails: string[]
subject: string
textBody: string
aiDraftSource: boolean
approvedBy: Id<users>?
approvedAt: number?
providerDraftId: string?
providerMessageId: string?
lastError: string?
createdAt: number
updatedAt: number
```

Indexes:
- `by_workspaceId`
- `by_caseId`
- `by_agentMailThreadId`
- `by_agentMailMessageId`
- `by_workspaceId_and_createdAt`

MVP stores plain-text message content for rendering. HTML is not trusted or rendered raw.

## vendors

```text
_id
workspaceId: Id<workspaces>
name: string
serviceCategories: Category[]
email: string?
phone: string?
website: string?
location: string?
source: "manual" | "firecrawl"
sourceUrl: string?
notes: string?
createdAt: number
updatedAt: number
```

## vendorResearch

```text
_id
workspaceId: Id<workspaces>
caseId: Id<cases>
query: string
locationContext: string?
status: "pending" | "completed" | "failed"
createdAt: number
completedAt: number?
errorMessage: string?
```

## vendorResearchResults

```text
_id
workspaceId: Id<workspaces>
researchId: Id<vendorResearch>
providerName: string
website: string?
email: string?
phone: string?
services: string[]
location: string?
sourceUrl: string
evidence: string?
rankBand: "high_relevance" | "relevant" | "other"
fetchedAt: number
```

No numeric vendor score in MVP.

## inboundEvents

```text
_id
provider: "agentmail"
providerEventId: string
providerMessageId: string?
providerInboxId: string
eventType: string
payloadHash: string
processingStatus: "received" | "processing" | "processed" | "failed"
attempts: number
lastError: string?
createdAt: number
processedAt: number?
```

Indexes:
- unique-like `by_providerEventId`
- `by_providerMessageId`
- `by_processingStatus`

## notifications

```text
_id
workspaceId: Id<workspaces>
userId: Id<users>
caseId: Id<cases>?
type: "vendor_followup" | "resident_confirmation" | "urgent_case" | "system_error"
title: string
body: string
readAt: number?
createdAt: number
```

## confirmationTokens

```text
_id
workspaceId: Id<workspaces>
caseId: Id<cases>
tokenHash: string
decision: "yes" | "no"
expiresAt: number
usedAt: number?
createdAt: number
```

Indexes:
- `by_tokenHash`
- `by_case`
- `by_expiresAt`

Store only the hash, never the raw token.

---

# 7. API Architecture

Realtrail does not expose a conventional CRUD REST API to the browser.

The primary browser API is Convex's typed:
- queries;
- mutations;
- actions.

One HTTP API exists for external integrations/public confirmation.

---

# 8. Browser Query Surface

## `workspace.getCurrent`

Input:
```text
{}
```

Returns:
- current workspace;
- current authenticated member;
- onboarding status.

## `dashboard.get`

Input:
```text
{
  range: "today" | "week" | "month"
}
```

Returns:
- open case count;
- urgent count;
- waiting on vendor;
- awaiting confirmation;
- resolved this week;
- attention list;
- operations buckets;
- recent activity.

## `cases.list`

Input:
```text
{
  search?: string
  status?: CaseStatus
  priority?: Priority
  propertyId?: Id<properties>
  category?: Category
  vendorId?: Id<vendors>
  assigneeId?: Id<users>
  cursor?: string
  pageSize: number
}
```

## `cases.get`

Input:
```text
{ caseId }
```

Returns:
- case;
- activity timeline;
- communications;
- vendor links;
- AI triage;
- allowed actions.

## `properties.list`

Returns workspace properties.

## `buildings.list`

Returns buildings for a selected property.

## `units.list`

Returns units for a selected building/property.

## `vendors.list`

Input:
```text
{
  search?: string
  category?: Category
}
```

## `inbox.list`

Input:
```text
{
  filter: "all" | "residents" | "vendors"
  cursor?: string
}
```

## `notifications.list`

Returns unread/recent notifications for current user.

---

# 9. Browser Mutation Surface

## Workspace

- `workspace.create`
- `workspace.completeOnboarding`

## Properties

- `properties.create`
- `properties.update`
- `buildings.create`
- `buildings.update`
- `units.create`
- `units.update`

## Cases

- `cases.createManual`
- `cases.acceptAiTriage`
- `cases.updateFields`
- `cases.assign`
- `cases.addNote`
- `cases.transitionStatus`
- `cases.requestConfirmation`
- `cases.close`
- `cases.reopen`

## Vendors

- `vendors.save`
- `vendors.update`

## Communications

- `communications.createDraftRecord`
- `communications.approveSend`
- `communications.markRead`

## Notifications

- `notifications.markRead`
- `notifications.markAllRead`

---

# 10. Action Surface

Actions call third parties and then commit their result through mutations.

- `ai.triageInbound`
- `ai.generateDraft`
- `vendors.discover`
- `email.sendPendingCommunication`
- `email.fetchCanonicalThread`
- `email.syncReply`

Public actions should be minimized. Prefer internal actions invoked by scheduled functions.

---

# 11. HTTP Surface

## `POST /webhooks/agentmail`

Purpose:
- receive AgentMail events.

Processing:
1. read raw body;
2. verify Svix/AgentMail signature;
3. validate event envelope;
4. call internal mutation to insert dedupe record;
5. schedule internal processing;
6. return success.

AgentMail's webhook docs show `svix-id`, `svix-signature`, and `svix-timestamp` headers, and webhook configuration returns a secret for signature verification. citeturn798728search1turn798728search6

## `GET /confirm`

Purpose:
- display generic resident confirmation page.

No state-changing behavior.

## `POST /confirm`

Purpose:
- validate one-time token;
- record resident confirmation.

The action must:
- hash token;
- locate token record;
- check expiry;
- check unused status;
- execute one internal mutation;
- mark token used.

No case details in public response.

---

# 12. Concurrency Model

Convex mutations are transactional. All lifecycle transitions must live inside mutations so validation and state changes commit together. citeturn395735search6

Example:

```text
transitionStatus(caseId, nextStatus)
  ↓
authenticate
  ↓
load member
  ↓
load case
  ↓
validate same workspace
  ↓
validate transition
  ↓
update case
  ↓
insert activity
  ↓
schedule reminder changes if needed
  ↓
COMMIT
```

No external API call is allowed inside the mutation.

For expensive work:

```text
mutation
  ↓
persist intent
  ↓
schedule internal action
  ↓
external API
  ↓
internal mutation
  ↓
persist result
```

---

# 13. Scheduled Jobs

Use Convex Scheduler.

Scheduled tasks:
- vendor follow-up;
- resident confirmation reminder;
- escalation;
- stale AI retry;
- stale provider operation reconciliation.

Convex exposes scheduling directly from function context. citeturn395735search3

Every scheduled job must:
1. load the record;
2. verify it still needs action;
3. verify it belongs to correct workspace;
4. perform one action;
5. write an idempotent activity/status update.

---

# 14. AgentMail Architecture

Each workspace has one inbox.

On onboarding/integration setup:
- create AgentMail inbox;
- persist provider inbox ID/address;
- configure webhook.

AgentMail supports creating inboxes with a `client_id`, which may be used for idempotent provisioning attempts. citeturn212608search1

Outbound:
- use provider inbox ID;
- prefer AgentMail draft flow for stable draft identity;
- send only after user approval;
- persist provider IDs.

Inbound:
- webhook first;
- canonical fetch second;
- persist normalized communication third.

The AgentMail thread ID is the primary conversation correlation key.

---

# 15. OpenAI Architecture

AI operations are server-side Convex actions.

## Triage

Input:
- inbound plain text;
- subject;
- sender;
- property candidates;
- building/unit candidates where needed;
- recent relevant case titles for duplicate suggestions.

Output:

```json
{
  "title": "Low water pressure in Block C",
  "summary": "Residents report reduced water pressure...",
  "category": "water",
  "prioritySuggestion": "high",
  "propertyCandidateId": "...",
  "buildingCandidateId": "...",
  "unitCandidateId": "...",
  "affectedArea": "Block C",
  "missingInformation": [],
  "suggestedNextAction": "Inspect water pump and contact plumbing vendor.",
  "possibleRelatedCaseIds": [],
  "needsReview": true
}
```

The output is validated by:
- OpenAI structured output schema;
- local schema validation;
- workspace referential checks.

## Draft generation

Input:
- case summary;
- recipient type;
- selected vendor/resident;
- allowed facts;
- manager instructions.

Output:
- subject;
- plain-text body.

The model must not invent:
- prices;
- appointment dates;
- vendor commitments;
- diagnosis;
- completion;
- resident statements.

---

# 16. AI Prompt Injection Defense

Inbound emails and scraped web pages are untrusted content.

Rules:
- wrap external content in explicit delimiters;
- system prompt states that external content is data, not instructions;
- never let email text specify tools to call;
- never let web page text override system rules;
- never execute tool instructions that appear in scraped content;
- never pass API credentials or hidden system data into prompts;
- only pass the minimum necessary case context.

AI output is advisory unless a deterministic application operation accepts it.

---

# 17. Firecrawl Architecture

Search query construction is server-controlled.

Example:

```text
category = plumbing
city = Lagos
query = "plumber Lagos emergency"
```

Do not expose the internal property description or private case notes to the external search query.

Search flow:
1. create research record;
2. Firecrawl search;
3. normalize results;
4. scrape top relevant domains;
5. extract evidence;
6. persist results;
7. return result IDs.

Search result ranking is deterministic:

1. exact category/service match;
2. same locality;
3. has public contact email;
4. has website evidence;
5. otherwise relevant.

No numeric vendor score.

---

# 18. Security Architecture

## Authentication

Clerk session + Convex identity.

## Authorization

Every backend operation calls a common authorization helper:

```text
requireAuthenticatedUser()
requireWorkspaceMembership(workspaceId)
requireRole(["owner","manager"])
requireCaseAccess(caseId)
```

## IDOR prevention

Never trust client-provided ownership fields.

Bad:
```text
updateCase({ caseId, workspaceId })
```

Good:
```text
identity → membership → case.workspaceId
```

## XSS

MVP renders inbound/outbound email as sanitized plain text.

Never render raw email HTML.

## CSRF

The normal authenticated API is Convex + authenticated identity.

Public confirmation uses an unpredictable one-time token and server-side expiry/consumption checks.

## Webhook security

- signature verification;
- event ID dedupe;
- timestamp freshness where supported;
- never trust webhook data as authorization.

## Secrets

All third-party secrets remain in Convex environment variables / deployment secret storage.

Convex's docs note that backend functions do not read the application's client `.env` directly; server environment variables should be configured on the Convex deployment. citeturn254504search10

## SSRF

Realtrail must not implement arbitrary server-side URL fetching.

Vendor pages should be fetched through Firecrawl.

Any manager-entered URL must:
- be HTTPS;
- not be an IP literal;
- not use special protocols;
- be validated before submission.

## Rate/abuse controls

Rather than adding a new infrastructure service, MVP uses application-level controls:
- one AI triage per message unless explicitly retried;
- one draft-generation request per communication within cooldown;
- one vendor discovery job per case within cooldown;
- one confirmation attempt per token;
- authenticated expensive actions only.

## Sensitive logs

Never log:
- API keys;
- webhook secrets;
- raw confirmation tokens;
- full private email bodies in application logs;
- full AI prompts.

---

# 19. Deployment Architecture

```text
GitHub
  ↓
Convex deployment
  ├── Convex backend
  ├── Convex functions
  ├── Convex scheduled work
  └── static frontend hosting
          ↓
       convex.site
```

Environment separation:
- local/dev;
- production.

Convex currently supports per-team development deployments and a shared production deployment, with CI deployment via deploy key. citeturn254504search5

For the hackathon, production is the public judging deployment.

---

# 20. Hosting Region

Convex currently documents US East (N. Virginia) and EU West (Ireland) as available deployment regions. Choose **EU West (Ireland)** for the MVP unless the account/project setup requires the US region. The choice should be recorded in deployment docs because Convex states the region cannot simply be changed in place after deployment. citeturn254504search7

Rationale:
- closer to the primary Nigerian/African operating context than the US;
- keeps a documented regional decision;
- still depends on third-party providers' own data-processing regions.

---

# 21. Repository-Level Boundaries

Backend logic:
```text
convex/
```

Frontend:
```text
src/
```

Reusable UI:
```text
src/components/
```

Tests:
```text
tests/
convex/**/*.test.ts
```

No duplicate business logic in the browser.

The browser asks Convex to perform domain operations; Convex owns the rules.

---

# 22. Current Official Technology Notes

- Convex + Next.js is officially supported, but MVP selects Vite because static hosting is sufficient and avoids SSR complexity. citeturn254504search4turn254504search0
- Clerk has a documented Convex integration and passes verified identity into Convex functions. citeturn438228search0
- Convex mutations are transactional; third-party APIs belong in actions. citeturn395735search6turn395735search4
- Convex scheduler supports future execution. citeturn395735search3
- Convex provides realtime reactive queries. citeturn395735search8
- AgentMail supports inboxes, threads, messages and signed webhooks. citeturn212608search5turn798728search1
- OpenAI supports the Responses API and structured outputs. citeturn798728search0turn798728search5
- Firecrawl supports search and scraping. citeturn798728search7


---

# 23. Detailed Convex Function Contracts

## Error contract

All public function errors should map to:

```text
{
  code: string,
  message: string,
  field?: string,
  retryable?: boolean
}
```

Do not expose raw provider stack traces.

---

## Workspace APIs

### `workspace.getCurrent`

```text
TYPE: query
AUTH: required
AUTHZ: authenticated workspace member
REQUEST: {}
```

Success:
- `{ workspace, member, needsOnboarding }`

Errors:
- `UNAUTHENTICATED`

Side effects:
- none.

### `workspace.create`

```text
TYPE: mutation
AUTH: required
AUTHZ: authenticated user with no existing MVP workspace
REQUEST:
{
  workspaceName,
  propertyName,
  propertyAddress,
  timezone,
  currency
}
```

Validation:
- names bounded;
- address bounded;
- valid IANA timezone;
- supported currency;
- user cannot create duplicate workspace.

Business logic:
- create user if not mirrored;
- create workspace;
- create owner membership;
- create property;
- create initial activity.

Success:
- `{ workspaceId, propertyId }`

Errors:
- `VALIDATION_ERROR`
- `CONFLICT`
- `UNAUTHENTICATED`

Side effects:
- schedule AgentMail inbox provisioning if integration is enabled at onboarding.

---

# 24. Case Function Contracts

## `cases.createManual`

```text
TYPE: mutation
AUTH: required
AUTHZ: owner | manager | staff
REQUEST:
{
  title,
  description,
  propertyId?,
  buildingId?,
  unitId?,
  category,
  priority,
  reporterName?,
  reporterEmail?,
  assigneeId?,
  runAiTriage: boolean
}
```

Validation:
- all text bounds;
- reporter email validation;
- category/priority enum;
- property/building/unit consistency;
- assignee membership.

Business logic:
- allocate next case number;
- insert case;
- insert `CASE_CREATED`;
- if `runAiTriage`, set pending and schedule AI action.

Success:
- `{ caseId, caseNumber }`

Errors:
- `FORBIDDEN`
- `VALIDATION_ERROR`
- `CONFLICT`

---

## `cases.acceptAiTriage`

```text
TYPE: mutation
AUTH: required
AUTHZ: owner | manager | staff
REQUEST:
{
  caseId,
  title,
  summary,
  category,
  priority,
  propertyId?,
  buildingId?,
  unitId?,
  nextActionType?,
  nextActionLabel?,
  locationUnknown
}
```

Validation:
- case exists in same workspace;
- proposed references belong to workspace;
- building and unit belong to selected property;
- title/summary bounded.

Business logic:
- persist human-approved triage values;
- record reviewer;
- set `triageReviewedAt`;
- set case status to `TRIAGED`;
- insert `TRIAGE_REVIEWED`.

Success:
- `{ caseId, status: "TRIAGED" }`

---

## `cases.updateFields`

Auth:
- owner/manager/staff.

Allowed fields:
- title;
- description;
- category;
- priority;
- property;
- building;
- unit;
- reporter;
- assignee;
- nextAction.

Not allowed:
- direct status;
- closure;
- resolution.

Those require dedicated mutations.

---

## `cases.transitionStatus`

```text
TYPE: mutation
AUTH: required
AUTHZ: operational member
REQUEST:
{
  caseId,
  nextStatus,
  note?
}
```

Validation:
- allowed transition matrix;
- role;
- current state still equals expected state if an optimistic version is supplied.

Success:
- `{ caseId, status }`

Side effects:
- activity event;
- reminder scheduling/cancellation.

---

## `cases.close`

```text
TYPE: mutation
AUTH: required
AUTHZ: owner | manager
REQUEST:
{
  caseId,
  reason: "resolved" | "duplicate" | "invalid" | "cancelled",
  note?: string
}
```

Rules:
- `resolved` only from `RESOLVED`;
- other reasons require note;
- closed case must not be closed again.

Success:
- `{ caseId, status: "CLOSED" }`

---

## `cases.reopen`

```text
TYPE: mutation
AUTH: required
AUTHZ: owner | manager | operational staff
REQUEST:
{
  caseId,
  reason: string
}
```

Rules:
- closed case only;
- clear active confirmation token behavior;
- increment reopenCount;
- set `IN_PROGRESS`.

---

# 25. Communication Function Contracts

## `communications.createDraftRecord`

Creates a local draft record only.

No provider send.

## `communications.approveSend`

```text
TYPE: mutation
AUTH: required
AUTHZ: owner | manager | staff
REQUEST:
{
  communicationId,
  subject,
  textBody
}
```

Validation:
- recipient from server-side linked participant;
- body length bound;
- case is accessible;
- communication is draft.

Business logic:
- store approved content;
- status `PENDING_SEND`;
- schedule internal send action.

Success:
- `{ communicationId, status: "PENDING_SEND" }`

No external API call inside this mutation.

---

# 26. Vendor Discovery Contract

## `vendors.discover`

```text
TYPE: action
AUTH: required
AUTHZ: owner | manager | staff
REQUEST:
{
  caseId,
  refinement?: string
}
```

The action first verifies the user/case through a query before calling Firecrawl.

Validation:
- case belongs to workspace;
- category exists;
- location context exists or user supplied refinement.

Success:
- research ID and normalized result references.

Failure:
- provider error mapped to `PROVIDER_ERROR`;
- research record persists failed status.

---

# 27. AgentMail Webhook Contract

## `POST /webhooks/agentmail`

Authentication:
- webhook signature, not Clerk.

Required verification:
- signature;
- timestamp/freshness where supported;
- event envelope;
- known inbox.

Flow:
1. read raw request;
2. verify signature;
3. insert or detect existing `inboundEvents`;
4. return success for already-processed duplicate;
5. schedule internal processor.

Response:

```text
200 { "received": true }
```

Invalid signature:

```text
401/403 application error
```

Malformed event:

```text
400 WEBHOOK_INVALID
```

Provider operations must not block the HTTP response longer than necessary.

---

# 28. Resident Confirmation Contract

## `GET /confirm`

Input:
- token;
- decision.

Behavior:
- validate token format;
- render generic confirmation page;
- do not mutate case.

## `POST /confirm`

Input:
```text
{
  token,
  decision
}
```

Behavior:
1. hash token;
2. locate token;
3. validate decision matches token;
4. validate expiry;
5. validate unused;
6. run internal atomic confirmation mutation;
7. mark token used.

Success:
- generic confirmation page.

Failure:
- `TOKEN_EXPIRED`;
- `TOKEN_USED`;
- `NOT_FOUND`.

Do not reveal case information.

---

# 29. Database Operation Map

## Manual case

```text
cases.createManual
  → validate membership
  → validate property relation
  → allocate case number
  → INSERT cases
  → INSERT CASE_CREATED activity
  → optional schedule AI action
  → commit
```

## Status change

```text
cases.transitionStatus
  → authenticate
  → load membership
  → load case
  → verify current state
  → verify allowed next state
  → UPDATE cases
  → INSERT activity
  → schedule/cancel reminders
  → commit
```

## Vendor email

```text
approveSend mutation
  → UPDATE communication = pending_send
  → schedule send action
  → commit

send action
  → call AgentMail
  → internal finalize mutation
  → UPDATE communication = sent/failed/uncertain
  → INSERT activity
```

## Inbound email

```text
webhook
  → verify
  → INSERT inbound event if unique
  → schedule processor

processor
  → fetch canonical AgentMail message
  → INSERT communication if unique
  → schedule AI triage

triage action
  → OpenAI
  → validate output
  → internal mutation
  → UPDATE case
  → INSERT activity
```

## Resident confirmation

```text
POST confirm
  → hash token
  → transaction
      → token unused?
      → case still awaiting confirmation?
      → mark token used
      → UPDATE case
      → INSERT activity
  → commit
```

---

# 30. Concurrency and Race Conditions

### Double close
Second close sees `CLOSED` and returns `CONFLICT`.

### Double transition
Transition mutation validates current state inside transaction.

### Two staff assign simultaneously
Last valid transaction wins unless case assignment is protected by an expected version in the mutation.

### Two confirmation clicks
First consumes token; second sees `usedAt`.

### Duplicate webhook
Unique provider event/message prevents duplicate processing.

### Double email send click
The first approval changes communication state from draft to pending. A second approval sees non-draft state and is rejected.

### Vendor discovery spam
Reject duplicate in-flight research for same case/user window.

---

# 31. Index Strategy

Required indexes:

```text
users.by_clerkUserId

workspaces.by_agentMailInboxId

workspaceMembers.by_workspaceId
workspaceMembers.by_userId
workspaceMembers.by_workspaceId_and_userId

properties.by_workspaceId
properties.by_workspaceId_and_active

buildings.by_propertyId
buildings.by_workspaceId

units.by_buildingId
units.by_propertyId
units.by_workspaceId

cases.by_workspaceId
cases.by_workspaceId_and_status
cases.by_workspaceId_and_priority
cases.by_workspaceId_and_propertyId
cases.by_workspaceId_and_assigneeId
cases.by_workspaceId_and_lastActivityAt
cases.by_agentmail_thread

caseActivities.by_caseId
caseActivities.by_workspaceId_and_createdAt

caseCounters.by_workspaceId

communications.by_workspaceId
communications.by_caseId
communications.by_agentMailThreadId
communications.by_agentMailMessageId
communications.by_workspaceId_and_createdAt

vendors.by_workspace

vendorResearch.by_case
vendorResearchResults.by_research

inboundEvents.by_providerEventId
inboundEvents.by_providerMessageId
inboundEvents.by_processingStatus

notifications.by_user
notifications.by_workspace

confirmationTokens.by_tokenHash
confirmationTokens.by_case
confirmationTokens.by_expiresAt
```

Use text search/index support only where it materially improves the cases search screen. Do not introduce vector search for MVP.

---

# 32. Third-Party Adapter Boundaries

Third-party SDK/API calls must be isolated behind small server modules:

```text
convex/lib/providers/
  clerk.ts
  agentmail.ts
  openai.ts
  firecrawl.ts
```

Business logic must not depend directly on provider response shapes throughout the application.

Adapters normalize external responses into Realtrail domain shapes.

Benefits:
- mockable tests;
- provider failure isolation;
- less vendor lock-in;
- easier debugging.

---

# 33. External Provider Failure Policy

OpenAI:
- one automatic retry;
- then mark AI operation failed;
- retain original case/message.

Firecrawl:
- one retry;
- then failed research record;
- allow manual vendor creation.

AgentMail inbound fetch:
- retry via scheduler;
- never discard event after signature verification.

AgentMail outbound:
- persist pending operation before send;
- reuse stable communication/draft identity;
- if result is unknown, mark `SEND_UNCERTAIN` rather than blindly creating another communication.

No provider failure may delete the underlying case.

---

# 34. Environment Configuration Matrix

| Variable | Required | Runtime | Purpose |
|---|---|---|---|
| `VITE_CONVEX_URL` | yes | client | Convex deployment URL |
| `VITE_CLERK_PUBLISHABLE_KEY` | yes | client | Clerk browser auth |
| `CLERK_FRONTEND_API_URL` | yes | server | Convex Clerk auth config |
| `AGENTMAIL_API_KEY` | yes | server | AgentMail API |
| `AGENTMAIL_WEBHOOK_SECRET` | yes | server | AgentMail webhook verification |
| `FIRECRAWL_API_KEY` | yes | server | Firecrawl |
| `OPENAI_API_KEY` | yes | server | OpenAI |
| `OPENAI_TRIAGE_MODEL` | yes | server | triage model |
| `OPENAI_DRAFT_MODEL` | yes | server | draft model |
| `PUBLIC_APP_URL` | yes | server | public links |
| `REALTRAIL_CONFIRMATION_TOKEN_TTL_HOURS` | yes | server | confirmation expiry |
| `REALTRAIL_VENDOR_FOLLOWUP_HOURS` | yes | server | vendor follow-up |
| `REALTRAIL_RESIDENT_REMINDER_HOURS` | yes | server | confirmation reminder |
| `REALTRAIL_ESCALATION_HOURS` | yes | server | manager escalation |

Client variables must contain no secret credentials.

---

# 35. Implementation Detail — Agent May Decide

The following are intentionally implementation-level choices:

- exact folder nesting under the specified top-level boundaries;
- exact shadcn component variants;
- exact icon per activity event;
- exact CSS implementation of spacing tokens;
- exact test fixture factory implementation;
- exact provider SDK wrapper function naming;
- exact Vite route library configuration;
- exact logging helper implementation.

These choices must not alter product behavior or architecture.
