import { query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { requireUser } from "../lib/auth";
import { appError } from "../lib/errors";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const PREVIEW_CHARS = 120;
// Bound for the workspace-scoped unreadCount scan below. Workspaces past
// this many communications undercount; a counter table needs explicit
// approval and is out of scope.
const UNREAD_COUNT_LIMIT = 1000;

const directionValidator = v.union(
  v.literal("inbound"),
  v.literal("outbound"),
);

const participantTypeValidator = v.union(
  v.literal("resident"),
  v.literal("vendor"),
  v.literal("other"),
);

const statusValidator = v.union(
  v.literal("received"),
  v.literal("draft"),
  v.literal("pending_send"),
  v.literal("sending"),
  v.literal("sent"),
  v.literal("failed"),
  v.literal("send_uncertain"),
);

async function callerWorkspaceId(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Id<"workspaces"> | null> {
  const memberships = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  if (memberships.length === 0) {
    return null;
  }
  memberships.sort((a, b) => b.updatedAt - a.updatedAt);
  return memberships[0].workspaceId;
}

function encodeCursor(createdAt: number, id: Id<"communications">): string {
  return `${createdAt}:${id}`;
}

function decodeCursor(cursor: string):
  | { createdAt: number; id: string }
  | undefined {
  const separator = cursor.lastIndexOf(":");
  if (separator < 0) {
    return undefined;
  }
  const createdAt = Number(cursor.slice(0, separator));
  const id = cursor.slice(separator + 1);
  if (!Number.isFinite(createdAt) || id.length === 0) {
    return undefined;
  }
  return { createdAt, id };
}

export const list = query({
  args: {
    filter: v.union(
      v.literal("all"),
      v.literal("residents"),
      v.literal("vendors"),
    ),
    cursor: v.optional(v.string()),
    pageSize: v.optional(v.number()),
  },
  returns: v.object({
    communications: v.array(
      v.object({
        _id: v.id("communications"),
        direction: directionValidator,
        subject: v.string(),
        fromEmail: v.string(),
        toEmails: v.array(v.string()),
        // Truncated textBody (first 120 chars) for list rendering. The
        // full body is only returned by a future conversation query.
        preview: v.string(),
        participantType: participantTypeValidator,
        caseId: v.optional(v.id("cases")),
        caseNumber: v.optional(v.number()),
        caseTitle: v.optional(v.string()),
        createdAt: v.number(),
        readAt: v.optional(v.number()),
        // Provider thread id: the conversation key the UI navigates by
        // (/inbox?threadId=...). Required so rows are selectable.
        threadId: v.string(),
      }),
    ),
    nextCursor: v.union(v.string(), v.null()),
    unreadCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const workspaceId = await callerWorkspaceId(ctx, user._id);
    if (workspaceId === null) {
      return { communications: [], nextCursor: null, unreadCount: 0 };
    }

    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(args.pageSize ?? DEFAULT_PAGE_SIZE)),
    );
    const participantType =
      args.filter === "residents"
        ? "resident"
        : args.filter === "vendors"
          ? "vendor"
          : undefined;

    let cursor: { createdAt: number; id: string } | undefined;
    if (args.cursor !== undefined) {
      cursor = decodeCursor(args.cursor);
      if (cursor === undefined) {
        appError("VALIDATION_ERROR", "Invalid pagination cursor.", "cursor");
      }
    }

    // Cursor resume is exact-row based ("createdAt:_id"): rows are skipped
    // until the cursor row itself is passed, so equal-createdAt rows can
    // never duplicate or drop a row across pages. If the cursor row is
    // gone, resume from strictly older rows.
    const rows = ctx.db
      .query("communications")
      .withIndex("by_workspaceId_and_createdAt", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .order("desc");
    const collected = [];
    let pastCursor = cursor === undefined;
    for await (const row of rows) {
      if (!pastCursor && cursor !== undefined) {
        if (
          row.createdAt === cursor.createdAt &&
          String(row._id) === cursor.id
        ) {
          pastCursor = true;
          continue;
        }
        if (row.createdAt < cursor.createdAt) {
          pastCursor = true;
        } else {
          continue;
        }
      }
      if (
        participantType !== undefined &&
        row.participantType !== participantType
      ) {
        continue;
      }
      collected.push(row);
      if (collected.length > pageSize) {
        break;
      }
    }
    const hasMore = collected.length > pageSize;
    const page = hasMore ? collected.slice(0, pageSize) : collected;

    // Denormalize linked-case references with one batched lookup map
    // instead of an N+1 chain inside the response mapping.
    const caseIds = [...new Set(page.map((row) => row.caseId))].filter(
      (caseId): caseId is Id<"cases"> => caseId !== undefined,
    );
    const caseById = new Map<
      Id<"cases">,
      { caseNumber: number; title: string }
    >();
    for (const caseId of caseIds) {
      const parent = await ctx.db.get("cases", caseId);
      if (parent !== null && parent.workspaceId === workspaceId) {
        caseById.set(caseId, {
          caseNumber: parent.caseNumber,
          title: parent.title,
        });
      }
    }

    const communications = page.map((row) => {
      const parent =
        row.caseId !== undefined ? caseById.get(row.caseId) : undefined;
      return {
        _id: row._id,
        direction: row.direction,
        subject: row.subject,
        fromEmail: row.fromEmail,
        toEmails: row.toEmails,
        preview: row.textBody.slice(0, PREVIEW_CHARS),
        participantType: row.participantType,
        caseId: row.caseId,
        caseNumber: parent?.caseNumber,
        caseTitle: parent?.title,
        createdAt: row.createdAt,
        readAt: row.readAt,
        threadId: row.agentMailThreadId,
      };
    });
    // Workspace-scoped unread count, independent of the pagination window
    // and the participant filter. Bounded single-index scan (see
    // UNREAD_COUNT_LIMIT); large workspaces may undercount.
    let unreadCount = 0;
    let scanned = 0;
    for await (const row of ctx.db
      .query("communications")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))) {
      if (scanned >= UNREAD_COUNT_LIMIT) {
        break;
      }
      scanned += 1;
      if (row.readAt === undefined) {
        unreadCount += 1;
      }
    }
    const last = page[page.length - 1];
    return {
      communications,
      nextCursor:
        hasMore && last !== undefined
          ? encodeCursor(last.createdAt, last._id)
          : null,
      unreadCount,
    };
  },
});

