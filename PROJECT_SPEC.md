# REALTRAIL — PROJECT_SPEC.md

## 0. Document status

**Status:** Implementation-ready specification  
**Product:** Realtrail  
**Primary audience:** Estate managers / property operations teams  
**Scope:** MVP only  
**Source of truth:** This document controls product requirements.  
**Architecture source of truth:** `ARCHITECTURE.md`  
**Build sequence source of truth:** `IMPLEMENTATION_PLAN.md`  
**Agent operating rules:** `AGENTS.md`  
**Continuity:** `AI_HANDOFF.md`

---

# 1. Product Definition

## 1.1 Product name

**Realtrail**

## 1.2 One-line description

Realtrail is an AI-assisted estate operations control center that turns resident/property issues into tracked cases, coordinated vendor actions, and verified resolution.

## 1.3 Problem

Estate operations are often coordinated across email, WhatsApp conversations, phone calls, spreadsheets, and informal memory. A resident reports a problem, someone forwards it, a vendor is contacted, the vendor replies later, a technician is scheduled, and the manager must remember what is still waiting on whom.

This produces operational failure modes:

- issues are missed or forgotten;
- urgency is inconsistent;
- ownership is unclear;
- vendor follow-up is manual;
- residents repeatedly ask for status;
- managers lack a trustworthy timeline;
- the fact that a vendor says “done” is easily mistaken for a confirmed resolution;
- information is distributed across channels rather than attached to one case.

Realtrail addresses the operational gap between **report received** and **issue actually resolved**.

## 1.4 Current alternatives / workarounds

Realtrail is replacing a fragmented workflow, not a single incumbent product. Typical alternatives/workarounds include:

- shared email inboxes;
- WhatsApp groups;
- phone calls;
- spreadsheets;
- paper/clipboard logs;
- generic task-management tools;
- generic property-management / maintenance systems;
- vendor contact lists;
- manually forwarding email between managers and vendors.

These tools may each solve part of the problem, but Realtrail's MVP is specifically optimized around the case lifecycle and operational next action.

## 1.5 Target users

### Primary

**Estate manager / property operations manager**

Responsible for handling maintenance, security, utilities, common-area issues, residents, vendors, and operational follow-up.

### Secondary

**Estate operations staff**

Team members who create, update, assign, and follow cases under the direction of the manager.

### External participants

**Residents / tenants** and **vendors / service providers** interact primarily through email. They are not separate Realtrail application users in MVP.

## 1.6 User roles

### Workspace Owner

The user who creates the Realtrail workspace.

Permissions:
- full workspace access;
- manage workspace settings;
- full case operations;
- manage vendor directory;
- send resident/vendor communications;
- close/reopen cases;
- manage members when member-management UI is enabled.

### Manager

Operational administrator.

Permissions:
- all operational case actions;
- assign/reassign cases;
- approve/send communications;
- manage vendors;
- move cases through lifecycle;
- confirm/close/reopen cases;
- cannot delete or transfer workspace ownership.

### Staff

Operational team member.

Permissions:
- view cases in their workspace;
- create cases;
- update case fields;
- add notes;
- contact residents/vendors;
- run vendor discovery;
- assign cases to self where allowed;
- advance cases through operational states;
- may request resident confirmation;
- **cannot perform final closure** of a resolved case;
- cannot change workspace integration configuration or membership.

### Resident

Not an authenticated Realtrail application role in MVP.

Capabilities:
- receive case-related email;
- use a signed confirmation/reopen link;
- optionally reply by email for future/manual handling.

### Vendor

Not an authenticated Realtrail application role in MVP.

Capabilities:
- receive service requests by email;
- reply to AgentMail thread;
- provide scheduling/completion information.

## 1.7 Core value proposition

Realtrail gives an estate manager one operational system of record for every issue:

**what happened → what AI understood → who owns it → who was contacted → what is waiting → what happens next → whether it was actually confirmed resolved.**

## 1.8 Key differentiator

The product is not an AI chatbot and not a general property ERP.

The differentiator is an **AI-assisted case operations layer** in which:

- inbound requests become structured operational cases;
- AI understands and summarizes the request;
- Convex keeps the operational state live;
- Firecrawl discovers relevant vendors when needed;
- AgentMail performs resident/vendor communication;
- every important action becomes part of the case timeline;
- resolution remains explicitly separate from closure.

## 1.9 Primary use case

A resident emails the estate's Realtrail intake address:

> “The water pressure in Block C has been terrible since yesterday.”

Realtrail:

1. receives the email;
2. records the inbound message;
3. safely fetches canonical message data from AgentMail;
4. asks OpenAI to produce structured triage suggestions;
5. creates a new case with AI suggestions but does not silently approve consequential actions;
6. surfaces the case in the manager's attention queue;
7. manager reviews/accepts/corrects triage;
8. manager clicks **Find a vendor**;
9. Firecrawl searches public web sources for relevant providers;
10. manager selects a vendor;
11. Realtrail generates a vendor email draft;
12. manager reviews and approves;
13. AgentMail sends it;
14. vendor reply appears on the same case;
15. manager schedules the work;
16. resident receives a status update;
17. after completion, case moves to **Awaiting Confirmation**;
18. resident confirms;
19. case moves to **Resolved**;
20. manager closes it.

## 1.10 Secondary use cases

