import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";
import { appError } from "../lib/errors";
import {
  buildDedupeKey,
  buildReminderNotification,
  isResidentReminderDue,
  isVendorFollowupDue,
  reminderDelays,
  type ReminderType,
} from "../lib/reminders";

// Reminder workers (Phase 10). Design decision: notifications, NEVER
// auto-sent emails (§6.11 forbids system-initiated external sends).
// Resident nudges point at the existing "Resend confirmation" UI path;
// vendor nudges are manager decisions. Both actions are idempotent
// (dedupeKey storage guard) and self-cancelling (live state re-check).

const cycleValidator = v.union(v.literal(1), v.literal(2), v.literal(3));

const sendResultValidator = v.object({
  created: v.number(),
  skipped: v.optional(v.string()),
});

type SendResult = { created: number; skipped?: string };

export const loadReminderCase = internalQuery({
  args: {
    caseId: v.id("cases"),
  },
  returns: v.union(v.null(), schema.doc("cases")),
  handler: async (ctx, args) => {
    return await ctx.db.get("cases", args.caseId);
  },
});

export const loadVendorContext = internalQuery({
  args: {
    caseId: v.id("cases"),
  },
  returns: v.union(
    v.null(),
    v.object({
      record: schema.doc("cases"),
      lastOutboundAt: v.union(v.number(), v.null()),
      lastInboundAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const record = await ctx.db.get("cases", args.caseId);
    if (record === null) {
      return null;
    }
    // Bounded scan: the most recent rows decide; older history cannot
    // change whether a reply arrived after the last outbound message…
    // in the common case. Workspaces with pathological thread lengths
    // may need a wider window (documented, not silently unbounded).
    const recent = await ctx.db
      .query("communications")
      .withIndex("by_caseId", (q) => q.eq("caseId", record._id))
      .order("desc")
      .take(25);
    let lastOutboundAt: number | null = null;
    let lastInboundAt: number | null = null;
    for (const row of recent) {
      if (
        row.direction === "outbound" &&
        row.participantType === "vendor" &&
        lastOutboundAt === null
      ) {
        lastOutboundAt = row.createdAt;
      }
      if (row.direction === "inbound" && lastInboundAt === null) {
        lastInboundAt = row.createdAt;
      }
      if (lastOutboundAt !== null && lastInboundAt !== null) {
        break;
      }
    }
    return { record, lastOutboundAt, lastInboundAt };
  },
});

export const noteReminderSent = internalMutation({
  args: {
    caseId: v.id("cases"),
    summary: v.string(),
  },
  returns: v.object({ activityId: v.id("caseActivities") }),
  handler: async (ctx, args) => {
    const record = await ctx.db.get("cases", args.caseId);
    if (record === null) {
      appError("NOT_FOUND", "Case not found.");
    }
    const activityId = await ctx.db.insert("caseActivities", {
      workspaceId: record.workspaceId,
      caseId: record._id,
      type: "REMINDER_SENT",
      actorType: "system",
      actorUserId: undefined,
      summary: args.summary,
      metadata: undefined,
      createdAt: Date.now(),
    });
    return { activityId };
  },
});

export const sendResidentReminder = internalAction({
  args: {
    caseId: v.id("cases"),
    cycle: cycleValidator,
  },
  returns: sendResultValidator,
  handler: async (ctx, args): Promise<SendResult> => {
    const record: Doc<"cases"> | null = await ctx.runQuery(
      internal.notifications.reminders.loadReminderCase,
      { caseId: args.caseId },
    );
    if (record === null) {
      return { created: 0, skipped: "missing" };
    }
    if (record.status !== "AWAITING_CONFIRMATION") {
      return { created: 0, skipped: "state_changed" };
    }
    const delays = reminderDelays();
    const now = Date.now();
    const requestedAt = record.residentReminderScheduledAt;
    const due =
      args.cycle === 3
        ? requestedAt !== undefined &&
          now - requestedAt >= delays.escalationMs
        : isResidentReminderDue(
            requestedAt,
            now,
            args.cycle,
            delays.residentReminderMs,
          );
    if (!due) {
      return { created: 0, skipped: "not_due" };
    }
    const type: ReminderType =
      args.cycle === 3 ? "urgent_case" : "resident_confirmation";
    const created = await fanOut(
      ctx,
      record,
      type,
      args.cycle,
    );
    if (created > 0) {
      await ctx.runMutation(
        internal.notifications.reminders.noteReminderSent,
        {
          caseId: record._id,
          summary:
            args.cycle === 3
              ? "Escalated: no resident confirmation"
              : `Resident confirmation reminder #${args.cycle}`,
        },
      );
    }
    return { created };
  },
});

export const sendVendorFollowUp = internalAction({
  args: {
    caseId: v.id("cases"),
  },
  returns: sendResultValidator,
  handler: async (ctx, args): Promise<SendResult> => {
    const context: {
      record: Doc<"cases">;
      lastOutboundAt: number | null;
      lastInboundAt: number | null;
    } | null = await ctx.runQuery(
      internal.notifications.reminders.loadVendorContext,
      { caseId: args.caseId },
    );
    if (context === null) {
      return { created: 0, skipped: "missing" };
    }
    if (context.record.status !== "VENDOR_CONTACTED") {
      return { created: 0, skipped: "state_changed" };
    }
    const delays = reminderDelays();
    if (
      !isVendorFollowupDue(
        context.lastOutboundAt ?? undefined,
        context.lastInboundAt ?? undefined,
        Date.now(),
        delays.vendorFollowupMs,
      )
    ) {
      return { created: 0, skipped: "not_due" };
    }
    const created = await fanOut(
      ctx,
      context.record,
      "vendor_followup",
      1,
    );
    if (created > 0) {
      await ctx.runMutation(
        internal.notifications.reminders.noteReminderSent,
        {
          caseId: context.record._id,
          summary: "Vendor follow-up due — no reply",
        },
      );
    }
    return { created };
  },
});

// Fan-out helper shared by both actions: resolves owner+manager
// recipients and writes one deduped notification each. Plain async
// function (not a Convex function): actions share it directly per the
// guidelines instead of chaining runAction calls.
async function fanOut(
  ctx: ActionCtx,
  record: Doc<"cases">,
  type: ReminderType,
  cycle: number,
): Promise<number> {
  const recipients: Array<Id<"users">> = await ctx.runQuery(
    internal.notifications.internal.resolveRecipients,
    { workspaceId: record.workspaceId },
  );
  const content = buildReminderNotification({
    caseNumber: record.caseNumber,
    caseTitle: record.title,
    type,
    cycle,
  });
  let created = 0;
  for (const userId of recipients) {
    const result: { created: boolean } = await ctx.runMutation(
      internal.notifications.internal.createIfAbsent,
      {
        workspaceId: record.workspaceId,
        userId,
        caseId: record._id,
        type,
        title: content.title,
        body: content.body,
        dedupeKey: buildDedupeKey(record._id, type, cycle),
      },
    );
    if (result.created) {
      created += 1;
    }
  }
  return created;
}
