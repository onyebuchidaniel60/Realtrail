import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireUser } from "../lib/auth";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const typeValidator = v.union(
  v.literal("vendor_followup"),
  v.literal("resident_confirmation"),
  v.literal("urgent_case"),
  v.literal("system_error"),
);

export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("notifications"),
      type: typeValidator,
      title: v.string(),
      body: v.string(),
      caseId: v.optional(v.id("cases")),
      readAt: v.optional(v.number()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Math.floor(args.limit ?? DEFAULT_LIMIT)),
    );
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(limit);
    return rows.map((row) => ({
      _id: row._id,
      type: row.type,
      title: row.title,
      body: row.body,
      caseId: row.caseId,
      readAt: row.readAt,
      createdAt: row.createdAt,
    }));
  },
});

export const unreadCount = query({
  args: {},
  returns: v.object({ count: v.number() }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    // User-scoped rows stay small in MVP, so a bounded scan with an
    // in-memory unread filter is acceptable (same approach as the inbox
    // unread count). Revisit with a counter table if real workspaces
    // grow past a few hundred notifications per user.
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_userId_and_readAt", (q) => q.eq("userId", user._id))
      .collect();
    return { count: rows.filter((row) => row.readAt === undefined).length };
  },
});