- manager manually records a phone/WhatsApp report as a new case;
- manager updates or reassigns an existing case;
- manager sends a resident update;
- manager researches a vendor;
- vendor replies with availability;
- resident reports that an issue is not fixed and reopens the case;
- manager reviews a live dashboard to find what needs attention;
- manager searches/filter cases by property, status, priority, vendor, or text.

## 1.11 Explicit non-goals

Realtrail MVP is **not**:

- a full property-management ERP;
- a resident portal;
- a vendor portal;
- a rent-collection system;
- a payment platform;
- an accounting system;
- a lease-management system;
- a maintenance-asset CMMS;
- a procurement marketplace;
- a calendar platform;
- a mobile-native app;
- a general-purpose AI chatbot;
- an autonomous agent that independently sends important messages or closes cases;
- an advanced vendor-rating/reputation marketplace;
- a property inspection platform;
- a WhatsApp automation platform;
- a workflow-builder product.

---

# 2. MVP Scope

## 2.1 MUST HAVE

### A. Authentication
- Clerk sign-in/sign-up.
- Convex authenticated functions.
- Workspace access enforcement.

### B. Workspace onboarding
- Create one Realtrail workspace.
- Define estate/property name, address, timezone, currency.
- Create initial property.
- Create buildings/blocks and units manually during setup or later.

### C. Estate structure
- Property.
- Building/block.
- Unit.

### D. Case management
- Create manual case.
- Create case from inbound AgentMail email.
- View cases.
- Search/filter/sort cases.
- View case detail.
- Edit issue/category/priority/property/unit/assignee.
- Case lifecycle.
- Add internal notes.
- Case activity timeline.
- Reassign case.
- Resolve.
- Close.
- Reopen.

### E. AI intake and triage
- OpenAI Responses API.
- Structured JSON output.
- Category suggestion.
- Priority suggestion.
- Summary.
- Missing information.
- Suggested next action.
- Possible related cases.
- Manager review before consequential structured approval.
- AI provenance shown in UI.
- AI never performs final closure.

### F. AgentMail
- One operational inbox per workspace.
- Receive inbound messages.
- Capture email/thread metadata.
- Send approved outbound messages.
- Link conversations to cases.
- Show conversation history in case/inbox.
- Receive vendor/resident replies by webhook.
- Verify webhook signatures.
- Deduplicate webhook deliveries.

### G. Vendor discovery
- User launches discovery from a case.
- Firecrawl search public web.
- Scrape selected candidate sites.
- Show provider name, service, location, website, contact information, and evidence.
- User selects and saves vendor.
- No opaque vendor score.

### H. Vendor/resident communication
- AI-generated draft.
- Manager/staff reviews and edits.
- Explicit send action.
- Sent communication recorded on case.
- Resident update templates.
- Vendor request templates.

### I. Resolution verification
- Request resident confirmation.
- Signed confirmation flow with **Yes / No**.
- Yes → Resolved.
- No → Work in Progress / reopened operational state.
- Confirmation is separate from AI judgment.
- Resolved → manager/owner closure.

### J. Realtime operations
- Live dashboard metrics.
- Live case updates.
- Live activity timeline.
- Live inbox updates.

### K. Notifications / attention
- In-app attention indicators.
- Vendor follow-up reminders.
- Resident confirmation reminders.
- Escalation to manager attention.

### L. Responsive UI
- Desktop.
- Tablet.
- Mobile.
- One application, not separate apps.

## 2.2 SHOULD HAVE

- Team invitation UI.
- Basic resident/contact directory.
- Saved vendor editing.
- Email-thread reply composer.
- Keyboard shortcuts.
- CSV import for units.
- Custom case categories.
- Manager notification email summaries.
- Basic dashboard date range selector.

## 2.3 NICE TO HAVE

- Attachment ingestion.
- Vendor quote tracking.
- Rich email HTML.
- Calendar integration.
- Recurring maintenance.
- AI grouping of recurring issues.
- SLA configuration UI.
- Advanced activity filtering.
- Saved case views.

## 2.4 FUTURE

- Resident portal.
- Vendor portal.
- WhatsApp integration.
- Payments / purchase orders.
- Procurement workflows.
- Multi-estate portfolio analytics.
- Automated vendor dispatch policies.
- Mobile native apps.
- Advanced asset management.
- Predictive maintenance.
- Vendor performance analytics.
- AI autonomous operations beyond approved guardrails.

## 2.5 OUT OF SCOPE

- payment processing;
- escrow;
- payout balances;
- financial transfers;
- invoice reconciliation;
- lease or rent data;
- direct WhatsApp automation;
- autonomous vendor selection and contact;
- autonomous case closure;
- public-facing vendor marketplace;
- public search index of cases;
- attachments in MVP;
- custom workflow builder.

---

# 3. MVP Screens

1. `/sign-in`
2. `/sign-up`
3. `/onboarding`
4. `/overview`
5. `/cases`
6. `/cases?caseId=<id>` — case detail state
7. `/inbox`
8. `/properties`
9. `/vendors`
10. `/settings`

Modal/drawer interactions:
- New Case
- AI Intake Review
- Find Vendor
- Vendor Details
- Draft Message
- Send Message Confirmation
- Add Note
- Reassign
- Change Status
- Request Confirmation
- Close Case
- Reopen Case

No standalone Tasks page or standalone Activity page in MVP. Task/attention and activity are represented contextually.

---

# 4. Complete User Flows

## 4.1 First-time onboarding

### Entry point
`/sign-up`

### Preconditions
- user is not authenticated.

