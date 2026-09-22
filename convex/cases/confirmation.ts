import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { requireUser } from "../lib/auth";
import { appError } from "../lib/errors";
import {
  buildConfirmationUrl,
  generateToken,
  hashToken,
} from "../lib/confirmationToken";
import { reminderDelays } from "../lib/reminders";
import { EMAIL_PATTERN } from "./mutations";
import { canTransition, type Role } from "./stateMachine";

// Resident confirmation (Phase 9-A). This module owns the
// WORK_IN_PROGRESS → AWAITING_CONFIRMATION → RESOLVED / WORK_IN_PROGRESS
// slice of the lifecycle. Vendor "completed" claims never touch it:
// only a signed resident decision (or an owner/manager override through
// the state machine) resolves a case.
//
// Public HTTP (/confirm) and UI arrive in 9-B / 9-C. This task covers
// the request + consume mutations only.

const FALLBACK_TTL_HOURS = 72;
const MS_PER_HOUR = 3600 * 1000;

function confirmationTtlHours(): number {
  const raw = process.env.REALTRAIL_CONFIRMATION_TOKEN_TTL_HOURS;
  const parsed = raw === undefined ? NaN : Number(raw);
  // Safe default: a missing, unparseable, or non-positive TTL falls back
  // to 72h rather than failing the request or minting an instant-expiry
  // token. Phase 10 reads the same variable for reminders.
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return FALLBACK_TTL_HOURS;
  }
  return parsed;
}

