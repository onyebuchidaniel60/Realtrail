import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireUser } from "../lib/auth";
import { appError } from "../lib/errors";

// Hard cap for markAllRead's single-transaction sweep. Past this many
// unread rows the mutation stops and the remainder waits for the next
// call — add a batched/cursor implementation only if a real workspace
// exceeds it.
const MARK_ALL_CAP = 200;

export const markRead = mutation({
  args: {
    notificationId: v.id("notifications"),
  },
  returns: v.object({ notificationId: v.id("notifications") }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await ctx.db.get("notifications", args.notificationId);
    if (row === null) {
      appError("NOT_FOUND", "Notification not found.");
    }
    // Ownership check, not existence-hiding: notification rows are
    // addressed to one user, and a wrong-user access is a programming
    // error in our own UI, not a probeable resource.
    if (row.userId !== user._id) {
      appError("FORBIDDEN", "Notification belongs to another user.");
    }
    if (row.readAt === undefined) {
      await ctx.db.patch("notifications", row._id, { readAt: Date.now() });
    }
    return { notificationId: row._id };
  },
});

export const markAllRead = mutation({
  args: {},
  returns: v.object({ updated: v.number() }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    const now = Date.now();
    let updated = 0;
    for (const row of rows) {
      if (updated >= MARK_ALL_CAP) {
        break;
      }
      if (row.readAt === undefined) {
        await ctx.db.patch("notifications", row._id, { readAt: now });
        updated += 1;
      }
    }
    return { updated };
  },
});