### User action
- signs up with Clerk;
- enters estate/workspace name;
- enters property name/address;
- selects timezone;
- selects currency.

### System behavior
- create workspace;
- create membership with role `owner`;
- create initial property;
- redirect to overview.

### State changes
- user identity becomes available from Clerk;
- `users` record upserted;
- `workspaces` inserted;
- `workspaceMembers` inserted;
- `properties` inserted;
- audit activity inserted.

### Validation
- workspace name 2–80 chars;
- property name 2–100 chars;
- address 5–240 chars;
- timezone must be valid IANA timezone;
- currency must be a supported three-letter code;
- authenticated user cannot create a second workspace through the MVP onboarding mutation.

### Failure
- invalid field → inline validation;
- Convex failure → retain form data and show retry;
- duplicate provisioning attempt → return existing workspace where safe.

### Edge cases
- user refreshes during onboarding;
- double click;
- browser closes after workspace creation before property creation;
- integration setup failure.

### Exit
- authenticated overview page.

---

## 4.2 Manual case creation

### Entry point
Overview → New Case.

### User action
Manager/staff enters:
- issue title/description;
- property;
- unit optional;
- category;
- priority;
- reporter name/email optional;
- assignee optional.

### System behavior
- validate membership and property ownership;
- create case with status `NEW`;
- create activity `CASE_CREATED`;
- optionally schedule AI triage action only if manager requests “AI triage now”.

### State changes
Case + activity.

### Success
Case detail opens.

### Failure
No partial case creation.

---

## 4.3 Inbound resident email → AI triage

### Entry
Resident sends email to workspace AgentMail inbox.

### Architecture

```text
Resident
  ↓
AgentMail
  ↓
POST /webhooks/agentmail
  ↓
Verify webhook signature
  ↓
Convex mutation: record inbound event
  ↓
Deduplicate by provider event/message ID
  ↓
Schedule internal triage action
  ↓
Fetch canonical message/thread from AgentMail
  ↓
OpenAI structured triage
  ↓
Validate model output
  ↓
Convex mutation: persist triage + create case
  ↓
Realtime case appears in manager dashboard
```

### Preconditions
- workspace has active AgentMail inbox.

### Validation
- valid webhook signature;
- known AgentMail inbox ID;
- provider event ID and message ID not already processed.

### AI result
- title;
- summary;
- category;
- priority suggestion;
- property candidate;
- unit candidate;
- affected area;
- missing information;
- suggested next action;
- related-case candidates;
- `needsReview`.

### Rules
- model output is never trusted as database state without schema validation;
- property/unit references must match actual workspace records;
- invalid AI-selected IDs are dropped rather than inserted;
- if property cannot be confidently matched, leave property unset and set `needsReview=true`;
- case is `NEW` until manager accepts triage;
- AI may suggest `URGENT`, but may not lower a human-confirmed urgent priority;
- no email is sent as a consequence of triage.

### Success
New case visible with `AI suggested` badges.

### Failure
- OpenAI unavailable → case created from raw message as `NEW`, `aiTriageStatus=FAILED`, manager can retry;
- AgentMail fetch fails → inbound event retained, retry scheduled;
- malformed model output → no AI state applied, retry once then manager review;
- duplicate event → no duplicate case.

---

## 4.4 Manager reviews AI triage

### Entry
Cases list → case with `AI_REVIEW_REQUIRED`.

### User action
- inspect extracted fields;
- accept;
- correct;
- or dismiss suggestions.

### System
- compare proposed values against workspace records;
- store accepted fields;
- preserve original AI output;
- record reviewer and time;
- move status `NEW → TRIAGED`.

### Success
Case shows `TRIAGED`.

### Failure
Invalid property/unit combination → prevent save.

---

## 4.5 Vendor discovery

### Entry
Case detail → Find a vendor.

### Preconditions
- case exists;
- user has operational permission;
- service category or search term available;
- property has address/city information.

### System behavior

```text
Manager
  ↓
Find a vendor
  ↓
Convex action
  ↓
Construct bounded search query
  ↓
Firecrawl search
  ↓
Select up to 5 results
  ↓
Scrape up to 3 relevant sites
  ↓
Normalize provider information
  ↓
Persist discovery result
  ↓
Realtime result drawer
```

### Search inputs
- issue category;
- property locality;
- optional free-text refinement.

### Security
- never send secrets or internal case data to Firecrawl;
- do not scrape arbitrary non-HTTP(S) protocols;
- reject IP-literal URLs in manager-provided URL fields;
- vendor site content is untrusted data.

### Success
Provider cards show:
- name;
- service;
- location;
- email/phone if published;
- website;
- evidence;
- fetched timestamp.

### Failure
- no results → explain and offer manual vendor entry;
- provider page inaccessible → retain search result without scraped evidence;
- API limit → show retry state;
- malformed page → skip candidate.

---

## 4.6 Vendor contact

### Entry
Case detail → saved vendor → Contact vendor.

### System
1. Build context from case.
2. Generate AI draft only on explicit user action.
3. Store draft.
4. User reviews/edits.
5. User clicks send.
6. Create outbound communication record.
7. Schedule send action.
8. AgentMail sends.
9. Finalize communication and activity.

### Rule
AI may draft; only authenticated user with permission may authorize send.

### Success
Communication appears as `Sent`.

### Failure
- AI unavailable → template fallback;
- invalid recipient → block send;
- AgentMail failure → communication `FAILED`, retry action available;
- uncertain provider response → communication `SEND_UNCERTAIN`; do not silently create a second send.