export const getThread = query({
  args: {
    threadId: v.string(),
  },
  returns: v.object({
    communications: v.array(
      v.object({
        _id: v.id("communications"),
        direction: directionValidator,
        fromEmail: v.string(),
        toEmails: v.array(v.string()),
        subject: v.string(),
        textBody: v.string(),
        status: statusValidator,
        participantType: participantTypeValidator,
        createdAt: v.number(),
        readAt: v.optional(v.number()),
      }),
    ),
    linkedCase: v.union(
      v.null(),
      v.object({
        _id: v.id("cases"),
        caseNumber: v.number(),
        title: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const workspaceId = await callerWorkspaceId(ctx, user._id);
    if (workspaceId === null) {
      return { communications: [], linkedCase: null };
    }
    const rows = await ctx.db
      .query("communications")
      .withIndex("by_agentMailThreadId", (q) =>
        q.eq("agentMailThreadId", args.threadId),
      )
      .collect();
    // Defense-in-depth: the thread index spans all workspaces. A thread
    // id is provider-scoped, so cross-workspace rows should not exist in
    // MVP — but if they ever do, only the caller's workspace rows leave
    // this query.
    const mine = rows
      .filter((row) => row.workspaceId === workspaceId)
      .sort(
        (a, b) => a.createdAt - b.createdAt || a._creationTime - b._creationTime,
      );
    let linkedCase: {
      _id: Id<"cases">;
      caseNumber: number;
      title: string;
    } | null = null;
    const linked = mine.find((row) => row.caseId !== undefined);
    if (linked !== undefined && linked.caseId !== undefined) {
      const parent = await ctx.db.get("cases", linked.caseId);
      if (parent !== null && parent.workspaceId === workspaceId) {
        linkedCase = {
          _id: parent._id,
          caseNumber: parent.caseNumber,
          title: parent.title,
        };
      }
    }
    return {
      communications: mine.map((row) => ({
        _id: row._id,
        direction: row.direction,
        fromEmail: row.fromEmail,
        toEmails: row.toEmails,
        subject: row.subject,
        textBody: row.textBody,
        status: row.status,
        participantType: row.participantType,
        createdAt: row.createdAt,
        readAt: row.readAt,
      })),
      linkedCase,
    };
  },
});

// Case-scoped communication history (Phase 8-A). Case Detail uses this
// in Phase 8-C to render drafts, pending sends, and sent mail alongside
// the timeline. Provider IDs are deliberately excluded: the UI needs
// operational state, never provider internals.
export const listByCase = query({
  args: {
    caseId: v.id("cases"),
  },
  returns: v.array(
    v.object({
      _id: v.id("communications"),
      direction: directionValidator,
      status: statusValidator,
      fromEmail: v.string(),
      toEmails: v.array(v.string()),
      subject: v.string(),
      textBody: v.string(),
      aiDraftSource: v.boolean(),
      approvedBy: v.optional(v.id("users")),
      approvedAt: v.optional(v.number()),
      createdAt: v.number(),
      readAt: v.optional(v.number()),
      lastError: v.optional(v.string()),
      participantType: participantTypeValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const record = await ctx.db.get("cases", args.caseId);
    if (record === null) {
      appError("NOT_FOUND", "Case not found.");
    }
    // Existence-hiding (cases convention): no membership reads as
    // NOT_FOUND, never FORBIDDEN.
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspaceId_and_userId", (q) =>
        q.eq("workspaceId", record.workspaceId).eq("userId", user._id),
      )
      .unique();
    if (membership === null) {
      appError("NOT_FOUND", "Case not found.");
    }
    const rows = await ctx.db
      .query("communications")
      .withIndex("by_caseId", (q) => q.eq("caseId", record._id))
      .collect();
    // Chronological: oldest first, creation-time tiebreak. A case's
    // communication history is bounded in MVP, so an in-memory sort of
    // the collected page is acceptable (same approach as getThread).
    rows.sort(
      (a, b) => a.createdAt - b.createdAt || a._creationTime - b._creationTime,
    );
    return rows.map((row) => ({
      _id: row._id,
      direction: row.direction,
      status: row.status,
      fromEmail: row.fromEmail,
      toEmails: row.toEmails,
      subject: row.subject,
      textBody: row.textBody,
      aiDraftSource: row.aiDraftSource,
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt,
      createdAt: row.createdAt,
      readAt: row.readAt,
      lastError: row.lastError,
      participantType: row.participantType,
    }));
  },
});
