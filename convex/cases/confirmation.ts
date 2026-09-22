import { internalMutation, mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { requireUser } from "../lib/auth";
import { appError } from "../lib/errors";
import {
  buildConfirmationUrl,
  generateToken,
  hashToken,
} from "../lib/confirmationToken";
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
      summary: "Requested resident confirmation",
      metadata: { communicationId, tokenId, recipient },
      createdAt: now,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.email.sendPendingCommunication.sendPendingCommunication,
      { communicationId },
    );
    return { tokenId, communicationId };
  },
});