---

## 4.7 Vendor reply

```text
Vendor
  ↓
AgentMail thread reply
  ↓
Webhook
  ↓
Verify signature
  ↓
Deduplicate event
  ↓
Map inbox + thread
  ↓
Append message
  ↓
Update case last activity
  ↓
Optional AI summary/classification
  ↓
Realtime UI
```

Rules:
- known thread IDs map directly to case;
- if no thread mapping exists, search case token in subject;
- if still unmapped, place in Inbox as unlinked conversation;
- do not guess a case when multiple candidates match.

---

## 4.8 Schedule work

### User action
Manager selects `Schedule vendor`.

### Inputs
- date/time window;
- optional note.

### Validation
- date/time valid;
- case is in `VENDOR_CONTACTED` or equivalent operational state;
- no conflicting active scheduling record.

### State
`VENDOR_CONTACTED → SCHEDULED`

### Activity
- `VENDOR_SCHEDULED`.

---

## 4.9 Work completed → confirmation

### User action
Manager selects `Mark work in progress`, then after vendor completion selects `Request resident confirmation`.

### State
`WORK_IN_PROGRESS → AWAITING_CONFIRMATION`

### System
- create signed one-time confirmation token;
- email resident;
- schedule 24h reminder;
- schedule 48h reminder;
- schedule 72h escalation.

### Resident confirmation

```text
Resident clicks link
  ↓
GET confirmation page
  ↓
Resident clicks Confirm
  ↓
POST signed token
  ↓
Verify token, expiry, nonce and one-time-use
  ↓
Internal mutation
  ↓
YES → RESOLVED
NO  → WORK_IN_PROGRESS
```

### Rules
- token is short-lived and single-use;
- token reveals no case data beyond generic confirmation context;
- resident cannot modify arbitrary case IDs;
- expired token cannot mutate state;
- already-used token returns a safe idempotent result.

---

## 4.10 Close case

### Preconditions
- case state is `RESOLVED`, or authorized manager/owner explicitly closes for non-resolution reason.

### User action
Manager/owner clicks Close Case.

### Inputs
- closure reason:
  - `resolved`;
  - `duplicate`;
  - `invalid`;
  - `cancelled`.
- closure note optional for resolved;
- required note for duplicate/invalid/cancelled.

### Rule
- `resolved` closure requires `RESOLVED`;
- non-resolution closure requires manager/owner;
- AI cannot close.

### Success
`CLOSED`.

---

## 4.11 Reopen case

### Entry
Closed case or negative resident confirmation.

### User action
Manager/owner/staff with permission opens/reopens.

### Behavior
- capture reopen reason;
- increment `reopenCount`;
- clear stale confirmation token;
- move to `IN_PROGRESS`;
- create activity.

---

## 4.12 Inbox

### Entry
Sidebar → Inbox.

### Behavior
- list local conversation records;
- unread/recent indicators;
- filter Residents / Vendors / All;
- open conversation;
- show linked case;
- navigate to case.

MVP does not attempt to replace AgentMail's full email client.

---

# 5. Functional Requirements

## FR-01 Authentication

**Actor:** Any user

**Acceptance criteria**
- unauthenticated user cannot access protected routes;
- authenticated user can enter overview;
- backend rejects unauthenticated Convex calls;
- auth identity is never supplied by client as an authoritative user ID.

## FR-02 Workspace isolation

**Actor:** Authenticated user

**Acceptance criteria**
- every protected query/mutation derives the authenticated identity;
- membership is checked before returning/modifying workspace records;
- a user cannot access another workspace by changing an ID in client input;
- tests prove cross-workspace reads and writes fail.

## FR-03 Onboarding

Acceptance:
- one workspace + first property can be created atomically;
- owner membership is created in the same transaction;
- retry does not create duplicates;
- onboarding is resumable or safely repeatable.

## FR-04 Case creation

Acceptance:
- valid case creates exactly one case and one create activity;
- invalid property/unit relation is rejected;
- reporter email is validated;
- all user-entered text is bounded.

## FR-05 Case listing

Acceptance:
- filters work together;
- search never returns records outside workspace;
- pagination prevents unbounded reads;
- ordering is deterministic.

## FR-06 Case detail

Acceptance:
- displays issue, property/unit, status, priority, assignee;
- shows AI summary if present;
- shows timeline;
- shows next action;
- shows communications;
- supports only authorized actions.

## FR-07 AI triage

Acceptance:
- OpenAI output conforms to defined schema;
- invalid model output is rejected;
- AI cannot create arbitrary database relationships;
- original inbound message remains available;
- AI suggestions are clearly labeled;
- triage can be corrected by authorized user.

## FR-08 Vendor discovery

Acceptance:
- search launched only by authorized user;
- Firecrawl call is server-side;
- result is stored with source URL and fetched time;
- user can save vendor;
- no opaque scoring is presented.

## FR-09 Communications

Acceptance:
- AI cannot send directly;
- sender/recipient is derived server-side;
- send requires authenticated approval;
- communication is linked to case;
- outbound send has durable status;
- provider failures are visible.

## FR-10 Webhooks

Acceptance:
- invalid signatures return non-success;
- valid duplicate events do not duplicate records/cases;
- event records are durable;
- webhook processing is safe to retry.

## FR-11 Resolution

Acceptance:
- vendor completion alone cannot close case;
- confirmation moves case to `RESOLVED`;
- negative response moves case back to work;
- token cannot be reused.

