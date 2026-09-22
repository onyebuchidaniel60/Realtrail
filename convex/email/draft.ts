import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";
import { EMAIL_PATTERN } from "../cases/mutations";
import { appError } from "../lib/errors";
import {
  draftMessage,
  type EmailDraft,
} from "../lib/providers/openai";

// AI draft generation (Phase 8-A).
//
// Authority rule: the AI DRAFTS, the manager APPROVES AND SENDS. This
// action never sends anything — it only persists a status="draft"
// communication row. Sending happens exclusively through
// communications.approveSend (human approval) followed by the
// sendPendingCommunication worker.
//
// Transactional shape mirrors triage.ts: the action loads context via an
// internal query, calls the provider, then persists via an internal
// mutation. A model failure therefore persists nothing (no partial
// state), and the mutation re-checks case state inside its transaction.

const MAX_PRIOR_MESSAGES = 5;
const MAX_INSTRUCTIONS_CHARS = 500;
const MAX_SUBJECT_CHARS = 200;
const MAX_BODY_CHARS = 10000;

const recipientTypeValidator = v.union(
  v.literal("vendor"),
  v.literal("resident"),
);

export const loadDraftContext = internalQuery({
  args: {
    caseId: v.id("cases"),
    recipientType: recipientTypeValidator,
    recipientId: v.optional(v.id("vendors")),
  },
  returns: v.union(
    v.null(),
    v.object({
      record: schema.doc("cases"),
      workspace: schema.doc("workspaces"),
      vendor: v.union(
        v.null(),
        v.object({
          id: v.id("vendors"),
          name: v.string(),
          email: v.optional(v.string()),
        }),
      ),
      propertyName: v.union(v.string(), v.null()),
      threadId: v.string(),
      priorMessages: v.array(
        v.object({
          direction: v.union(v.literal("inbound"), v.literal("outbound")),
          fromEmail: v.string(),
          subject: v.string(),
          textBody: v.string(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const record = await ctx.db.get("cases", args.caseId);
    if (record === null) {
      return null;
    }
    const workspace = await ctx.db.get("workspaces", record.workspaceId);
    if (workspace === null) {
      return null;
    }
    // Vendor recipient: resolve server-side. A missing or foreign
    // vendor reads as null here; the action maps that to NOT_FOUND
    // (existence-hiding — the caller never learns which).
    let vendor: {
      id: Id<"vendors">;
      name: string;
      email: string | undefined;
    } | null = null;
    if (args.recipientType === "vendor" && args.recipientId !== undefined) {
      const candidate = await ctx.db.get("vendors", args.recipientId);
      if (
        candidate !== null &&
        candidate.workspaceId === record.workspaceId
      ) {
        vendor = {
          id: candidate._id,
          name: candidate.name,
          email: candidate.email,
        };
      }
    }
    let propertyName: string | null = null;
    if (record.propertyId !== undefined) {
      const property = await ctx.db.get("properties", record.propertyId);
      if (property !== null && property.workspaceId === record.workspaceId) {
        propertyName = property.name;
      }
    }
    const recent = await ctx.db
      .query("communications")
      .withIndex("by_caseId", (q) => q.eq("caseId", record._id))
      .order("desc")
      .take(MAX_PRIOR_MESSAGES);
    // Thread continuity: the newest non-empty provider thread wins. A
    // draft starts threadless ("") and the send worker assigns the real
    // thread id from the provider response.
    const threaded = recent.find(
      (row) => row.agentMailThreadId !== "",
    );
    // Chronological order for the prompt: the model reads the thread as
    // a conversation, oldest first.
    const priorMessages = [...recent]
      .reverse()
      .map((row) => ({
        direction: row.direction,
        fromEmail: row.fromEmail,
        subject: row.subject,
        textBody: row.textBody,
      }));
    return {
      record,
      workspace,
      vendor,
      propertyName,
      threadId: threaded?.agentMailThreadId ?? "",
      priorMessages,
    };
  },
});

export const insertDraftCommunication = internalMutation({
  args: {
    caseId: v.id("cases"),
    recipientType: recipientTypeValidator,
    recipientEmail: v.string(),
    recipientName: v.string(),
    subject: v.string(),
    textBody: v.string(),
    threadId: v.string(),
  },
  returns: v.object({ communicationId: v.id("communications") }),
  handler: async (ctx, args) => {
    const record = await ctx.db.get("cases", args.caseId);
    if (record === null) {
      appError("NOT_FOUND", "Case not found.");
    }
    // Transactional re-check: the case may have closed between the
    // action's load and this commit. A draft for a closed case is never
    // persisted.
    if (record.status === "CLOSED") {
      appError("VALIDATION_ERROR", "Cannot draft for a closed case.");
    }
    const now = Date.now();
    const communicationId = await ctx.db.insert("communications", {
      workspaceId: record.workspaceId,
      caseId: record._id,
      direction: "outbound",
      participantType:
        args.recipientType === "vendor" ? "vendor" : "resident",
      agentMailInboxId: "",
      agentMailThreadId: args.threadId,
      agentMailMessageId: undefined,
      status: "draft",
      fromEmail: "",
      toEmails: [args.recipientEmail],
      subject: args.subject.slice(0, MAX_SUBJECT_CHARS),
      textBody: args.textBody.slice(0, MAX_BODY_CHARS),
      aiDraftSource: true,
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
      type: "DRAFT_GENERATED",
      actorType: "ai",
      actorUserId: undefined,
      summary: `AI draft created for ${args.recipientName}`,
      metadata: {
        communicationId,
        recipientType: args.recipientType,
        aiDraftSource: true,
      },
      createdAt: now,
    });
    return { communicationId };
  },
});

export const generateDraft = internalAction({
  // Internal-only: no caller identity exists in here, so workspace
  // membership CANNOT be enforced at this layer. The Phase 8-C public
  // wrapper must load the case and check membership (NOT_FOUND on
  // mismatch) BEFORE scheduling or calling this action. Vendor
  // references are still workspace-checked above (server-side
  // derivation), but the caseId itself is trusted from the internal
  // caller.
  args: {
    caseId: v.id("cases"),
    recipientType: recipientTypeValidator,
    recipientId: v.optional(v.id("vendors")),
    recipientEmail: v.optional(v.string()),
    instructions: v.optional(v.string()),
  },
  returns: v.object({ communicationId: v.id("communications") }),
  // Explicit handler return type: breaks the api.d.ts inference cycle for
  // same-file internal.* calls (same reason triageInbound annotates its
  // return — without this, generateDraft collapses to any).
  handler: async (
    ctx,
    args,
  ): Promise<{ communicationId: Id<"communications"> }> => {
    const context: {
      record: Doc<"cases">;
      workspace: Doc<"workspaces">;
      vendor: { id: Id<"vendors">; name: string; email: string | undefined } | null;
      propertyName: string | null;
      threadId: string;
      priorMessages: Array<{
        direction: "inbound" | "outbound";
        fromEmail: string;
        subject: string;
        textBody: string;
      }>;
    } | null = await ctx.runQuery(internal.email.draft.loadDraftContext, {
      caseId: args.caseId,
      recipientType: args.recipientType,
      recipientId: args.recipientId,
    });
    if (context === null) {
      appError("NOT_FOUND", "Case not found.");
    }
    if (context.record.status === "CLOSED") {
      appError("VALIDATION_ERROR", "Cannot draft for a closed case.");
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
    // Recipient is derived server-side, never trusted from the client as
    // an address: vendors resolve to their stored email, residents to a
    // validated address. Either way the address below comes from our own
    // records or a validated field — not from free-form client input.
    let recipientEmail: string;
    let recipientName: string;
    if (args.recipientType === "vendor") {
      if (args.recipientId === undefined) {
        appError(
          "VALIDATION_ERROR",
          "Vendor recipient requires a vendor id.",
          "recipientId",
        );
      }
      if (context.vendor === null) {
        appError("NOT_FOUND", "Vendor not found.");
      }
      if (
        context.vendor.email === undefined ||
        !EMAIL_PATTERN.test(context.vendor.email)
      ) {
        appError("VALIDATION_ERROR", "Vendor has no usable email address.");
      }
      recipientEmail = context.vendor.email;
      recipientName = context.vendor.name;
    } else {
      if (
        args.recipientEmail === undefined ||
        !EMAIL_PATTERN.test(args.recipientEmail)
      ) {
        appError(
          "VALIDATION_ERROR",
          "Resident recipient requires a valid email address.",
          "recipientEmail",
        );
      }
      recipientEmail = args.recipientEmail;
      recipientName = args.recipientEmail;
    }
    const inboxId = context.workspace.agentMailInboxId;
    const inboxAddress = context.workspace.agentMailInboxAddress;
    if (inboxId === undefined || inboxAddress === undefined) {
      appError("INTERNAL_ERROR", "Workspace has no AgentMail inbox.");
    }
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_DRAFT_MODEL;
    if (!apiKey || !model) {
      appError(
        "PROVIDER_ERROR",
        "Email drafting is not configured.",
        undefined,
        false,
      );
    }
    let draft: EmailDraft;
    try {
      draft = await draftMessage({
        apiKey,
        model,
        input: {
          caseTitle: context.record.title,
          caseDescription: context.record.description,
          caseCategory: context.record.category,
          casePriority: context.record.priority,
          propertyName: context.propertyName ?? undefined,
          recipientType: args.recipientType,
          recipientName,
          managerInstructions: args.instructions,
          priorMessages: context.priorMessages,
        },
      });
    } catch (error) {
      // No partial state: nothing has been written yet, so any provider
      // or model error propagates with its code and persists nothing.
      throw error;
    }
    const { communicationId } = await ctx.runMutation(
      internal.email.draft.insertDraftCommunication,
      {
        caseId: args.caseId,
        recipientType: args.recipientType,
        recipientEmail,
        recipientName,
        subject: draft.subject,
        textBody: draft.textBody,
        threadId: context.threadId,
      },
    );
    // Stamp the workspace inbox identity on the draft. The insert runs
    // without it because the mutation is workspace-agnostic by design;
    // the orchestrating action owns addressing.
    await ctx.runMutation(internal.email.draft.addressDraft, {
      communicationId,
      agentMailInboxId: inboxId,
      fromEmail: inboxAddress,
    });
    return { communicationId };
  },
});

// Addressing is a separate mutation so insertDraftCommunication stays
// reusable by the manual-draft path shape (same row, different source).
// It runs immediately after insert inside the same action — a draft is
// never left unaddressed by a completed generateDraft run.
export const addressDraft = internalMutation({
  args: {
    communicationId: v.id("communications"),
    agentMailInboxId: v.string(),
    fromEmail: v.string(),
  },
  returns: v.object({ communicationId: v.id("communications") }),
  handler: async (ctx, args) => {
    const comm = await ctx.db.get("communications", args.communicationId);
    if (comm === null) {
      appError("NOT_FOUND", "Communication not found.");
    }
    if (comm.status !== "draft") {
      appError("CONFLICT", "Only drafts can be addressed.");
    }
    await ctx.db.patch("communications", comm._id, {
      agentMailInboxId: args.agentMailInboxId,
      fromEmail: args.fromEmail,
      updatedAt: Date.now(),
    });
    return { communicationId: comm._id };
  },
});
