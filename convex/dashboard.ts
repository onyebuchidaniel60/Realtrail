import { query } from "./_generated/server";
import { v } from "convex/values";
import schema from "./schema";
import { requireUser } from "./lib/auth";
import { reminderDelays } from "./lib/reminders";

const ATTENTION_CAP = 10;
const UP_NEXT_CAP = 5;
const RECENT_ACTIVITY_CAP = 10;
// Bounded scan for failed/uncertain communications (same precedent as
// the inbox unread-count cap). Workspaces past this many rows may miss
// a trigger; the reminder actions remain the durable mechanism.
const BAD_COMMS_SCAN_LIMIT = 1000;

const PRIORITY_WEIGHT: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

// Sunday 00:00 in the given IANA timezone (US week convention), returned
// as a UTC epoch ms. Falls back to UTC when the timezone is invalid or
// unavailable.
export function startOfWorkspaceWeek(nowMs: number, timeZone: string): number {
  let tz = timeZone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    tz = "UTC";
  }
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(nowMs)).map((p) => [p.type, p.value]),
  );
  const weekdayIndex: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const daysSinceSunday = weekdayIndex[parts.weekday] ?? 0;
  const wallMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day) - daysSinceSunday,
    0,
    0,
    0,
  );
  // Convert the tz wall-clock reading back to a UTC instant. One
  // fixed-point iteration absorbs DST offset changes around the boundary.
  return wallToUtc(wallMs, tz);
}

function tzWallClock(ms: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  return Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? 0 : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
}

function wallToUtc(wallMs: number, timeZone: string): number {
  const first = wallMs - (tzWallClock(wallMs, timeZone) - wallMs);
  return first - (tzWallClock(first, timeZone) - first);
}