## FR-12 Closure

Acceptance:
- AI cannot close;
- staff cannot final-close;
- manager/owner can close;
- resolved closure requires `RESOLVED`;
- non-resolution closure requires reason/note.

## FR-13 Realtime

Acceptance:
- a changed case appears in connected dashboard without manual refresh;
- timeline updates when an activity is inserted;
- inbox updates when a message arrives.

---

# 6. Business Rules

## 6.1 Required case fields

Required at creation:
- workspace;
- title;
- description;
- status;
- priority;
- createdAt;
- updatedAt;
- createdBy.

Property is required after triage review unless case is explicitly marked `location_unknown`.

## 6.2 Priority

Values:
- `LOW`
- `MEDIUM`
- `HIGH`
- `URGENT`

Priority model:
- AI can suggest;
- manager/staff can override subject to role;
- once a human sets `URGENT`, AI cannot lower it;
- urgent cases are surfaced prominently;
- urgency does not automatically trigger outbound communication.

## 6.3 Categories

MVP controlled vocabulary:
- plumbing
- electrical
- power_generator
- water
- hvac
- security_access
- cleaning
- structural
- appliance
- common_area
- other

Unknown categories map to `other` with AI suggestion stored separately.

## 6.4 Assignment

- case may be unassigned;
- only workspace members can be assignees;
- assigning creates activity;
- self-assign allowed for staff unless already owned by another user and policy prevents reassignment;
- manager/owner may reassign any case.

## 6.5 Duplicate cases

- same AgentMail provider message ID must never create more than one inbound record;
- same provider event ID must never be processed twice;
- same AgentMail thread should normally map to one case;
- multiple residents reporting the same issue are allowed to remain separate cases;
- AI may suggest related cases;
- automatic merge is not allowed in MVP;
- manager can manually mark a case duplicate during closure.

## 6.6 Case lifecycle state machine

Primary states:

```text
NEW
 ↓
TRIAGED
 ↓
IN_PROGRESS
 ↓
VENDOR_CONTACTED
 ↓
SCHEDULED
 ↓
WORK_IN_PROGRESS
 ↓
AWAITING_CONFIRMATION
 ↓
RESOLVED
 ↓
CLOSED
```

Negative confirmation:

```text
AWAITING_CONFIRMATION
 ↓
WORK_IN_PROGRESS
```

Reopen:

```text
CLOSED
 ↓
IN_PROGRESS
```

Non-resolution closure:

```text
NEW / TRIAGED / IN_PROGRESS / VENDOR_CONTACTED / SCHEDULED / WORK_IN_PROGRESS
        ↓
      CLOSED
```

Only manager/owner may use non-resolution closure.

## 6.7 Allowed transitions

| From | To | Who |
|---|---|---|
| NEW | TRIAGED | Manager, owner, staff |
| NEW | CLOSED | Manager, owner with non-resolution reason |
| TRIAGED | IN_PROGRESS | Any operational member |
| TRIAGED | CLOSED | Manager, owner with non-resolution reason |
| IN_PROGRESS | VENDOR_CONTACTED | Any operational member |
| IN_PROGRESS | CLOSED | Manager, owner with non-resolution reason |
| VENDOR_CONTACTED | SCHEDULED | Any operational member |
| VENDOR_CONTACTED | IN_PROGRESS | Any operational member |
| VENDOR_CONTACTED | CLOSED | Manager, owner with non-resolution reason |
| SCHEDULED | WORK_IN_PROGRESS | Any operational member |
| SCHEDULED | IN_PROGRESS | Any operational member |
| SCHEDULED | CLOSED | Manager, owner with non-resolution reason |
| WORK_IN_PROGRESS | AWAITING_CONFIRMATION | Any operational member |
| WORK_IN_PROGRESS | CLOSED | Manager, owner with non-resolution reason |
| AWAITING_CONFIRMATION | RESOLVED | Resident confirmation or manager/owner verified confirmation |
| AWAITING_CONFIRMATION | WORK_IN_PROGRESS | Resident “No” or authorized manager/staff action |
| RESOLVED | CLOSED | Manager, owner |
| CLOSED | IN_PROGRESS | Manager, owner, staff with operational permission |

## 6.8 Resolution vs closure

`RESOLVED` means the underlying operational issue has been confirmed fixed.

`CLOSED` means the operational record is finished and no further action is expected.

Never treat these states as equivalent.

## 6.9 Reminder rules

Default MVP timing:

- vendor follow-up: 4 hours after outbound vendor request if no reply;
- resident confirmation reminder #1: 24 hours;
- resident confirmation reminder #2: 48 hours;
- manager escalation: 72 hours.

All timing is based on workspace timezone.

Reminders must be idempotent and must re-check current case state before sending.

## 6.10 Confirmation rules

A resident confirmation:
- is associated with one case;
- expires after 72 hours;
- is one-time-use;
- does not expose the case ID in a readable URL parameter without a signed token;
- does not reveal internal notes or vendor information.

## 6.11 Communication approval

- AI may draft;
- authenticated operational user must approve;
- sending is an explicit mutation followed by scheduled action;
- system never auto-sends because of model output alone.

## 6.12 Irreversible actions

Higher-risk actions:
- sending external email;
- closing a resolved case;
- closing as duplicate/invalid/cancelled;
- reopening from closed.

These require explicit user action.

---

# 7. Data Ownership and Visibility

## Workspace-private

