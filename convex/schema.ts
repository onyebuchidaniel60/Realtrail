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
});