export const get = query({
  args: {
    // Reserved for the Phase 4-B date-range selector (SHOULD HAVE).
    // Current metrics are range-independent.
    range: v.optional(
      v.union(v.literal("today"), v.literal("week"), v.literal("month")),
    ),
  },
  returns: v.object({
    metrics: v.object({
      open: v.number(),
      urgent: v.number(),
      waitingOnVendor: v.number(),
      awaitingConfirmation: v.number(),
      resolvedThisWeek: v.number(),
    }),
    attention: v.array(schema.doc("cases")),
    operations: v.object({
      new: v.number(),
      triaged: v.number(),
      inProgress: v.number(),
      vendorContacted: v.number(),
      scheduled: v.number(),
      workInProgress: v.number(),
      awaitingConfirmation: v.number(),
      resolved: v.number(),
      closed: v.number(),
    }),
    upNext: v.array(schema.doc("cases")),
    recentActivity: v.array(
      v.object({
        _id: v.id("caseActivities"),
        caseId: v.id("cases"),
        caseNumber: v.number(),
        caseTitle: v.string(),
        type: v.string(),
        summary: v.string(),
        actorType: v.union(
          v.literal("user"),
          v.literal("system"),
          v.literal("ai"),
          v.literal("resident"),
          v.literal("vendor"),
        ),
        createdAt: v.number(),
      }),
    ),
    unreadNotifications: v.number(),
  }),
  handler: async (ctx, args) => {
    void args.range;
    const user = await requireUser(ctx);
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    const empty = {
      metrics: {
        open: 0,
        urgent: 0,
        waitingOnVendor: 0,
        awaitingConfirmation: 0,
        resolvedThisWeek: 0,
      },
      attention: [],
      operations: {
        new: 0,
        triaged: 0,
        inProgress: 0,
        vendorContacted: 0,
        scheduled: 0,
        workInProgress: 0,
        awaitingConfirmation: 0,
        resolved: 0,
        closed: 0,
      },
      upNext: [],
      recentActivity: [],
      unreadNotifications: 0,
    };
    if (memberships.length === 0) {
      return empty;
    }
    memberships.sort((a, b) => b.updatedAt - a.updatedAt);
    const workspaceId = memberships[0].workspaceId;
    const workspace = await ctx.db.get("workspaces", workspaceId);

    // Single workspace-scoped read; everything below derives in memory.
    // TODO: if a workspace ever exceeds ~500 cases, replace the operations
    // tabulation with per-status .count() calls on indexed queries.
    const records = await ctx.db
      .query("cases")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
      .collect();

    // Cases carrying a failed or uncertain communication (Phase 10).
    // One entry per case regardless of how many bad rows it has; the
    // scan is bounded (see BAD_COMMS_SCAN_LIMIT).
    const badCommsRows = await ctx.db
      .query("communications")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
      .take(BAD_COMMS_SCAN_LIMIT);
    const badCommsCaseIds = new Set(
      badCommsRows
        .filter(
          (row) =>
            row.caseId !== undefined &&
            (row.status === "failed" || row.status === "send_uncertain"),
        )
        .map((row) => row.caseId as string),
    );

    // Unread notification count for the calling user. Case-centric
    // attention below is untouched by this number.
    const userNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    const unreadNotifications = userNotifications.filter(
      (row) => row.readAt === undefined,
    ).length;

    const now = Date.now();
    const weekStart = startOfWorkspaceWeek(
      now,
      workspace?.timezone ?? "UTC",
    );

    const open = records.filter((c) => c.status !== "CLOSED");
    const metrics = {
      open: open.length,
      urgent: open.filter((c) => c.priority === "URGENT").length,
      waitingOnVendor: records.filter((c) => c.status === "VENDOR_CONTACTED")
        .length,
      awaitingConfirmation: records.filter(
        (c) => c.status === "AWAITING_CONFIRMATION",
      ).length,
      resolvedThisWeek: records.filter(
        (c) => c.resolvedAt !== undefined && c.resolvedAt >= weekStart,
      ).length,
    };

    // Thresholds are env-driven (Phase 10): read fresh on every call,
    // falling back to 4h/24h when unset.
    const delays = reminderDelays();
    const attention = records
      .filter((c) => {
        if (c.status === "CLOSED") {
          return false;
        }
        if (c.priority === "URGENT") {
          return true;
        }
        if (
          c.status === "VENDOR_CONTACTED" &&
          c.lastOutboundAt !== undefined &&
          now - c.lastOutboundAt >= delays.vendorFollowupMs
        ) {
          return true;
        }
        if (
          c.status === "AWAITING_CONFIRMATION" &&
          now - c.lastActivityAt >= delays.residentReminderMs
        ) {
          return true;
        }
        if (c.aiTriageStatus === "pending" && c.status === "NEW") {
          return true;
        }
        if (badCommsCaseIds.has(c._id)) {
          return true;
        }
        return false;
      })
      .sort(
        (a, b) =>
          PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority] ||
          a.lastActivityAt - b.lastActivityAt,
      )
      .slice(0, ATTENTION_CAP);

    const operations = {
      new: 0,
      triaged: 0,
      inProgress: 0,
      vendorContacted: 0,
      scheduled: 0,
      workInProgress: 0,
      awaitingConfirmation: 0,
      resolved: 0,
      closed: 0,
    };
    for (const record of records) {
      switch (record.status) {
        case "NEW":
          operations.new += 1;
          break;
        case "TRIAGED":
          operations.triaged += 1;
          break;
        case "IN_PROGRESS":
          operations.inProgress += 1;
          break;
        case "VENDOR_CONTACTED":
          operations.vendorContacted += 1;
          break;
        case "SCHEDULED":
          operations.scheduled += 1;
          break;
        case "WORK_IN_PROGRESS":
          operations.workInProgress += 1;
          break;
        case "AWAITING_CONFIRMATION":
          operations.awaitingConfirmation += 1;
          break;
        case "RESOLVED":
          operations.resolved += 1;
          break;
        case "CLOSED":
          operations.closed += 1;
          break;
      }
    }

    const upNext = [...open]
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
      .slice(0, UP_NEXT_CAP);

    const latestActivities = await ctx.db
      .query("caseActivities")
      .withIndex("by_workspaceId_and_createdAt", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .order("desc")
      .take(RECENT_ACTIVITY_CAP);
    const recentActivity = [];
    for (const activity of latestActivities) {
      const parent = await ctx.db.get("cases", activity.caseId);
      if (parent === null) {
        continue;
      }
      recentActivity.push({
        _id: activity._id,
        caseId: activity.caseId,
        caseNumber: parent.caseNumber,
        caseTitle: parent.title,
        type: activity.type,
        summary: activity.summary,
        actorType: activity.actorType,
        createdAt: activity.createdAt,
      });
    }

    return {
      metrics,
      attention,
      operations,
      upNext,
      recentActivity,
      unreadNotifications,
    };
  },
});