- all cases;
- issue descriptions;
- internal notes;
- AI output;
- activity metadata;
- vendor research;
- resident email addresses;
- vendor email addresses;
- team memberships;
- communication history.

## Public

- nothing except the generic confirmation endpoint and generic success/failure messages.

## Sensitive

- email addresses;
- message contents;
- internal notes;
- AI prompts/context;
- provider IDs;
- webhook secrets;
- Clerk identity identifiers;
- vendor contact information;
- confirmation token hashes.

## Never expose

- OpenAI API key;
- AgentMail API key;
- Firecrawl API key;
- AgentMail webhook secret;
- confirmation token raw secrets;
- internal provider credentials;
- cross-workspace records.

---

# 8. Acceptance Test Set

A minimum end-to-end acceptance suite must prove:

1. User signs up and creates one workspace.
2. User sees empty dashboard.
3. User creates property/building/unit.
4. User manually creates a case.
5. Case appears in case list and dashboard without refresh.
6. AgentMail inbound message creates exactly one case.
7. AI triage suggestion is visible and editable.
8. User accepts triage and case becomes `TRIAGED`.
9. User discovers vendors.
10. User selects/saves a vendor.
11. AI drafts a vendor request.
12. User edits and sends.
13. Sent communication appears in timeline.
14. Mock webhook adds vendor reply to case.
15. User schedules vendor.
16. User moves case to work in progress.
17. User requests resident confirmation.
18. Signed confirmation “Yes” changes case to `RESOLVED`.
19. Manager closes case.
20. Signed confirmation “No” reopens operational work.
21. Cross-workspace access is denied.
22. Duplicate webhook event causes no duplicate message/case.
23. Invalid webhook signature is rejected.
24. AI output validation blocks malformed output.
25. User without closure permission cannot close a resolved case.
26. Realtime update is visible to a second browser session.

---

# 9. MVP Definition of Done

The MVP is complete only when:

- all MUST HAVE features work;
- all P0 acceptance tests pass;
- `npm run lint` passes;
- `npm run typecheck` passes;
- `npm run test:once` passes;
- Playwright critical-path tests pass;
- production build succeeds;
- public deployment is accessible;
- Convex functions are deployed;
- AgentMail webhook works in production;
- OpenAI call works in production;
- Firecrawl vendor discovery works in production;
- no client bundle contains server secrets;
- cross-workspace authorization tests pass;
- the coding agent has run a dedicated security pass;
- `hackathon.md` exists and reflects actual shipped functionality.

---


---

# 10. Screen-by-Screen UX Specification

## 11.1 Sign In

**Route:** `/sign-in`  
**Role:** unauthenticated

Purpose:
- authenticate the manager/staff user.

Layout:
- centered auth card;
- Realtrail wordmark;
- short product descriptor;
- Clerk-managed authentication form;
- support/loading/error states.

Success:
- authenticated user with workspace → `/overview`;
- authenticated user without workspace → `/onboarding`.

Failure:
- show provider error without exposing internal details.

Responsive:
- full-width card with 16px side padding on mobile.

---

## 11.2 Sign Up

**Route:** `/sign-up`

Purpose:
- create a Realtrail user account.

Success:
- authenticated state;
- route to onboarding if no workspace exists.

---

## 11.3 Onboarding

**Route:** `/onboarding`  
**Role:** authenticated, no workspace

Sections:
1. Estate/workspace details.
2. Initial property.
3. Optional first building/unit.
4. Operational preferences.

Required:
- workspace/estate name;
- property name;
- property address;
- timezone;
- currency.

Primary action:
- `Create workspace`.

Loading:
- disable duplicate submission;
- show progress indicator.

Error:
- preserve entered values;
- show field-level errors where possible;
- show retry for provider/backend errors.

---

## 11.4 Overview

**Route:** `/overview`  
**Role:** authenticated workspace member

Purpose:
- answer the four North Star questions immediately.

Layout order:
1. Header / greeting.
2. Primary attention card.
3. Four metric cards.
4. Operations flow.
5. Up-next list.
6. Recent activity.

Header:
- workspace/estate name;
- current date;
- profile menu.

Attention card:
- open cases needing attention;
- urgent count;
- waiting on vendor;
- awaiting confirmation;
- button: `Review cases`.

Metrics:
- open;
- urgent;
- waiting on vendor;
- resolved this week.

Operations flow:
- NEW;
- TRIAGED;
- IN_PROGRESS;
- VENDOR_CONTACTED;
- AWAITING_CONFIRMATION;
- RESOLVED.

The flow is visual/summary only; clicking a stage filters cases.

Up next:
- chronological action-oriented entries;
- each opens a case.

Recent activity:
- latest case events;
- compact event type icon;
- timestamp;
- case link.

Empty state:
- "You're caught up."
- button `Create first case`.

Mobile:
- metric cards become 2-column or horizontal scroll;
- operations flow becomes horizontally scrollable;
- attention card remains prominent.

---

## 11.5 Cases

**Route:** `/cases`

Purpose:
- operational case queue.

Top section:
- page title;
- `New case` button;
- metric strip.

Filters:
- search;
- status;
- priority;
- property;
- category;
- vendor;
- assignee;
- sort.

Desktop:
- table columns:
  - case;
  - property/location;
  - issue;
  - status;
  - priority;
  - next action;
  - updated.

Mobile:
- case cards:
  - case number;
  - title;
  - location;
  - priority;
  - status;
  - next action;
  - updated time.

