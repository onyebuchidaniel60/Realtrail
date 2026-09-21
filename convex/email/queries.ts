import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { requireUser } from "../lib/auth";
import { appError } from "../lib/errors";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const PREVIEW_CHARS = 120;

const directionValidator = v.union(
  v.literal("inbound"),
  v.literal("outbound"),
);

const participantTypeValidator = v.union(
  v.literal("resident"),
  v.literal("vendor"),
  v.literal("other"),
);

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
      }),
    ),
    nextCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    if (memberships.length === 0) {
      return { communications: [], nextCursor: null };
    }
    memberships.sort((a, b) => b.updatedAt - a.updatedAt);
    const workspaceId = memberships[0].workspaceId;

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
      };
    });
    const last = page[page.length - 1];
    return {
      communications,
      nextCursor:
        hasMore && last !== undefined
          ? encodeCursor(last.createdAt, last._id)
          : null,
    };
  },
});
