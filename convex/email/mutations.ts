import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireUser } from "../lib/auth";
import { requireResourceWorkspaceMembership } from "../lib/authorization";
import { appError } from "../lib/errors";

export const linkToCase = mutation({
  args: {
    communicationId: v.id("communications"),
    caseId: v.id("cases"),
  },
  returns: v.object({ communicationId: v.id("communications") }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const comm = await ctx.db.get("communications", args.communicationId);
    if (comm === null) {
      appError("NOT_FOUND", "Communication not found.");
    }
    await requireResourceWorkspaceMembership(ctx, user._id, comm.workspaceId);
    const record = await ctx.db.get("cases", args.caseId);
    // Existence-hiding convention: a case outside the communication's
    // workspace reads as NOT_FOUND, never FORBIDDEN.
    if (record === null || record.workspaceId !== comm.workspaceId) {
      appError("NOT_FOUND", "Case not found.");
    }
    if (comm.direction !== "inbound") {
      appError(
        "VALIDATION_ERROR",
        "Only inbound communications can be linked to a case.",
      );
    }
    // Idempotency: already linked to this case — success, no duplicate
    // activity row.
    if (comm.caseId === args.caseId) {
      return { communicationId: comm._id };
    }
    const now = Date.now();
    await ctx.db.patch("communications", comm._id, {
      caseId: args.caseId,
      updatedAt: now,
    });
    await ctx.db.insert("caseActivities", {
      workspaceId: comm.workspaceId,
      caseId: record._id,
      type: "COMMUNICATION_LINKED",
      actorType: "user",
      actorUserId: user._id,
      summary: `${comm.subject} linked to case`,
      metadata: { communicationId: comm._id, fromEmail: comm.fromEmail },
      createdAt: now,
    });
    // The activity row above is the timeline record; lastActivityAt keeps
    // the case's ordering fresh alongside it.
    const casePatch: { lastActivityAt: number; lastInboundAt?: number } = {
      lastActivityAt: Math.max(record.lastActivityAt, now),
    };
    if (
      record.lastInboundAt === undefined ||
      comm.createdAt > record.lastInboundAt
    ) {
      casePatch.lastInboundAt = comm.createdAt;
    }
    await ctx.db.patch("cases", record._id, casePatch);
    return { communicationId: comm._id };
  },
});

export const markRead = mutation({
  args: {
    communicationId: v.id("communications"),
  },
  returns: v.object({ communicationId: v.id("communications") }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const comm = await ctx.db.get("communications", args.communicationId);
    if (comm === null) {
      appError("NOT_FOUND", "Communication not found.");
    }
    await requireResourceWorkspaceMembership(ctx, user._id, comm.workspaceId);
    // Read state is not operationally significant: no activity row, and an
    // already-read row is a no-op success.
    if (comm.readAt !== undefined) {
      return { communicationId: comm._id };
    }
    const now = Date.now();
    await ctx.db.patch("communications", comm._id, {
      readAt: now,
      updatedAt: now,
    });
    return { communicationId: comm._id };
  },
});

export const markThreadRead = mutation({
  args: {
    threadId: v.string(),
  },
  returns: v.object({ updated: v.number() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    if (memberships.length === 0) {
      return { updated: 0 };
    }
    memberships.sort((a, b) => b.updatedAt - a.updatedAt);
    const workspaceId = memberships[0].workspaceId;
    const rows = await ctx.db
      .query("communications")
      .withIndex("by_agentMailThreadId", (q) =>
        q.eq("agentMailThreadId", args.threadId),
      )
      .collect();
    const now = Date.now();
    let updated = 0;
    for (const row of rows) {
      // Same defense as getThread: the thread index is cross-workspace,
      // so only touch the caller's workspace rows.
      if (row.workspaceId !== workspaceId) {
        continue;
      }
      if (row.readAt !== undefined) {
        continue;
      }
      await ctx.db.patch("communications", row._id, {
        readAt: now,
        updatedAt: now,
      });
      updated += 1;
    }
    return { updated };
  },
});