Loading:
- skeleton rows/cards.

Empty:
- no cases → onboarding-style empty state;
- filters produced no result → `Clear filters`.

Error:
- query error with retry.

---

## 11.6 Case Detail

**Route:** `/cases?caseId=<id>`

Purpose:
- center of gravity for operations.

Desktop layout:
- main content left;
- action panel right.

Header:
- back to cases;
- case number;
- title;
- location;
- status;
- priority;
- assignee;
- overflow menu.

AI Summary card:
- label `Realtrail AI`;
- generated summary;
- suggested next action;
- AI-generated timestamp;
- `Review triage` when applicable.

Issue section:
- original description;
- reporter;
- property/building/unit;
- category.

Timeline:
- newest activity appended;
- chronological;
- filter not required in MVP.

Communications:
- messages grouped by thread;
- direction labels;
- inbound/outbound badge;
- timestamp;
- plain text.

Vendor section:
- selected vendor;
- contact;
- latest contact;
- discovery evidence;
- `Find vendor`;
- `Contact vendor`.

Action panel:
- contextual next action;
- add note;
- change status;
- reassign;
- contact resident;
- contact vendor;
- request confirmation;
- close/reopen.

Resolution section:
- appears when resolution exists;
- vendor;
- resolution summary;
- cost if entered;
- completed time;
- confirmed by;
- confirmation time.

Mobile:
- single column;
- action panel becomes ordered stack;
- primary next action appears above secondary actions.

---

## 11.7 New Case modal

Fields:
- title;
- description;
- property;
- building;
- unit;
- category;
- priority;
- reporter name/email;
- assignee.

Actions:
- Cancel;
- Create case;
- Create + AI triage.

Validation:
- title 3–120 chars;
- description 3–10,000 chars;
- reporter email RFC-compatible;
- property/building/unit consistency;
- priority enum;
- category enum.

---

## 11.8 AI Intake Review

Displayed as a sheet/drawer over Case Detail.

Shows:
- original report;
- AI summary;
- category suggestion;
- priority suggestion;
- property/building/unit suggestions;
- missing information;
- suggested next action;
- possible related cases.

Each editable field must have:
- current value;
- proposed AI value;
- accept/edit control.

Actions:
- `Accept triage`;
- `Save corrections`;
- `Dismiss suggestions`.

AI content must be visually marked as AI-generated.

---

## 11.9 Inbox

**Route:** `/inbox`

Purpose:
- lightweight operational email view.

Desktop:
- left conversation list;
- right conversation panel.

List:
- participant;
- subject;
- preview;
- last activity;
- linked case indicator;
- unread indicator.

Filters:
- all;
- residents;
- vendors.

Conversation:
- plain-text message bubbles/blocks;
- timestamps;
- case link.

No full email-client feature set in MVP.

Mobile:
- list page;
- tap into thread;
- back to list.

---

## 11.10 Properties

**Route:** `/properties`

Purpose:
- manage estate structure.

Layout:
- properties;
- selected property;
- buildings;
- units.

Actions:
- add property;
- add building;
- add unit;
- edit unit/building/property.

No rent/lease/accounting information.

---

## 11.11 Vendors

**Route:** `/vendors`

Purpose:
- saved operational vendor directory.

List:
- name;
- categories;
- location;
- email/phone;
- last contacted;
- cases handled count.

Actions:
- save;
- edit;
- open related cases.

Discovery is launched from a case and can surface a save action.

---

## 11.12 Settings

**Route:** `/settings`

MVP sections:
- workspace details;
- timezone/currency;
- AgentMail inbox status;
- integration health indicators;
- signed-in account.

Team management UI is SHOULD HAVE.

Never display provider API keys.

---

# 11. Reusable UI Components

Required shared components:

- `AppShell`
- `Sidebar`
- `MobileHeader`
- `PageHeader`
- `MetricCard`
- `AttentionCard`
- `StatusBadge`
- `PriorityBadge`
- `CaseTable`
- `CaseCard`
- `CaseTimeline`
- `ActivityItem`
- `AIInsightCard`
- `NextActionPanel`
- `FilterBar`
- `SearchInput`
- `EmptyState`
- `ErrorState`
- `LoadingSkeleton`
- `ConfirmDialog`
- `Drawer`
- `DraftEditor`
- `VendorCard`
- `VendorDiscoveryDrawer`
- `ConversationList`
- `ConversationView`
- `PropertyTree`

---

# 12. Detailed Data Dictionary

## `users`

| Field | Type | Required | Default |
|---|---|---|---|
| `_id` | Convex Id | yes | generated |
| `clerkUserId` | string | yes | none |
| `email` | string | no | null |
| `name` | string | no | null |
| `createdAt` | number | yes | now |
| `updatedAt` | number | yes | now |

## `workspaces`

| Field | Type | Required | Default |
|---|---|---|---|
| `_id` | Convex Id | yes | generated |
| `name` | string | yes | none |
| `timezone` | string | yes | none |
| `currency` | string | yes | none |
| `status` | enum | yes | `active` |
| `createdBy` | Id<users> | yes | authenticated user |
| `createdAt` | number | yes | now |
| `updatedAt` | number | yes | now |

## `workspaceMembers`

| Field | Type | Required | Default |
|---|---|---|---|
| `_id` | Convex Id | yes | generated |
| `workspaceId` | Id<workspaces> | yes | none |
| `userId` | Id<users> | yes | none |
| `role` | enum | yes | `staff` except creator = `owner` |
| `createdAt` | number | yes | now |
| `updatedAt` | number | yes | now |

