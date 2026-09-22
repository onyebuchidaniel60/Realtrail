import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import schema from "../schema";
import {
  isUncertainSendError,
  sendMessage,
} from "../lib/providers/agentmail";

// Outbound send worker (Phase 8-A).
//
// Duplicate-send defense, in layers:
//   1. approveSend flips draft → pending_send exactly once (CONFLICT on
//      re-approval), so at most one worker run is ever scheduled per
//      approval.
//   2. This action claims the row pending_send → sending inside a
//      transaction (markSending). A second worker that slipped through
//      observes a non-pending row and returns "skipped".
//   3. Retries reuse the SAME Idempotency-Key (the communication id), so
//      even a provider-side duplicate delivery replays the original
//      message instead of sending twice.
//   4. Timeout/unknown outcomes NEVER auto-retry: they become
//      send_uncertain for a manager to resolve, because a blind retry is
//      how duplicate emails happen.
//
// Pattern mirrors triage.ts: load via internal query, provider call in
// the action, all persistence via internal mutations.

const MAX_SEND_ATTEMPTS = 3;
const SEND_RETRY_DELAY_MS = 60_000;

const sendResultValidator = v.object({
  status: v.union(
    v.literal("sent"),
    v.literal("skipped"),
    v.literal("retry_scheduled"),
    v.literal("failed"),
    v.literal("send_uncertain"),
    v.literal("missing"),
  ),
});

type SendStatus =
  | "sent"
  | "skipped"
  | "retry_scheduled"
  | "failed"
  | "send_uncertain"
  | "missing";

export const loadSendContext = internalQuery({
  args: {
    communicationId: v.id("communications"),
  },
  returns: v.union(
    v.null(),
    v.object({
      comm: schema.doc("communications"),
      record: v.union(v.null(), schema.doc("cases")),
    }),
  ),
  handler: async (ctx, args) => {
    const comm = await ctx.db.get("communications", args.communicationId);
    if (comm === null) {
      return null;
    }
    const record =
      comm.caseId !== undefined
        ? await ctx.db.get("cases", comm.caseId)
        : null;
    return { comm, record };
  },
});

// Transactional claim: only a pending_send row flips to sending. Returns
// false when another worker already claimed or finished the row — the
// action maps that to "skipped", never to an error.
export const markSending = internalMutation({
  args: {
    communicationId: v.id("communications"),
  },
  returns: v.object({ claimed: v.boolean() }),
  handler: async (ctx, args) => {
    const comm = await ctx.db.get("communications", args.communicationId);
    if (comm === null || comm.status !== "pending_send") {
      return { claimed: false };
    }
    await ctx.db.patch("communications", comm._id, {
      status: "sending",
      updatedAt: Date.now(),
    });
    return { claimed: true };
  },
});

export const finalizeSent = internalMutation({
  args: {
    communicationId: v.id("communications"),
    messageId: v.string(),
    threadId: v.string(),
  },
  returns: v.object({ status: v.literal("sent") }),
  handler: async (ctx, args) => {
    const comm = await ctx.db.get("communications", args.communicationId);
    if (comm === null) {
      // The row vanished mid-send (admin delete). Nothing to finalize;
      // the provider send already happened and cannot be unsent.
      return { status: "sent" as const };
    }
    const now = Date.now();
    await ctx.db.patch("communications", comm._id, {
      status: "sent",
      providerMessageId: args.messageId,
      agentMailMessageId: args.messageId,
      agentMailThreadId: args.threadId,
      lastError: undefined,
      updatedAt: now,
    });
    if (comm.caseId !== undefined) {
      const record = await ctx.db.get("cases", comm.caseId);
      if (record !== null && record.workspaceId === comm.workspaceId) {
        await ctx.db.insert("caseActivities", {
          workspaceId: comm.workspaceId,
          caseId: record._id,
          type: "EMAIL_SENT",
          actorType: "user",
          actorUserId: comm.approvedBy,
          summary: `Email sent to ${comm.toEmails[0] ?? "recipient"}`,
          metadata: {
            communicationId: comm._id,
            providerMessageId: args.messageId,
          },
          createdAt: now,
        });
        // Any successful outbound refreshes the case's outbound markers.
        // (Spec sketch checks vendor linkage; the row carries no vendor
        // id, so every linked outbound updates — simpler and strictly
        // more informative for the attention logic.)
        await ctx.db.patch("cases", record._id, {
          lastActivityAt: Math.max(record.lastActivityAt, now),
          lastOutboundAt: now,
        });
      }
    }
    return { status: "sent" as const };
  },
});

