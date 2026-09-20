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
});
