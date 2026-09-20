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
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),

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
});
