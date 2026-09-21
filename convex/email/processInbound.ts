import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import schema from "../schema";
import { fetchMessage } from "../lib/providers/agentmail";

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 60_000;

const processingStatusValidator = v.union(
  v.literal("received"),
  v.literal("processing"),
  v.literal("processed"),
  v.literal("failed"),
);

export const recordInboundEvent = internalMutation({
  args: {
    providerEventId: v.string(),
    providerMessageId: v.optional(v.string()),
    providerInboxId: v.string(),
    eventType: v.string(),
    payloadHash: v.string(),
  },
  returns: v.object({
    eventId: v.id("inboundEvents"),
    wasDuplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    // Dedupe key is the provider event id. Convex mutations are
    // transactional: two concurrent webhook deliveries carrying the same
    // providerEventId serialize, and the second observes the first one's
    // insert — so at most one inboundEvents row ever exists per event.
    const existing = await ctx.db
      .query("inboundEvents")
      .withIndex("by_providerEventId", (q) =>
        q.eq("providerEventId", args.providerEventId),
      )
      .unique();
    if (existing !== null) {
      return { eventId: existing._id, wasDuplicate: true };
    }
    const eventId = await ctx.db.insert("inboundEvents", {
      provider: "agentmail",
      providerEventId: args.providerEventId,
      providerMessageId: args.providerMessageId,
      providerInboxId: args.providerInboxId,
      eventType: args.eventType,
      payloadHash: args.payloadHash,
      processingStatus: "received",
      attempts: 1,
      lastError: undefined,
      createdAt: Date.now(),
      processedAt: undefined,
    });
    return { eventId, wasDuplicate: false };
  },
});

export const setInboundStatus = internalMutation({
  args: {
    eventId: v.id("inboundEvents"),
    processingStatus: processingStatusValidator,
    attempts: v.optional(v.number()),
    lastError: v.optional(v.string()),
    processedAt: v.optional(v.number()),
  },
  returns: v.object({ eventId: v.id("inboundEvents") }),
  handler: async (ctx, args) => {
    const patch: {
      processingStatus: "received" | "processing" | "processed" | "failed";
      attempts?: number;
      lastError?: string;
      processedAt?: number;
    } = { processingStatus: args.processingStatus };
    if (args.attempts !== undefined) {
      patch.attempts = args.attempts;
    }
    if (args.lastError !== undefined) {
      patch.lastError = args.lastError;
    }
    if (args.processedAt !== undefined) {
      patch.processedAt = args.processedAt;
    }
    await ctx.db.patch("inboundEvents", args.eventId, patch);
    return { eventId: args.eventId };
  },
});

const processResultValidator = v.object({
  status: v.union(
    v.literal("processed"),
    v.literal("skipped"),
    v.literal("unknown_inbox"),
    v.literal("retry_scheduled"),
    v.literal("failed"),
    v.literal("missing"),
  ),
});

type ProcessStatus =
  | "processed"
  | "skipped"
  | "unknown_inbox"
  | "retry_scheduled"
  | "failed"
  | "missing";

export const processInboundEvent = internalAction({
  args: {
    eventId: v.id("inboundEvents"),
  },
  returns: processResultValidator,
  handler: async (ctx, args): Promise<{ status: ProcessStatus }> => {
    const event = await ctx.runQuery(internal.email.processInbound.readEvent, {
      eventId: args.eventId,
    });
    if (event === null) {
      return { status: "missing" };
    }
    // Idempotency: only "received" events need work. Anything else was
    // already handled (or is being handled) — return early.
    if (event.processingStatus !== "received") {
      return { status: "skipped" };
    }
    await ctx.runMutation(internal.email.processInbound.setInboundStatus, {
      eventId: args.eventId,
      processingStatus: "processing",
    });

    const fail = async (
      status: "unknown_inbox" | "retry_scheduled" | "failed",
      lastError: string,
      attempts: number,
      retry: boolean,
    ): Promise<{ status: ProcessStatus }> => {
      await ctx.runMutation(internal.email.processInbound.setInboundStatus, {
        eventId: args.eventId,
        processingStatus: retry ? "received" : "failed",
        attempts,
        lastError,
        ...(retry ? {} : { processedAt: Date.now() }),
      });
      if (retry) {
        await ctx.scheduler.runAfter(
          RETRY_DELAY_MS,
          internal.email.processInbound.processInboundEvent,
          { eventId: args.eventId },
        );
      }
      return { status };
    };

    // Route the event to its workspace via the AgentMail inbox id recorded
    // at provisioning time (Phase 5-B). Unknown inbox: fail permanently —
    // retrying cannot make an inbox appear.
    const workspace = await ctx.runQuery(
      internal.email.processInbound.findWorkspaceByInbox,
      { providerInboxId: event.providerInboxId },
    );
    if (workspace === null) {
      return fail("unknown_inbox", "Unknown AgentMail inbox.", event.attempts, false);
    }

    const apiKey = process.env.AGENTMAIL_API_KEY;
    const messageId = event.providerMessageId;
    if (!apiKey || !messageId) {
      // Missing configuration or no message to fetch: retry while attempts
      // remain (Phase 5-B may set the key between retries), then fail.
      if (event.attempts < MAX_ATTEMPTS) {
        return fail(
          "retry_scheduled",
          "AgentMail message fetch failed.",
          event.attempts + 1,
          true,
        );
      }
      return fail(
        "failed",
        "AgentMail message fetch failed.",
        event.attempts + 1,
        false,
      );
    }

    let message;
    try {
      message = await fetchMessage({
        apiKey,
        inboxId: event.providerInboxId,
        messageId,
      });
    } catch {
      // ARCHITECTURE.md §33: one logical retry budget of MAX_ATTEMPTS total
      // tries at 60s intervals, then failed permanently. The error is
      // deliberately redacted to a fixed string — provider errors must never
      // leak keys, headers, or raw payloads into the database.
      if (event.attempts < MAX_ATTEMPTS) {
        return fail(
          "retry_scheduled",
          "AgentMail message fetch failed.",
          event.attempts + 1,
          true,
        );
      }
      return fail(
        "failed",
        "AgentMail message fetch failed.",
        event.attempts + 1,
        false,
      );
    }

    const stored = await ctx.runMutation(
      internal.email.processInbound.storeCommunication,
      {
        eventId: args.eventId,
        workspaceId: workspace._id,
        agentMailInboxId: message.inboxId,
        agentMailThreadId: message.threadId,
        agentMailMessageId: message.messageId,
        fromEmail: message.from,
        toEmails: message.to,
        subject: message.subject,
        textBody: message.text,
        providerMessageId: message.messageId,
      },
    );
    void stored;
    return { status: "processed" };
  },
});

// Read helpers for the action above. Actions have no ctx.db, so all
// reads go through internal queries and all writes through internal
// mutations; each runs as its own transaction.

export const readEvent = internalQuery({
  args: {
    eventId: v.id("inboundEvents"),
  },
  returns: v.union(v.null(), schema.doc("inboundEvents")),
  handler: async (ctx, args) => {
    return await ctx.db.get("inboundEvents", args.eventId);
  },
});

export const findWorkspaceByInbox = internalQuery({
  args: {
    providerInboxId: v.string(),
  },
  returns: v.union(v.null(), schema.doc("workspaces")),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workspaces")
      .withIndex("by_agentMailInboxId", (q) =>
        q.eq("agentMailInboxId", args.providerInboxId),
      )
      .unique();
  },
});

