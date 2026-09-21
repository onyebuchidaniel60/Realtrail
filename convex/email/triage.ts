import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";
import { allocateCaseNumber } from "../cases/number";
import { EMAIL_PATTERN } from "../cases/mutations";
import { appError } from "../lib/errors";
import {
  triageMessage,
  type TriageSuggestion,
} from "../lib/providers/openai";

const TRIAGE_VERSION = "v1";
const MAX_TRIAGE_ATTEMPTS = 3;
const TRIAGE_RETRY_DELAY_MS = 60_000;
const MAX_PROPERTIES = 50;
const MAX_RECENT_CASES = 20;

const CATEGORIES = new Set([
  "plumbing",
  "electrical",
  "power_generator",
  "water",
  "hvac",
  "security_access",
  "cleaning",
  "structural",
  "appliance",
  "common_area",
  "other",
]);

const PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH", "URGENT"]);

// Failure model (documented choice): a triage failure NEVER blocks the
// communication — the inbox row stays fully usable. Failures consume the
// same 3-attempts/60s budget as the Phase 5 fetch pipeline, recorded on
// the communication (triageAttempts, triageFailedAt, redacted
// triageError). No case is created until triage succeeds.

export const loadTriageContext = internalQuery({
  args: {
    communicationId: v.id("communications"),
  },
  returns: v.union(
    v.null(),
    v.object({
      comm: schema.doc("communications"),
      workspace: schema.doc("workspaces"),
      properties: v.array(
        v.object({
          id: v.id("properties"),
          name: v.string(),
          address: v.string(),
        }),
      ),
      recentCases: v.array(
        v.object({ id: v.id("cases"), title: v.string() }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const comm = await ctx.db.get("communications", args.communicationId);
    if (comm === null) {
      return null;
    }
    const workspace = await ctx.db.get("workspaces", comm.workspaceId);
    if (workspace === null) {
      return null;
    }
    const properties = await ctx.db
      .query("properties")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", comm.workspaceId))
      .order("asc")
      .take(MAX_PROPERTIES);
    const recentCases = await ctx.db
      .query("cases")
      .withIndex("by_workspaceId_and_lastActivityAt", (q) =>
        q.eq("workspaceId", comm.workspaceId),
      )
      .order("desc")
      .take(MAX_RECENT_CASES);
    return {
      comm,
      workspace,
      properties: properties.map((p) => ({
        id: p._id,
        name: p.name,
        address: p.address,
      })),
      recentCases: recentCases.map((c) => ({ id: c._id, title: c.title })),
    };
  },
});

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function extractEmailAddress(fromEmail: string): string | undefined {
  const bracket = fromEmail.match(/<([^<>]+)>/);
  const candidate = (bracket ? bracket[1] : fromEmail).trim();
  return EMAIL_PATTERN.test(candidate) ? candidate : undefined;
}

export const createCaseFromTriage = internalMutation({
  args: {
    communicationId: v.id("communications"),
    suggestion: v.any(),
  },
  returns: v.object({
    caseId: v.id("cases"),
    caseNumber: v.number(),
  }),
  handler: async (ctx, args) => {
    const comm = await ctx.db.get("communications", args.communicationId);
    if (comm === null) {
      appError("NOT_FOUND", "Communication not found.");
    }
    // Marker re-check inside the transaction: a duplicate triage run that
    // slipped past the action-level check serializes here and reuses the
    // existing case instead of creating a second one.
    if (comm.triageCaseId !== undefined) {
      const existing = await ctx.db.get("cases", comm.triageCaseId);
      if (existing !== null) {
        return { caseId: existing._id, caseNumber: existing.caseNumber };
      }
    }
    if (typeof args.suggestion !== "object" || args.suggestion === null) {
      appError("AI_ERROR", "Triage suggestion failed validation.");
    }
    const suggestion = args.suggestion as TriageSuggestion;
    const workspaceId = comm.workspaceId;

    // safeGet: a malformed model ID must read as "no match" (dropped),
    // never as a thrown invalid-id error that would burn the retry
    // budget on an unretryable condition.
    async function safeGet<TableName extends "properties" | "buildings" | "units" | "cases">(
      table: TableName,
      id: string,
    ) {
      try {
        return await ctx.db.get(
          table,
          id as Id<TableName>,
        );
      } catch {
        return null;
      }
    }

    // Referential checks: every AI-selected ID must resolve to a real
    // record in this workspace. Anything else is dropped, never inserted.
    // Building is the most specific location evidence: when it resolves,
    // its property wins (Building.propertyId is the source of truth).
    let propertyId: Id<"properties"> | undefined;
    let buildingId: Id<"buildings"> | undefined;
    let unitId: Id<"units"> | undefined;
    if (suggestion.buildingCandidateId !== null) {
      const building = await safeGet(
        "buildings",
        suggestion.buildingCandidateId,
      );
      if (building !== null && building.workspaceId === workspaceId) {
        buildingId = building._id;
        propertyId = building.propertyId;
      }
    }
    if (suggestion.unitCandidateId !== null) {
      const unit = await safeGet("units", suggestion.unitCandidateId);
      if (
        unit !== null &&
        unit.workspaceId === workspaceId &&
        (buildingId === undefined || unit.buildingId === buildingId)
      ) {
        unitId = unit._id;
        buildingId = unit.buildingId;
        propertyId = unit.propertyId;
      }
    }
    if (propertyId === undefined && suggestion.propertyCandidateId !== null) {
      const property = await safeGet(
        "properties",
        suggestion.propertyCandidateId,
      );
      if (property !== null && property.workspaceId === workspaceId) {
        propertyId = property._id;
      }
    }
    const relatedCaseIds = [];
    for (const candidateId of suggestion.possibleRelatedCaseIds) {
      const candidate = await safeGet("cases", candidateId);
      if (candidate !== null && candidate.workspaceId === workspaceId) {
        relatedCaseIds.push(candidate._id);
      }
    }
    // possibleRelatedCaseIds are stored for review only — never auto-merged
    // (PROJECT_SPEC §6.5).
    const sanitized: TriageSuggestion = {
      ...suggestion,
      propertyCandidateId:
        propertyId !== undefined
          ? (propertyId as string)
          : null,
      buildingCandidateId:
        buildingId !== undefined ? (buildingId as string) : null,
      unitCandidateId: unitId !== undefined ? (unitId as string) : null,
      possibleRelatedCaseIds: relatedCaseIds.map((id) => id as string),
    };

    const category = CATEGORIES.has(suggestion.category)
      ? suggestion.category
      : "other";
    const priority = PRIORITIES.has(suggestion.prioritySuggestion)
      ? suggestion.prioritySuggestion
      : "MEDIUM";

    // Deterministic fallbacks keep triage total: an odd model title never
    // fails case creation — the manager reviews everything anyway.
    let title = suggestion.title.trim();
    if (title.length < 3) {
      title = comm.subject.trim();
    }
    if (title.length < 3) {
      title = "Untitled inbound report";
    }
    title = truncate(title, 120);
    let description = suggestion.summary.trim();
    if (description.length < 3) {
      description = comm.textBody.trim();
    }
    if (description.length < 3) {
      description = "No description provided.";
    }
    description = truncate(description, 10000);

    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    memberships.sort((a, b) => b.updatedAt - a.updatedAt);
    const owner = memberships.find((m) => m.role === "owner");
    const creator = owner ?? memberships[0];
    if (creator === undefined) {
      appError("INTERNAL_ERROR", "Workspace has no members to own the case.");
    }

    const now = Date.now();
    const caseNumber = await allocateCaseNumber(ctx, workspaceId);
    const caseId = await ctx.db.insert("cases", {
      workspaceId,
      caseNumber,
      title,
      description,
      status: "NEW",
      priority: priority as Doc<"cases">["priority"],
      category: category as Doc<"cases">["category"],
      propertyId,
      buildingId,
      unitId,
      reporterName: undefined,
      reporterEmail: extractEmailAddress(comm.fromEmail),
      assigneeId: undefined,
      aiTriageStatus: "completed",
      aiTriageVersion: TRIAGE_VERSION,
      aiTriageOutput: sanitized,
      triageReviewedAt: undefined,
      triageReviewedBy: undefined,
      nextActionType: undefined,
      nextActionLabel: truncate(suggestion.suggestedNextAction.trim(), 500),
      lastInboundAt: comm.createdAt,
      lastOutboundAt: undefined,
      lastActivityAt: now,
      reopenCount: 0,
      locationUnknown: propertyId === undefined,
      closedReason: undefined,
      resolutionSummary: undefined,
      resolutionCostMinor: undefined,
      resolutionCompletedAt: undefined,
      resolvedAt: undefined,
      resolvedBy: undefined,
      closedAt: undefined,
      closedBy: undefined,
      createdBy: creator.userId,
      createdAt: now,
      updatedAt: now,
    });
    const created = await ctx.db.get("cases", caseId);
    if (created === null) {
      appError("INTERNAL_ERROR", "Failed to read back the created case.");
    }
    await ctx.db.insert("caseActivities", {
      workspaceId,
      caseId,
      type: "AI_TRIAGE_COMPLETED",
      actorType: "ai",
      actorUserId: undefined,
      summary: "AI triaged inbound email",
      metadata: { communicationId: comm._id, suggestionVersion: TRIAGE_VERSION },
      createdAt: now,
    });
    await ctx.db.patch("communications", comm._id, {
      triagedAt: now,
      triageCaseId: caseId,
    });
    return { caseId, caseNumber };
  },
});

export const markTriageFailed = internalMutation({
  args: {
    communicationId: v.id("communications"),
  },
  returns: v.object({ attempts: v.number() }),
  handler: async (ctx, args) => {
    const comm = await ctx.db.get("communications", args.communicationId);
    if (comm === null) {
      appError("NOT_FOUND", "Communication not found.");
    }
    const attempts = (comm.triageAttempts ?? 0) + 1;
    await ctx.db.patch("communications", comm._id, {
      triageAttempts: attempts,
      triageFailedAt: Date.now(),
      // Fixed redacted message: provider/model errors must never leak
      // keys, prompts, or raw payloads into the database.
      triageError: "Triage failed.",
    });
    return { attempts };
  },
});

const triageResultValidator = v.object({
  status: v.union(
    v.literal("triaged"),
    v.literal("skipped"),
    v.literal("missing"),
    v.literal("exhausted"),
    v.literal("retry_scheduled"),
    v.literal("failed"),
  ),
});

type TriageStatus =
  | "triaged"
  | "skipped"
  | "missing"
  | "exhausted"
  | "retry_scheduled"
  | "failed";

export const triageInbound = internalAction({
  args: {
    communicationId: v.id("communications"),
  },
  returns: triageResultValidator,
  handler: async (ctx, args): Promise<{ status: TriageStatus }> => {
    const context: {
      comm: Doc<"communications">;
      workspace: Doc<"workspaces">;
      properties: Array<{ id: Id<"properties">; name: string; address: string }>;
      recentCases: Array<{ id: Id<"cases">; title: string }>;
    } | null = await ctx.runQuery(internal.email.triage.loadTriageContext, {
      communicationId: args.communicationId,
    });
    if (context === null) {
      return { status: "missing" };
    }
    const { comm } = context;
    // Idempotency: a triageCaseId means a previous run already created
    // the case (or is creating it inside its transaction).
    if (comm.triageCaseId !== undefined) {
      return { status: "skipped" };
    }
    if ((comm.triageAttempts ?? 0) >= MAX_TRIAGE_ATTEMPTS) {
      return { status: "exhausted" };
    }

    const fail = async (): Promise<{ status: TriageStatus }> => {
      const { attempts } = await ctx.runMutation(
        internal.email.triage.markTriageFailed,
        { communicationId: args.communicationId },
      );
      if (attempts >= MAX_TRIAGE_ATTEMPTS) {
        return { status: "failed" };
      }
      await ctx.scheduler.runAfter(
        TRIAGE_RETRY_DELAY_MS,
        internal.email.triage.triageInbound,
        { communicationId: args.communicationId },
      );
      return { status: "retry_scheduled" };
    };

    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_TRIAGE_MODEL;
    if (!apiKey || !model) {
      return fail();
    }
    let suggestion;
    try {
      suggestion = await triageMessage({
        apiKey,
        model,
        input: {
          subject: comm.subject,
          fromEmail: comm.fromEmail,
          textBody: comm.textBody,
          workspaceTimezone: context.workspace.timezone,
          propertyCandidates: context.properties.map((p) => ({
            id: p.id,
            name: p.name,
            address: p.address,
          })),
          recentCaseTitles: context.recentCases.map((c) => ({
            id: c.id,
            title: c.title,
          })),
        },
      });
    } catch {
      return fail();
    }
    try {
      await ctx.runMutation(internal.email.triage.createCaseFromTriage, {
        communicationId: args.communicationId,
        suggestion,
      });
    } catch {
      return fail();
    }
    return { status: "triaged" };
  },
});
