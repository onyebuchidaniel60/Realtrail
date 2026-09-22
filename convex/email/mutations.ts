import { mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { requireUser } from "../lib/auth";
import { requireResourceWorkspaceMembership } from "../lib/authorization";
import { appError } from "../lib/errors";
import { EMAIL_PATTERN } from "../cases/mutations";

const MAX_SUBJECT_CHARS = 200;
const MAX_BODY_CHARS = 10000;
const MAX_INSTRUCTIONS_CHARS = 500;
// Cooldown between AI draft requests for the same case + recipient.
// Guard against double clicks, not a billing control.
const DRAFT_COOLDOWN_MS = 30_000;

function validatedSubject(subject: string): string {
  const trimmed = subject.trim();
  if (trimmed === "" || trimmed.length > MAX_SUBJECT_CHARS) {
    appError(
      "VALIDATION_ERROR",
      "Subject must be 1-200 characters.",
      "subject",
    );
  }
  return trimmed;
}

function validatedBody(textBody: string): string {
  const trimmed = textBody.trim();
  if (trimmed === "" || trimmed.length > MAX_BODY_CHARS) {
    appError(
      "VALIDATION_ERROR",
      "Message body must be 1-10000 characters.",
      "textBody",
    );
  }
  return trimmed;
}

function validatedEmail(email: string): string {
  const trimmed = email.trim();
  if (!EMAIL_PATTERN.test(trimmed)) {
    appError("VALIDATION_ERROR", "Invalid email address.", "recipientEmail");
  }
  return trimmed;
}

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

export const markThreadRead = mutation({  args: {
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

// Manual-draft path (Phase 8-A). The AI path (generateDraft) writes its
// own draft row; this mutation covers manager-typed or pasted drafts.
// Either way the row starts as status="draft" and nothing is sent until
// approveSend — drafting and sending are separate mutations by design.
export const createDraftRecord = mutation({
  args: {
    caseId: v.id("cases"),
    recipientType: v.union(v.literal("resident"), v.literal("vendor")),
    recipientEmail: v.string(),
    subject: v.string(),
    textBody: v.string(),
    aiDraftSource: v.boolean(),
  },
  returns: v.object({ communicationId: v.id("communications") }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const record = await ctx.db.get("cases", args.caseId);
    if (record === null) {
      appError("NOT_FOUND", "Case not found.");
    }
    // Existence-hiding: a case outside the caller's workspace reads as
    // NOT_FOUND, never FORBIDDEN (cases convention).
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspaceId_and_userId", (q) =>
        q.eq("workspaceId", record.workspaceId).eq("userId", user._id),
      )
      .unique();
    if (membership === null) {
      appError("NOT_FOUND", "Case not found.");
    }
    if (record.status === "CLOSED") {
      appError("VALIDATION_ERROR", "Cannot draft for a closed case.");
    }
    const recipientEmail = validatedEmail(args.recipientEmail);
    const subject = validatedSubject(args.subject);
    const textBody = validatedBody(args.textBody);
    const workspace = await ctx.db.get("workspaces", record.workspaceId);
    const inboxId = workspace?.agentMailInboxId;
    const inboxAddress = workspace?.agentMailInboxAddress;
    if (inboxId === undefined || inboxAddress === undefined) {
      appError("INTERNAL_ERROR", "Workspace has no AgentMail inbox.");
    }
    const now = Date.now();
    const communicationId = await ctx.db.insert("communications", {
      workspaceId: record.workspaceId,
      caseId: record._id,
      direction: "outbound",
      participantType: args.recipientType,
      agentMailInboxId: inboxId,
      agentMailThreadId: "",
      agentMailMessageId: undefined,
      status: "draft",
      fromEmail: inboxAddress,
      toEmails: [recipientEmail],
      subject,
      textBody,
      aiDraftSource: args.aiDraftSource,
      approvedBy: undefined,
      approvedAt: undefined,
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
      type: args.aiDraftSource ? "DRAFT_GENERATED" : "DRAFT_CREATED",
      actorType: "user",
      actorUserId: user._id,
      summary: `Draft created for ${recipientEmail}`,
      metadata: {
        communicationId,
        recipientType: args.recipientType,
        aiDraftSource: args.aiDraftSource,
      },
      createdAt: now,
    });
    return { communicationId };
  },
});

// Public trigger for AI drafting (Phase 8-C). generateDraft is an
// internal action, so the frontend cannot invoke it directly. This
// mutation validates intent (membership, closed-case, recipient shape,
// cooldown) and schedules the worker — no external API call inside,
// same mutation → schedule pattern as approveSend.
export const requestAiDraft = mutation({
  args: {
    caseId: v.id("cases"),
    recipientType: v.union(v.literal("vendor"), v.literal("resident")),
    recipientId: v.optional(v.id("vendors")),
    recipientEmail: v.optional(v.string()),
    instructions: v.optional(v.string()),
  },
  returns: v.object({ scheduled: v.literal(true) }),
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
    if (record.status === "CLOSED") {
      appError("CONFLICT", "Cannot draft for a closed case.");
    }
    // Recipient consistency mirrors generateDraft's server-side
    // derivation: vendors resolve by id, residents by validated email.
    let expectedEmail: string | undefined;
    if (args.recipientType === "vendor") {
      if (args.recipientId === undefined) {
        appError(
          "VALIDATION_ERROR",
          "Vendor recipient requires a vendor id.",
          "recipientId",
        );
      }
      const vendor = await ctx.db.get("vendors", args.recipientId);
      if (vendor === null || vendor.workspaceId !== record.workspaceId) {
        appError("NOT_FOUND", "Vendor not found.");
      }
      expectedEmail = vendor.email;
    } else {
      if (
        args.recipientEmail === undefined ||
        !EMAIL_PATTERN.test(args.recipientEmail.trim())
      ) {
        appError(
          "VALIDATION_ERROR",
          "Resident recipient requires a valid email address.",
          "recipientEmail",
        );
      }
      expectedEmail = args.recipientEmail.trim();
    }
    if (
      args.instructions !== undefined &&
      args.instructions.length > MAX_INSTRUCTIONS_CHARS
    ) {
      appError(
        "VALIDATION_ERROR",
        "Manager instructions must be at most 500 characters.",
        "instructions",
      );
    }
    // Cooldown: one AI draft per case + recipient per 30 seconds. Double
    // clicks and impatient retries observe the fresh draft row and get
    // RATE_LIMITED instead of scheduling duplicate model calls.
    const now = Date.now();
    const recent = await ctx.db
      .query("communications")
      .withIndex("by_caseId", (q) => q.eq("caseId", record._id))
      .order("desc")
      .take(20);
    const fresh = recent.some(
      (row) =>
        row.status === "draft" &&
        row.aiDraftSource === true &&
        row.participantType === args.recipientType &&
        row.createdAt > now - DRAFT_COOLDOWN_MS &&
        (expectedEmail === undefined ||
          row.toEmails.includes(expectedEmail)),
    );
    if (fresh) {
      appError(
        "RATE_LIMITED",
        "A draft was just requested. Wait a few seconds and retry.",
      );
    }
    await ctx.scheduler.runAfter(0, internal.email.draft.generateDraft, {
      caseId: args.caseId,
      recipientType: args.recipientType,
      recipientId: args.recipientId,
      recipientEmail: args.recipientEmail,
      instructions: args.instructions,
    });
    return { scheduled: true as const };
  },
});

// Human approval gate (Phase 8-A). The AI may draft; ONLY an
// authenticated workspace member running this mutation authorizes the
// send. It captures intent (draft → pending_send) and schedules the
// worker — no external API call happens inside this mutation (AGENTS.md
// §7). The status precondition is the double-send guard: the first
// approval flips draft → pending_send, so a second approval observes a
// non-draft row and fails CONFLICT instead of scheduling a second send.
export const approveSend = mutation({
  args: {
    communicationId: v.id("communications"),
    subject: v.optional(v.string()),
    textBody: v.optional(v.string()),
  },
  returns: v.object({
    communicationId: v.id("communications"),
    status: v.literal("pending_send"),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const comm = await ctx.db.get("communications", args.communicationId);
    if (comm === null) {
      appError("NOT_FOUND", "Communication not found.");
    }
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspaceId_and_userId", (q) =>
        q.eq("workspaceId", comm.workspaceId).eq("userId", user._id),
      )
      .unique();
    if (membership === null) {
      appError("NOT_FOUND", "Communication not found.");
    }
    if (comm.status !== "draft") {
      appError(
        "CONFLICT",
        "Only drafts can be approved for sending.",
      );
    }
    if (comm.direction !== "outbound") {
      appError("VALIDATION_ERROR", "Only outbound drafts can be sent.");
    }
    if (comm.caseId === undefined) {
      appError("VALIDATION_ERROR", "Draft is not linked to a case.");
    }
    const record = await ctx.db.get("cases", comm.caseId);
    if (record === null || record.workspaceId !== comm.workspaceId) {
      appError("NOT_FOUND", "Case not found.");
    }
    if (record.status === "CLOSED") {
      appError("VALIDATION_ERROR", "Cannot send for a closed case.");
    }
    const subject =
      args.subject !== undefined ? validatedSubject(args.subject) : comm.subject;
    const textBody =
      args.textBody !== undefined ? validatedBody(args.textBody) : comm.textBody;
    const now = Date.now();
    await ctx.db.patch("communications", comm._id, {
      status: "pending_send",
      approvedBy: user._id,
      approvedAt: now,
      updatedAt: now,
      subject,
      textBody,
    });
    await ctx.db.insert("caseActivities", {
      workspaceId: comm.workspaceId,
      caseId: record._id,
      type: "DRAFT_APPROVED",
      actorType: "user",
      actorUserId: user._id,
      summary: `Draft approved for sending to ${comm.toEmails[0] ?? "recipient"}`,
      metadata: { communicationId: comm._id },
      createdAt: now,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.email.sendPendingCommunication.sendPendingCommunication,
      { communicationId: comm._id },
    );
    return { communicationId: comm._id, status: "pending_send" as const };
  },
});