## `properties`

| Field | Type | Required | Default |
|---|---|---|---|
| `_id` | Convex Id | yes | generated |
| `workspaceId` | Id<workspaces> | yes | none |
| `name` | string | yes | none |
| `address` | string | yes | none |
| `city` | string | no | null |
| `country` | string | no | null |
| `timezone` | string | yes | workspace timezone |
| `active` | boolean | yes | true |
| `createdAt` | number | yes | now |
| `updatedAt` | number | yes | now |

## `buildings`

| Field | Type | Required | Default |
|---|---|---|---|
| `_id` | Convex Id | yes | generated |
| `workspaceId` | Id<workspaces> | yes | none |
| `propertyId` | Id<properties> | yes | none |
| `name` | string | yes | none |
| `code` | string | no | null |
| `createdAt` | number | yes | now |
| `updatedAt` | number | yes | now |

## `units`

| Field | Type | Required | Default |
|---|---|---|---|
| `_id` | Convex Id | yes | generated |
| `workspaceId` | Id<workspaces> | yes | none |
| `propertyId` | Id<properties> | yes | none |
| `buildingId` | Id<buildings> | yes | none |
| `label` | string | yes | none |
| `occupancyStatus` | enum | yes | `unknown` |
| `createdAt` | number | yes | now |
| `updatedAt` | number | yes | now |

## `cases`

Required at create:
- workspaceId;
- caseNumber;
- title;
- description;
- status;
- priority;
- category;
- createdBy;
- createdAt;
- updatedAt;
- lastActivityAt;
- reopenCount.

Optional:
- property/building/unit until triage review;
- reporter;
- assignee;
- AI fields;
- resolution;
- closure.

Defaults:
- status `NEW`;
- priority `MEDIUM`;
- category `other`;
- aiTriageStatus `not_started`;
- reopenCount `0`;
- locationUnknown `false`.

## `caseActivities`

Required:
- workspaceId;
- caseId;
- type;
- actorType;
- summary;
- createdAt.

## `communications`

Required:
- workspaceId;
- direction;
- participantType;
- agentMailInboxId;
- agentMailThreadId;
- fromEmail;
- toEmails;
- subject;
- textBody;
- status;
- createdAt;
- updatedAt.

## `vendors`

Required:
- workspaceId;
- name;
- serviceCategories;
- source;
- createdAt;
- updatedAt.

## `vendorResearch`

Required:
- workspaceId;
- caseId;
- query;
- status;
- createdAt.

## `vendorResearchResults`

Required:
- workspaceId;
- researchId;
- providerName;
- sourceUrl;
- rankBand;
- fetchedAt.

## `inboundEvents`

Required:
- provider;
- providerEventId;
- providerInboxId;
- eventType;
- payloadHash;
- processingStatus;
- attempts;
- createdAt.

## `notifications`

Required:
- workspaceId;
- userId;
- type;
- title;
- body;
- createdAt.

## `confirmationTokens`

Required:
- workspaceId;
- caseId;
- tokenHash;
- decision;
- expiresAt;
- createdAt.

---

# 13. API Contract Requirements

The canonical backend API contract is in `ARCHITECTURE.md`. The following rules apply to every operation:

- all IDs must be validated as the expected Convex ID type;
- all strings are length-bounded;
- enum fields are validated against server-side allowed values;
- workspace relationships are rechecked on the server;
- all mutations return the affected resource ID or a deterministic success object;
- errors are normalized to an application error code and safe user-facing message;
- provider errors are not returned raw to the browser.

Application error shape:

```text
{
  code: string
  message: string
  field?: string
  retryable?: boolean
}
```

Example codes:

```text
UNAUTHENTICATED
FORBIDDEN
NOT_FOUND
VALIDATION_ERROR
INVALID_TRANSITION
CONFLICT
DUPLICATE
RATE_LIMITED
PROVIDER_ERROR
AI_ERROR
WEBHOOK_INVALID
TOKEN_EXPIRED
TOKEN_USED
INTERNAL_ERROR
```

---

# 14. Operational Metrics Definitions

Dashboard metrics must be deterministic.

### Open cases
Cases whose status is not `CLOSED`.

### Urgent cases
Open cases with priority `URGENT`.

### Waiting on vendor
Cases in `VENDOR_CONTACTED`.

### Awaiting confirmation
Cases in `AWAITING_CONFIRMATION`.

### Resolved this week
Cases where `resolvedAt` is within the current workspace-local week.

### Needs attention
A case is attention-worthy when any is true:
- priority `URGENT`;
- waiting on vendor and follow-up due;
- awaiting resident confirmation and reminder due;
- AI triage requires review;
- communication failed/uncertain;
- provider operation failed.

These definitions must live in shared backend logic so dashboard and case views agree.

# 15. Architecture Decisions That This Spec Fixes

1. Convex is the backend of record.
2. React + Vite is the frontend.
3. Clerk is authentication.
4. AgentMail handles operational email.
5. OpenAI handles AI reasoning and structured extraction.
6. Firecrawl handles vendor web research.
7. Convex Scheduler handles delayed jobs/reminders.
8. No external relational database.
9. No Redis.
10. No Kafka/RabbitMQ.
11. No separate API server.
12. No payment system.
13. No autonomous AI state mutation.
14. No resident/vendor portal in MVP.
15. No custom caching layer.