export const noteSendAttempt = internalMutation({
  args: {
    communicationId: v.id("communications"),
    // final=true skips the retry budget (config errors and 4xx
    // rejections will not heal by waiting 60s).
    final: v.optional(v.boolean()),
  },
  returns: v.object({
    status: v.union(
      v.literal("retry_scheduled"),
      v.literal("failed"),
    ),
    attempts: v.number(),
  }),
  handler: async (ctx, args) => {
    const comm = await ctx.db.get("communications", args.communicationId);
    if (comm === null) {
      return { status: "failed" as const, attempts: MAX_SEND_ATTEMPTS };
    }
    const attempts = (comm.sendAttempts ?? 0) + 1;
    const now = Date.now();
    if (args.final !== true && attempts < MAX_SEND_ATTEMPTS) {
      await ctx.db.patch("communications", comm._id, {
        sendAttempts: attempts,
        // Back to pending so the retry re-claims through the same
        // markSending gate — never straight to sending.
        status: "pending_send",
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(
        SEND_RETRY_DELAY_MS,
        internal.email.sendPendingCommunication.sendPendingCommunication,
        { communicationId: comm._id },
      );
      return { status: "retry_scheduled" as const, attempts };
    }
    await ctx.db.patch("communications", comm._id, {
      sendAttempts: attempts,
      status: "failed",
      // Fixed redacted message: provider error bodies must never leak
      // keys, addresses, or raw payloads into the database.
      lastError: "Email send failed.",
      updatedAt: now,
    });
    if (comm.caseId !== undefined) {
      const record = await ctx.db.get("cases", comm.caseId);
      if (record !== null && record.workspaceId === comm.workspaceId) {
        await ctx.db.insert("caseActivities", {
          workspaceId: comm.workspaceId,
          caseId: record._id,
          type: "EMAIL_SEND_FAILED",
          actorType: "system",
          actorUserId: undefined,
          summary: `Email to ${comm.toEmails[0] ?? "recipient"} failed to send`,
          metadata: { communicationId: comm._id, attempts },
          createdAt: now,
        });
      }
    }
    return { status: "failed" as const, attempts };
  },
});

export const noteUncertain = internalMutation({
  args: {
    communicationId: v.id("communications"),
  },
  returns: v.object({ status: v.literal("send_uncertain") }),
  handler: async (ctx, args) => {
    const comm = await ctx.db.get("communications", args.communicationId);
    if (comm === null) {
      return { status: "send_uncertain" as const };
    }
    const now = Date.now();
    await ctx.db.patch("communications", comm._id, {
      status: "send_uncertain",
      lastError: "Email send outcome unknown; manager review required.",
      updatedAt: now,
    });
    if (comm.caseId !== undefined) {
      const record = await ctx.db.get("cases", comm.caseId);
      if (record !== null && record.workspaceId === comm.workspaceId) {
        await ctx.db.insert("caseActivities", {
          workspaceId: comm.workspaceId,
          caseId: record._id,
          type: "EMAIL_SEND_UNCERTAIN",
          actorType: "system",
          actorUserId: undefined,
          summary: `Email to ${comm.toEmails[0] ?? "recipient"} may or may not have sent`,
          metadata: { communicationId: comm._id },
          createdAt: now,
        });
      }
    }
    return { status: "send_uncertain" as const };
  },
});

function isRetryableProviderError(error: unknown): boolean {
  if (!(error instanceof ConvexError)) {
    return false;
  }
  const data = error.data as { code?: unknown; retryable?: unknown } | undefined;
  return data?.code === "PROVIDER_ERROR" && data?.retryable === true;
}

export const sendPendingCommunication = internalAction({
  args: {
    communicationId: v.id("communications"),
  },
  returns: sendResultValidator,
  handler: async (ctx, args): Promise<{ status: SendStatus }> => {
    const context: {
      comm: Doc<"communications">;
      record: Doc<"cases"> | null;
    } | null = await ctx.runQuery(
      internal.email.sendPendingCommunication.loadSendContext,
      { communicationId: args.communicationId },
    );
    if (context === null) {
      return { status: "missing" };
    }
    // Idempotent entry: anything but pending_send means another worker
    // (or a retry that already finished) owns this row.
    if (context.comm.status !== "pending_send") {
      return { status: "skipped" };
    }
    // Same-file calls below rely on the handler's explicit return type
    // to break the api.d.ts inference cycle (same pattern as triage.ts).
    const { claimed } = await ctx.runMutation(
      internal.email.sendPendingCommunication.markSending,
      { communicationId: args.communicationId },
    );
    if (!claimed) {
      return { status: "skipped" };
    }
    const apiKey = process.env.AGENTMAIL_API_KEY;
    if (!apiKey) {
      const { status } = await ctx.runMutation(
        internal.email.sendPendingCommunication.noteSendAttempt,
        { communicationId: args.communicationId, final: true },
      );
      return { status };
    }
    try {
      const sent = await sendMessage({
        apiKey,
        inboxId: context.comm.agentMailInboxId,
        to: context.comm.toEmails,
        subject: context.comm.subject,
        textBody: context.comm.textBody,
        // Stable idempotency key: the same communication id on every
        // retry, so the provider replays instead of duplicating.
        clientId: context.comm._id,
      });
      const { status } = await ctx.runMutation(
        internal.email.sendPendingCommunication.finalizeSent,
        {
          communicationId: args.communicationId,
          messageId: sent.messageId,
          threadId: sent.threadId,
        },
      );
      return { status };
    } catch (error) {
      // Unknown outcome (timeout, unreadable 200, unexpected throw):
      // human review, never auto-retry.
      if (isUncertainSendError(error) || !(error instanceof ConvexError)) {
        const { status } = await ctx.runMutation(
          internal.email.sendPendingCommunication.noteUncertain,
          { communicationId: args.communicationId },
        );
        return { status };
      }
      const { status } = await ctx.runMutation(
        internal.email.sendPendingCommunication.noteSendAttempt,
        {
          communicationId: args.communicationId,
          // Non-retryable provider rejections (4xx) fail immediately.
          final: !isRetryableProviderError(error),
        },
      );
      return { status };
    }
  },
});
