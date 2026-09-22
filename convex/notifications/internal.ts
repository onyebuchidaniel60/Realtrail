import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { appError } from "../lib/errors";

// Server-side notification writes (Phase 10). All reminder actions
// funnel through createIfAbsent: the dedupeKey makes retries and
// double-fires idempotent at the storage layer, independent of whatever
// scheduling guarantees the caller had.

const notificationTypeValidator = v.union(
  v.literal("vendor_followup"),
  v.literal("resident_confirmation"),
  v.literal("urgent_case"),
  v.literal("system_error"),
);

const MAX_TITLE_CHARS = 200;
const MAX_BODY_CHARS = 500;
const MAX_DEDUPE_CHARS = 200;
// MVP assumes small teams. Recipient lists beyond this are truncated,
// never fanned out unbounded.
const MAX_RECIPIENTS = 5;

export const createIfAbsent = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    caseId: v.optional(v.id("cases")),
    type: notificationTypeValidator,
    title: v.string(),
    body: v.string(),
    dedupeKey: v.string(),
  },
  returns: v.object({
    created: v.boolean(),
    notificationId: v.id("notifications"),
  }),
  handler: async (ctx, args) => {
    const title = args.title.trim();
    const body = args.body.trim();
    if (title === "" || title.length > MAX_TITLE_CHARS) {
      appError("VALIDATION_ERROR", "Notification title must be 1-200 characters.");
    }
    if (body === "" || body.length > MAX_BODY_CHARS) {
      appError("VALIDATION_ERROR", "Notification body must be 1-500 characters.");
    }
    if (args.dedupeKey === "" || args.dedupeKey.length > MAX_DEDUPE_CHARS) {
      appError("VALIDATION_ERROR", "Dedupe key must be 1-200 characters.");
    }
    if (args.caseId !== undefined) {
      const record = await ctx.db.get("cases", args.caseId);
      if (record === null || record.workspaceId !== args.workspaceId) {
        appError("NOT_FOUND", "Case not found.");
      }
    }
    const existing = await ctx.db
      .query("notifications")
      .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", args.dedupeKey))
      .unique();
    if (existing !== null) {
      return { created: false, notificationId: existing._id };
    }
    const notificationId = await ctx.db.insert("notifications", {
      workspaceId: args.workspaceId,
      userId: args.userId,
      caseId: args.caseId,
      type: args.type,
      title,
      body,
      readAt: undefined,
      createdAt: Date.now(),
      dedupeKey: args.dedupeKey,
    });
    return { created: true, notificationId };
  },
});

// Owner + manager recipients for a workspace. Staff never receive
// operational reminders — they act on assigned cases, not on
// workspace-wide attention.
export const resolveRecipients = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
  },
  returns: v.array(v.id("users")),
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspaceId", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .collect();
    return memberships
      .filter((m) => m.role === "owner" || m.role === "manager")
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, MAX_RECIPIENTS)
      .map((m) => m.userId);
  },
});