export const storeCommunication = internalMutation({
  args: {
    eventId: v.id("inboundEvents"),
    workspaceId: v.id("workspaces"),
    agentMailInboxId: v.string(),
    agentMailThreadId: v.string(),
    agentMailMessageId: v.string(),
    fromEmail: v.string(),
    toEmails: v.array(v.string()),
    subject: v.string(),
    textBody: v.string(),
    providerMessageId: v.string(),
  },
  returns: v.object({
    communicationId: v.id("communications"),
    deduped: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    // Idempotency on the provider message id: a retried or redelivered
    // event carrying an already-stored message must not create a second
    // communications row. The lookup and the insert below run in one
    // transaction, so concurrent processors serialize here.
    const existing = await ctx.db
      .query("communications")
      .withIndex("by_agentMailMessageId", (q) =>
        q.eq("agentMailMessageId", args.agentMailMessageId),
      )
      .unique();
    if (existing !== null) {
      await ctx.db.patch("inboundEvents", args.eventId, {
        processingStatus: "processed",
        processedAt: now,
      });
      return { communicationId: existing._id, deduped: true };
    }
    const communicationId = await ctx.db.insert("communications", {
      workspaceId: args.workspaceId,
      caseId: undefined,
      direction: "inbound",
      // Classification into resident/vendor happens in Phase 5-C. Until
      // then every inbound row is "other".
      participantType: "other",
      agentMailInboxId: args.agentMailInboxId,
      agentMailThreadId: args.agentMailThreadId,
      agentMailMessageId: args.agentMailMessageId,
      status: "received",
      fromEmail: args.fromEmail,
      toEmails: args.toEmails,
      subject: args.subject,
      textBody: args.textBody,
      aiDraftSource: false,
      approvedBy: undefined,
      approvedAt: undefined,
      providerDraftId: undefined,
      providerMessageId: args.providerMessageId,
      lastError: undefined,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch("inboundEvents", args.eventId, {
      processingStatus: "processed",
      processedAt: now,
    });
    return { communicationId, deduped: false };
  },
});
