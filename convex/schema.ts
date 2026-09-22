import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_clerkUserId", ["clerkUserId"]),

  workspaces: defineTable({
    name: v.string(),
    timezone: v.string(),
    currency: v.string(),
    status: v.union(v.literal("active"), v.literal("suspended")),
    // AgentMail operational inbox for this workspace. Both are placeholders
    // until Phase 5-B provisions the live inbox.
    agentMailInboxId: v.optional(v.string()),
    agentMailInboxAddress: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_agentMailInboxId", ["agentMailInboxId"]),

  workspaceMembers: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    role: v.union(
      v.literal("owner"),
      v.literal("manager"),
      v.literal("staff"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspaceId", ["workspaceId"])
    .index("by_userId", ["userId"])
    .index("by_workspaceId_and_userId", ["workspaceId", "userId"]),

  properties: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    address: v.string(),
    city: v.optional(v.string()),
    country: v.optional(v.string()),
    timezone: v.string(),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspaceId", ["workspaceId"])
    .index("by_workspaceId_and_active", ["workspaceId", "active"]),

  buildings: defineTable({
    workspaceId: v.id("workspaces"),
    propertyId: v.id("properties"),
    name: v.string(),
    code: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspaceId", ["workspaceId"])
    .index("by_propertyId", ["propertyId"]),

  units: defineTable({
    workspaceId: v.id("workspaces"),
    propertyId: v.id("properties"),
    buildingId: v.id("buildings"),
    label: v.string(),
    occupancyStatus: v.union(
      v.literal("occupied"),
      v.literal("vacant"),
      v.literal("unknown"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspaceId", ["workspaceId"])
    .index("by_propertyId", ["propertyId"])
    .index("by_buildingId", ["buildingId"]),

  cases: defineTable({
    workspaceId: v.id("workspaces"),
    caseNumber: v.number(),
    title: v.string(),
    description: v.string(),
    status: v.union(
      v.literal("NEW"),
      v.literal("TRIAGED"),
      v.literal("IN_PROGRESS"),
      v.literal("VENDOR_CONTACTED"),
      v.literal("SCHEDULED"),
      v.literal("WORK_IN_PROGRESS"),
      v.literal("AWAITING_CONFIRMATION"),
      v.literal("RESOLVED"),
      v.literal("CLOSED"),
    ),
    priority: v.union(
      v.literal("LOW"),
      v.literal("MEDIUM"),
      v.literal("HIGH"),
      v.literal("URGENT"),
    ),
    category: v.union(
      v.literal("plumbing"),
      v.literal("electrical"),
      v.literal("power_generator"),
      v.literal("water"),
      v.literal("hvac"),
      v.literal("security_access"),
      v.literal("cleaning"),
      v.literal("structural"),
      v.literal("appliance"),
      v.literal("common_area"),
      v.literal("other"),
    ),
    propertyId: v.optional(v.id("properties")),
    buildingId: v.optional(v.id("buildings")),
    unitId: v.optional(v.id("units")),
    // Linked operational vendor (Phase 7). Set via cases.setVendor only.
    vendorId: v.optional(v.id("vendors")),
    reporterName: v.optional(v.string()),
    reporterEmail: v.optional(v.string()),
    assigneeId: v.optional(v.id("users")),
    aiTriageStatus: v.union(
      v.literal("not_started"),
      v.literal("pending"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    aiTriageVersion: v.optional(v.string()),
    aiTriageOutput: v.optional(v.any()),
    triageReviewedAt: v.optional(v.number()),
    triageReviewedBy: v.optional(v.id("users")),
    nextActionType: v.optional(v.string()),
    nextActionLabel: v.optional(v.string()),
    lastInboundAt: v.optional(v.number()),
    lastOutboundAt: v.optional(v.number()),
    lastActivityAt: v.number(),
    reopenCount: v.number(),
    // Reminder chain markers (Phase 10). Timestamps record that a
    // reminder chain was armed, never its outcome — the scheduled
    // actions re-check live case state before doing anything.
    notificationsScheduledAt: v.optional(v.number()),
    vendorFollowupScheduledAt: v.optional(v.number()),
    residentReminderScheduledAt: v.optional(v.number()),
    locationUnknown: v.boolean(),
    closedReason: v.optional(
      v.union(
        v.literal("resolved"),
        v.literal("duplicate"),
        v.literal("invalid"),
        v.literal("cancelled"),
      ),
    ),
    resolutionSummary: v.optional(v.string()),
    resolutionCostMinor: v.optional(v.number()),
    resolutionCompletedAt: v.optional(v.number()),
    resolvedAt: v.optional(v.number()),
    resolvedBy: v.optional(
      v.union(
        v.literal("resident"),
        v.literal("manager"),
        v.literal("owner"),
      ),
    ),
    closedAt: v.optional(v.number()),
    closedBy: v.optional(v.id("users")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspaceId", ["workspaceId"])
    .index("by_workspaceId_and_status", ["workspaceId", "status"])
    .index("by_workspaceId_and_priority", ["workspaceId", "priority"])
    .index("by_workspaceId_and_propertyId", ["workspaceId", "propertyId"])
    .index("by_workspaceId_and_assigneeId", ["workspaceId", "assigneeId"])
    .index("by_workspaceId_and_lastActivityAt", [
      "workspaceId",
      "lastActivityAt",
    ]),

  caseActivities: defineTable({
    workspaceId: v.id("workspaces"),
    caseId: v.id("cases"),
    type: v.string(),
    actorType: v.union(
      v.literal("user"),
      v.literal("system"),
      v.literal("ai"),
      v.literal("resident"),
      v.literal("vendor"),
    ),
    actorUserId: v.optional(v.id("users")),
    summary: v.string(),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_caseId", ["caseId"])
    .index("by_workspaceId_and_createdAt", ["workspaceId", "createdAt"]),

  caseCounters: defineTable({
    workspaceId: v.id("workspaces"),
    nextNumber: v.number(),
  }).index("by_workspaceId", ["workspaceId"]),

  communications: defineTable({
    workspaceId: v.id("workspaces"),
    caseId: v.optional(v.id("cases")),
    direction: v.union(v.literal("inbound"), v.literal("outbound")),
    participantType: v.union(
      v.literal("resident"),
      v.literal("vendor"),
      v.literal("other"),
    ),
    agentMailInboxId: v.string(),
    agentMailThreadId: v.string(),
    agentMailMessageId: v.optional(v.string()),
    status: v.union(
      v.literal("received"),
      v.literal("draft"),
      v.literal("pending_send"),
      v.literal("sending"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("send_uncertain"),
    ),
    fromEmail: v.string(),
    toEmails: v.array(v.string()),
    subject: v.string(),
    // MVP stores plain text only. Never render raw email HTML.
    textBody: v.string(),
    aiDraftSource: v.boolean(),
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    providerDraftId: v.optional(v.string()),
    providerMessageId: v.optional(v.string()),
    lastError: v.optional(v.string()),
    // Read state for the inbox UI. Undefined means unread.
    readAt: v.optional(v.number()),
    // AI triage markers (Phase 6). A communication is triaged at most
    // once: triageCaseId set means done; triageAttempts/triageFailedAt
    // track the 3-attempt retry budget without blocking inbox use.
    triagedAt: v.optional(v.number()),
    triageCaseId: v.optional(v.id("cases")),
    triageAttempts: v.optional(v.number()),
    triageFailedAt: v.optional(v.number()),
    triageError: v.optional(v.string()),
    // Outbound send markers (Phase 8). sendAttempts counts provider send
    // tries; undefined reads as 0. The pending_send → sending → sent /
    // failed / send_uncertain lifecycle is the durable duplicate-send
    // guard; the provider Idempotency-Key header is the second layer.
    sendAttempts: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspaceId", ["workspaceId"])
    .index("by_caseId", ["caseId"])
    .index("by_agentMailThreadId", ["agentMailThreadId"])
    .index("by_agentMailMessageId", ["agentMailMessageId"])
    .index("by_workspaceId_and_createdAt", ["workspaceId", "createdAt"]),

  inboundEvents: defineTable({
    provider: v.literal("agentmail"),
    providerEventId: v.string(),
    providerMessageId: v.optional(v.string()),
    providerInboxId: v.string(),
    eventType: v.string(),
    // sha256 of the raw webhook body. Stored for future reconciliation;
    // providerEventId is the current dedupe key.
    payloadHash: v.string(),
    processingStatus: v.union(
      v.literal("received"),
      v.literal("processing"),
      v.literal("processed"),
      v.literal("failed"),
    ),
    attempts: v.number(),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    processedAt: v.optional(v.number()),
  })
    .index("by_providerEventId", ["providerEventId"])
    .index("by_providerMessageId", ["providerMessageId"])
    .index("by_processingStatus", ["processingStatus"]),

  vendors: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    serviceCategories: v.array(
      v.union(
        v.literal("plumbing"),
        v.literal("electrical"),
        v.literal("power_generator"),
        v.literal("water"),
        v.literal("hvac"),
        v.literal("security_access"),
        v.literal("cleaning"),
        v.literal("structural"),
        v.literal("appliance"),
        v.literal("common_area"),
        v.literal("other"),
      ),
    ),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    location: v.optional(v.string()),
    source: v.union(v.literal("manual"), v.literal("firecrawl")),
    sourceUrl: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspaceId", ["workspaceId"])
    .index("by_workspaceId_and_createdAt", ["workspaceId", "createdAt"]),

  vendorResearch: defineTable({
    workspaceId: v.id("workspaces"),
    caseId: v.id("cases"),
    query: v.string(),
    locationContext: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_caseId", ["caseId"])
    .index("by_workspaceId_and_createdAt", ["workspaceId", "createdAt"])
    .index("by_status", ["status"]),

  vendorResearchResults: defineTable({
    workspaceId: v.id("workspaces"),
    researchId: v.id("vendorResearch"),
    providerName: v.string(),
    website: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    services: v.array(v.string()),
    location: v.optional(v.string()),
    sourceUrl: v.string(),
    // Bounded plain-text excerpt of scraped content (untrusted).
    evidence: v.optional(v.string()),
    rankBand: v.union(
      v.literal("high_relevance"),
      v.literal("relevant"),
      v.literal("other"),
    ),
    fetchedAt: v.number(),
  }).index("by_researchId", ["researchId"]),

  confirmationTokens: defineTable({
    workspaceId: v.id("workspaces"),
    caseId: v.id("cases"),
    // SHA-256 hex of the raw token. The raw token lives only in the
    // outbound email body — never in this table, never in logs.
    tokenHash: v.string(),
    // Optional at issue time: the resident chooses yes/no on the
    // /confirm page (Phase 9-B), and consumeConfirmation records it.
    decision: v.optional(v.union(v.literal("yes"), v.literal("no"))),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_case", ["caseId"])
    .index("by_expiresAt", ["expiresAt"]),

  notifications: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    caseId: v.optional(v.id("cases")),
    type: v.union(
      v.literal("vendor_followup"),
      v.literal("resident_confirmation"),
      v.literal("urgent_case"),
      v.literal("system_error"),
    ),
    title: v.string(),
    body: v.string(),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
    // Deterministic idempotency key `<caseId>:<type>:<cycle>` (or
    // `<scope>:<type>:<cycle>` for caseless rows). Reminder jobs retry
    // and double-fire; the key keeps one logical event to one row.
    dedupeKey: v.string(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_readAt", ["userId", "readAt"])
    .index("by_workspaceId_and_createdAt", ["workspaceId", "createdAt"])
    .index("by_dedupeKey", ["dedupeKey"]),
});