export const requestConfirmation = mutation({
  args: {
    caseId: v.id("cases"),
    recipientEmail: v.optional(v.string()),
  },
  returns: v.object({
    tokenId: v.id("confirmationTokens"),
    communicationId: v.id("communications"),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const record = await ctx.db.get("cases", args.caseId);
    if (record === null) {
      appError("NOT_FOUND", "Case not found.");
    }
    // Existence-hiding (cases convention): a case outside the caller's
    // workspace reads as NOT_FOUND, never FORBIDDEN.
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspaceId_and_userId", (q) =>
        q.eq("workspaceId", record.workspaceId).eq("userId", user._id),
      )
      .unique();
    if (membership === null) {
      appError("NOT_FOUND", "Case not found.");
    }
    if (record.status !== "WORK_IN_PROGRESS") {
      appError(
        "CONFLICT",
        "Confirmation can only be requested for work in progress.",
      );
    }
    // State machine is the authority, even though the from-state is
    // pinned above: if the matrix ever drops this edge, the request
    // fails instead of silently bypassing it.
    const allowed = canTransition(
      record.status,
      "AWAITING_CONFIRMATION",
      membership.role as Role,
    );
    if (!allowed.ok) {
      appError(allowed.code, allowed.message);
    }
    const recipient =
      args.recipientEmail !== undefined
        ? args.recipientEmail.trim()
        : (record.reporterEmail ?? "").trim();
    if (recipient === "") {
      appError(
        "VALIDATION_ERROR",
        "A recipient email is required to request confirmation.",
        "recipientEmail",
      );
    }
    if (!EMAIL_PATTERN.test(recipient)) {
      appError(
        "VALIDATION_ERROR",
        "Invalid recipient email address.",
        "recipientEmail",
      );
    }
    const workspace = await ctx.db.get("workspaces", record.workspaceId);
    const inboxId = workspace?.agentMailInboxId;
    const inboxAddress = workspace?.agentMailInboxAddress;
    if (inboxId === undefined || inboxAddress === undefined) {
      appError("INTERNAL_ERROR", "Workspace has no AgentMail inbox.");
    }
    const publicAppUrl = process.env.PUBLIC_APP_URL;
    if (!publicAppUrl) {
      appError("INTERNAL_ERROR", "Confirmation links are not configured.");
    }
    const now = Date.now();
    const ttlHours = confirmationTtlHours();
    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    let confirmationLink: string;
    try {
      confirmationLink = buildConfirmationUrl(publicAppUrl, rawToken);
    } catch {
      appError("INTERNAL_ERROR", "Confirmation links are misconfigured.");
    }
    // A re-request supersedes earlier ones: invalidate unused tokens so
    // an old-but-unexpired link can never resolve a case the resident
    // already declined on (or that moved on since).
    const prior = await ctx.db
      .query("confirmationTokens")
      .withIndex("by_case", (q) => q.eq("caseId", record._id))
      .collect();
    for (const token of prior) {
      if (
        token.workspaceId === record.workspaceId &&
        token.usedAt === undefined
      ) {
        await ctx.db.patch("confirmationTokens", token._id, {
          usedAt: now,
        });
      }
    }
    const tokenId = await ctx.db.insert("confirmationTokens", {
      workspaceId: record.workspaceId,
      caseId: record._id,
      tokenHash,
      decision: undefined,
      expiresAt: now + ttlHours * MS_PER_HOUR,
      usedAt: undefined,
      createdAt: now,
    });
    await ctx.db.patch("cases", record._id, {
      status: "AWAITING_CONFIRMATION",
      lastActivityAt: Math.max(record.lastActivityAt, now),
      updatedAt: now,
    });
    const communicationId = await ctx.db.insert("communications", {
      workspaceId: record.workspaceId,
      caseId: record._id,
      direction: "outbound",
      participantType: "resident",
      agentMailInboxId: inboxId,
      agentMailThreadId: "",
      agentMailMessageId: undefined,
      status: "pending_send",
      fromEmail: inboxAddress,
      toEmails: [recipient],
      subject: `Confirmation requested for case #${record.caseNumber}`,
      textBody: [
        `Hello,`,
        ``,
        `Work on your reported issue "${record.title}" is marked complete.`,
        `Please confirm whether the issue is actually resolved:`,
        ``,
        confirmationLink,
        ``,
        `This link expires in ${ttlHours} hours and can be used once.`,
        `If the issue is not resolved, use the "not resolved" option and we will reopen the work.`,
      ].join("\n"),
      aiDraftSource: false,
      approvedBy: user._id,
      approvedAt: now,
      providerDraftId: undefined,
      providerMessageId: undefined,
      lastError: undefined,
      readAt: undefined,
      sendAttempts: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("caseActivities", {
      workspaceId: record.workspaceId,
      caseId: record._id,
      type: "CONFIRMATION_REQUESTED",
      actorType: "user",
      actorUserId: user._id,
      summary: "Requested resident confirmation; reminder chain armed",
      metadata: { communicationId, tokenId, recipient },
      createdAt: now,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.email.sendPendingCommunication.sendPendingCommunication,
      { communicationId },
    );
    // Reminder chain (Phase 10): two nudges plus an escalation, all
    // notification-only. Resolution silences them implicitly — each
    // action re-checks case state and no-ops past AWAITING_CONFIRMATION.
    // Cadence is read here (env at schedule time); the actions re-read
    // env at fire time for their due checks.
    const delays = reminderDelays();
    await ctx.db.patch("cases", record._id, {
      residentReminderScheduledAt: now,
      notificationsScheduledAt: now,
    });
    await ctx.scheduler.runAfter(
      delays.residentReminderMs,
      internal.notifications.reminders.sendResidentReminder,
      { caseId: record._id, cycle: 1 },
    );
    await ctx.scheduler.runAfter(
      2 * delays.residentReminderMs,
      internal.notifications.reminders.sendResidentReminder,
      { caseId: record._id, cycle: 2 },
    );
    await ctx.scheduler.runAfter(
      delays.escalationMs,
      internal.notifications.reminders.sendResidentReminder,
      { caseId: record._id, cycle: 3 },
    );
    return { tokenId, communicationId };
  },
});


export const consumeConfirmation = internalMutation({
  args: {
    rawToken: v.string(),
    decision: v.union(v.literal("yes"), v.literal("no")),
  },
  returns: v.object({
    caseId: v.id("cases"),
    status: v.union(v.literal("RESOLVED"), v.literal("WORK_IN_PROGRESS")),
  }),
  handler: async (ctx, args) => {
    const tokenHash = hashToken(args.rawToken);
    const token = await ctx.db
      .query("confirmationTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    // No existence leakage: unknown and expired tokens share one code.
    if (token === null) {
      appError("TOKEN_EXPIRED", "This confirmation link is invalid.");
    }
    if (token.usedAt !== undefined) {
      appError("TOKEN_USED", "This confirmation link was already used.");
    }
    const now = Date.now();
    if (token.expiresAt < now) {
      appError("TOKEN_EXPIRED", "This confirmation link has expired.");
    }
    const record = await ctx.db.get("cases", token.caseId);
    if (record === null || record.workspaceId !== token.workspaceId) {
      appError("INTERNAL_ERROR", "Confirmation case is unavailable.");
    }
    if (record.status !== "AWAITING_CONFIRMATION") {
      appError(
        "CONFLICT",
        "This case is no longer awaiting confirmation.",
      );
    }
    // Pair validity comes from the state machine; authorization comes
    // from the token itself (the resident is unauthenticated). The
    // "owner" role stands in purely to validate the from→to pair —
    // residents are not members and carry no role.
    const nextStatus: "RESOLVED" | "WORK_IN_PROGRESS" =
      args.decision === "yes" ? "RESOLVED" : "WORK_IN_PROGRESS";
    const allowed = canTransition(record.status, nextStatus, "owner");
    if (!allowed.ok) {
      appError(allowed.code, allowed.message);
    }
    if (args.decision === "yes") {
      await ctx.db.patch("cases", record._id, {
        status: "RESOLVED",
        resolvedAt: now,
        resolvedBy: "resident",
        lastActivityAt: Math.max(record.lastActivityAt, now),
        updatedAt: now,
      });
    } else {
      await ctx.db.patch("cases", record._id, {
        status: "WORK_IN_PROGRESS",
        lastActivityAt: Math.max(record.lastActivityAt, now),
        updatedAt: now,
      });
    }
    await ctx.db.patch("confirmationTokens", token._id, {
      usedAt: now,
      decision: args.decision,
    });
    await ctx.db.insert("caseActivities", {
      workspaceId: record.workspaceId,
      caseId: record._id,
      type:
        args.decision === "yes"
          ? "CONFIRMATION_CONFIRMED"
          : "CONFIRMATION_DENIED",
      actorType: "resident",
      actorUserId: undefined,
      summary:
        args.decision === "yes"
          ? "Resident confirmed resolution"
          : "Resident reported issue not resolved",
      metadata: { tokenId: token._id },
      createdAt: now,
    });
    return { caseId: record._id, status: nextStatus };
  },
});

// Race safety (documented choice, ARCHITECTURE.md §30): two concurrent
// consumes of one token serialize on the token document inside Convex's
// transaction. The loser observes usedAt set by the winner and throws
// TOKEN_USED. No separate lock — the usedAt check inside the transaction
// IS the mutual exclusion.

export const getPendingConfirmation = internalQuery({
  args: {
    caseId: v.id("cases"),
  },
  returns: v.union(
    v.null(),
    v.object({
      tokenId: v.id("confirmationTokens"),
      requestedAt: v.number(),
      expiresAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const tokens = await ctx.db
      .query("confirmationTokens")
      .withIndex("by_case", (q) => q.eq("caseId", args.caseId))
      .collect();
    const now = Date.now();
    let latest: {
      tokenId: (typeof tokens)[number]["_id"];
      requestedAt: number;
      expiresAt: number;
    } | null = null;
    for (const token of tokens) {
      if (token.usedAt !== undefined || token.expiresAt <= now) {
        continue;
      }
      if (latest === null || token.createdAt > latest.requestedAt) {
        latest = {
          tokenId: token._id,
          requestedAt: token.createdAt,
          expiresAt: token.expiresAt,
        };
      }
    }
    // Never the raw token, never the hash — only the row id and times.
    return latest;
  },
});

// Manager-facing read projection (Phase 9-C). case.status stays
// authoritative; this only describes the token layer beneath it. No
// token material of any kind leaves this query.
export const getConfirmationState = query({
  args: {
    caseId: v.id("cases"),
  },
  returns: v.object({
    requested: v.boolean(),
    requestedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    lastDecision: v.optional(v.union(v.literal("yes"), v.literal("no"))),
    lastDecisionAt: v.optional(v.number()),
  }),
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
    // Inline scan (not a call into getPendingConfirmation): same-file
    // runQuery calls risk the api.d.ts inference cycle, and the rule is
    // six lines. Token rows per case are few; collect is bounded here.
    const tokens = await ctx.db
      .query("confirmationTokens")
      .withIndex("by_case", (q) => q.eq("caseId", record._id))
      .collect();
    const now = Date.now();
    let pending:
      | { requestedAt: number; expiresAt: number }
      | undefined;
    let decided:
      | {
          decision: "yes" | "no";
          decidedAt: number;
          createdAt: number;
        }
      | undefined;
    for (const token of tokens) {
      if (token.usedAt === undefined && token.expiresAt > now) {
        if (pending === undefined || token.createdAt > pending.requestedAt) {
          pending = {
            requestedAt: token.createdAt,
            expiresAt: token.expiresAt,
          };
        }
      }
      if (token.usedAt !== undefined && token.decision !== undefined) {
        if (
          decided === undefined ||
          token.usedAt > decided.decidedAt ||
          (token.usedAt === decided.decidedAt &&
            token.createdAt > decided.createdAt)
        ) {
          decided = {
            decision: token.decision,
            decidedAt: token.usedAt,
            createdAt: token.createdAt,
          };
        }
      }
    }
    return {
      requested: pending !== undefined,
      requestedAt: pending?.requestedAt,
      expiresAt: pending?.expiresAt,
      lastDecision: decided?.decision,
      lastDecisionAt: decided?.decidedAt,
    };
  },
});

