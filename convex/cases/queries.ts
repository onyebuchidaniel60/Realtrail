import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { requireUser } from "../lib/auth";
import { appError } from "../lib/errors";
import type { Role } from "../lib/authorization";
import {
  canClose,
  canReopen,
  canTransition,
  type CaseStatus,
} from "./stateMachine";

const statusValidator = v.union(
  v.literal("NEW"),
  v.literal("TRIAGED"),
  v.literal("IN_PROGRESS"),
  v.literal("VENDOR_CONTACTED"),
  v.literal("SCHEDULED"),
  v.literal("WORK_IN_PROGRESS"),
  v.literal("AWAITING_CONFIRMATION"),
  v.literal("RESOLVED"),
  v.literal("CLOSED"),
);

const priorityValidator = v.union(
  v.literal("LOW"),
  v.literal("MEDIUM"),
  v.literal("HIGH"),
  v.literal("URGENT"),
);

const categoryValidator = v.union(
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
);

const ALL_STATUSES: CaseStatus[] = [
  "NEW",
  "TRIAGED",
  "IN_PROGRESS",
  "VENDOR_CONTACTED",
  "SCHEDULED",
  "WORK_IN_PROGRESS",
  "AWAITING_CONFIRMATION",
  "RESOLVED",
  "CLOSED",
];

// Statuses with dedicated flows; never offered via transitionStatus.
const RESERVED_STATUSES: CaseStatus[] = ["RESOLVED", "CLOSED"];

export const get = query({
  args: { caseId: v.id("cases") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const record = await ctx.db.get("cases", args.caseId);
    if (record === null) {
      appError("NOT_FOUND", "Case not found.");
    }
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspaceId_and_userId", (q) =>
        q.eq("workspaceId", record.workspaceId).eq("userId", user._id),
      )
      .unique();
    if (membership === null) {
      appError("NOT_FOUND", "Case not found.");
    }
    const role = membership.role as Role;
    const activities = await ctx.db
      .query("caseActivities")
      .withIndex("by_caseId", (q) => q.eq("caseId", record._id))
      .order("desc")
      .collect();

    const canTransitionTo = ALL_STATUSES.filter(
      (to) =>
        !RESERVED_STATUSES.includes(to) &&
        canTransition(record.status, to, role).ok,
    );
    return {
      case: record,
      activities,
      allowedActions: {
        canTransitionTo,
        canClose: {
          resolved: canClose(record.status, "resolved", role).ok,
          duplicate: canClose(record.status, "duplicate", role).ok,
          invalid: canClose(record.status, "invalid", role).ok,
          cancelled: canClose(record.status, "cancelled", role).ok,
        },
        canReopen: canReopen(record.status, role).ok,
        canAssign: true,
        canEdit: record.status !== "CLOSED",
      },
    };
  },
});

function encodeCursor(lastActivityAt: number, id: string): string {
  return `${lastActivityAt}:${id}`;
}

function decodeCursor(cursor: string): {
  lastActivityAt: number;
  id: string;
} | null {
  const sep = cursor.lastIndexOf(":");
  if (sep < 0) {
    return null;
  }
  const lastActivityAt = Number(cursor.slice(0, sep));
  const id = cursor.slice(sep + 1);
  if (!Number.isFinite(lastActivityAt) || id === "") {
    return null;
  }
  return { lastActivityAt, id };
}

export const list = query({
  args: {
    search: v.optional(v.string()),
    status: v.optional(statusValidator),
    priority: v.optional(priorityValidator),
    propertyId: v.optional(v.id("properties")),
    category: v.optional(categoryValidator),
    assigneeId: v.optional(v.id("users")),
    cursor: v.optional(v.string()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    if (memberships.length === 0) {
      return { cases: [], nextCursor: null };
    }
    memberships.sort((a, b) => b.updatedAt - a.updatedAt);
    const workspaceId = memberships[0].workspaceId;

    const pageSize = args.pageSize ?? 25;
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      appError(
        "VALIDATION_ERROR",
        "pageSize must be an integer between 1 and 100.",
        "pageSize",
      );
    }

    // Use the most selective single index available, then filter the rest
    // in memory. All reads stay inside the caller's workspace.
    let records: Doc<"cases">[];
    if (args.status !== undefined) {
      records = await ctx.db
        .query("cases")
        .withIndex("by_workspaceId_and_status", (q) =>
          q.eq("workspaceId", workspaceId).eq("status", args.status!),
        )
        .collect();
    } else if (args.priority !== undefined) {
      records = await ctx.db
        .query("cases")
        .withIndex("by_workspaceId_and_priority", (q) =>
          q.eq("workspaceId", workspaceId).eq("priority", args.priority!),
        )
        .collect();
    } else if (args.propertyId !== undefined) {
      records = await ctx.db
        .query("cases")
        .withIndex("by_workspaceId_and_propertyId", (q) =>
          q.eq("workspaceId", workspaceId).eq("propertyId", args.propertyId!),
        )
        .collect();
    } else if (args.assigneeId !== undefined) {
      records = await ctx.db
        .query("cases")
        .withIndex("by_workspaceId_and_assigneeId", (q) =>
          q.eq("workspaceId", workspaceId).eq("assigneeId", args.assigneeId!),
        )
        .collect();
    } else {
      records = await ctx.db
        .query("cases")
        .withIndex("by_workspaceId_and_lastActivityAt", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .order("desc")
        .collect();
    }

    const term = args.search?.trim().toLowerCase();
    const filtered = records.filter((record) => {
      if (args.status !== undefined && record.status !== args.status) {
        return false;
      }
      if (args.priority !== undefined && record.priority !== args.priority) {
        return false;
      }
      if (
        args.propertyId !== undefined &&
        record.propertyId !== args.propertyId
      ) {
        return false;
      }
      if (
        args.assigneeId !== undefined &&
        record.assigneeId !== args.assigneeId
      ) {
        return false;
      }
      if (args.category !== undefined && record.category !== args.category) {
        return false;
      }
      if (term) {
        const haystack =
          `${record.title}\n${record.description}`.toLowerCase();
        if (!haystack.includes(term)) {
          return false;
        }
      }
      return true;
    });

    filtered.sort(
      (a, b) =>
        b.lastActivityAt - a.lastActivityAt ||
        (a._id < b._id ? 1 : a._id > b._id ? -1 : 0),
    );

    let start = 0;
    if (args.cursor !== undefined) {
      const decoded = decodeCursor(args.cursor);
      if (decoded !== null) {
        const idx = filtered.findIndex(
          (record) =>
            record.lastActivityAt === decoded.lastActivityAt &&
            record._id === decoded.id,
        );
        start = idx === -1 ? 0 : idx + 1;
      }
    }
    const page = filtered.slice(start, start + pageSize);
    const nextCursor =
      start + pageSize < filtered.length
        ? encodeCursor(
            page[page.length - 1].lastActivityAt,
            page[page.length - 1]._id,
          )
        : null;
    return { cases: page, nextCursor };
  },
});
