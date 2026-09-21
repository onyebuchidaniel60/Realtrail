import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireUser } from "../lib/auth";
import { appError } from "../lib/errors";
import {
  bounded,
  categoryValidator,
  loadCaseForMember,
  priorityValidator,
} from "./mutations";

// Manager review of AI triage (PROJECT_SPEC §4.4). The AI's original
// output (aiTriageOutput) is preserved for audit — this mutation never
// overwrites it. Cases leave NEW for TRIAGED only through here.
export const acceptAiTriage = mutation({
  args: {
    caseId: v.id("cases"),
    title: v.string(),
    summary: v.string(),
    category: categoryValidator,
    priority: priorityValidator,
    propertyId: v.union(v.id("properties"), v.null()),
    buildingId: v.union(v.id("buildings"), v.null()),
    unitId: v.union(v.id("units"), v.null()),
    nextActionType: v.union(v.string(), v.null()),
    nextActionLabel: v.union(v.string(), v.null()),
    locationUnknown: v.boolean(),
  },
  returns: v.object({
    caseId: v.id("cases"),
    status: v.literal("TRIAGED"),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const { record, role } = await loadCaseForMember(
      ctx,
      args.caseId,
      user._id,
    );
    if (record.status !== "NEW") {
      appError(
        "INVALID_TRANSITION",
        "Only NEW cases can accept AI triage.",
      );
    }
    if (record.aiTriageStatus !== "completed") {
      appError(
        "VALIDATION_ERROR",
        "Case has no completed AI triage to accept.",
      );
    }
    // Same URGENT rule as updateFields: staff cannot downgrade a
    // human-confirmed URGENT; the AI can never do it at all (it has no
    // path to this mutation).
    if (
      record.priority === "URGENT" &&
      args.priority !== "URGENT" &&
      role === "staff"
    ) {
      appError("FORBIDDEN", "Staff cannot downgrade URGENT priority.");
    }

    const title = bounded(args.title, 3, 120, "title");
    // summary is the human-approved description text. An empty summary
    // keeps the triage-created description: description is required, so
    // "clearing" cannot apply to it.
    const trimmedSummary = args.summary.trim();
    if (trimmedSummary.length > 2000) {
      appError("VALIDATION_ERROR", "summary must be 0..2000 characters.", "summary");
    }
    const description =
      trimmedSummary.length === 0
        ? record.description
        : bounded(args.summary, 3, 10000, "summary");

    // Location consistency mirrors createManual: a set location must
    // resolve inside this workspace, and SPEC §6.1 requires a property
    // after review unless explicitly unknown.
    let propertyId = args.propertyId ?? undefined;
    let buildingId = args.buildingId ?? undefined;
    const unitId = args.unitId ?? undefined;
    if (args.locationUnknown && propertyId !== undefined) {
      appError(
        "VALIDATION_ERROR",
        "Cannot set a property when location is marked unknown.",
      );
    }
    if (!args.locationUnknown && propertyId === undefined) {
      appError(
        "VALIDATION_ERROR",
        "Property is required unless location is marked unknown.",
      );
    }
    if (propertyId !== undefined) {
      const property = await ctx.db.get("properties", propertyId);
      if (property === null || property.workspaceId !== record.workspaceId) {
        appError("NOT_FOUND", "Property not found.", "propertyId");
      }
    }
    if (buildingId !== undefined) {
      const building = await ctx.db.get("buildings", buildingId);
      if (building === null || building.workspaceId !== record.workspaceId) {
        appError("NOT_FOUND", "Building not found.", "buildingId");
      }
      if (propertyId !== undefined && building.propertyId !== propertyId) {
        appError(
          "VALIDATION_ERROR",
          "Building does not belong to the selected property.",
          "buildingId",
        );
      }
      propertyId = building.propertyId;
    }
    if (unitId !== undefined) {
      const unit = await ctx.db.get("units", unitId);
      if (unit === null || unit.workspaceId !== record.workspaceId) {
        appError("NOT_FOUND", "Unit not found.", "unitId");
      }
      if (buildingId !== undefined && unit.buildingId !== buildingId) {
        appError(
          "VALIDATION_ERROR",
          "Unit does not belong to the selected building.",
          "unitId",
        );
      }
      buildingId = unit.buildingId;
      propertyId = unit.propertyId;
    }

    let nextActionType = args.nextActionType ?? undefined;
    if (nextActionType !== undefined) {
      nextActionType = bounded(nextActionType, 1, 100, "nextActionType");
    }
    let nextActionLabel = args.nextActionLabel ?? undefined;
    if (nextActionLabel !== undefined) {
      nextActionLabel = bounded(nextActionLabel, 1, 500, "nextActionLabel");
    }

    const now = Date.now();
    await ctx.db.patch("cases", record._id, {
      title,
      description,
      category: args.category,
      priority: args.priority,
      propertyId,
      buildingId,
      unitId,
      nextActionType,
      nextActionLabel,
      locationUnknown: args.locationUnknown,
      triageReviewedAt: now,
      triageReviewedBy: user._id,
      status: "TRIAGED",
      lastActivityAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("caseActivities", {
      workspaceId: record.workspaceId,
      caseId: record._id,
      type: "TRIAGE_REVIEWED",
      actorType: "user",
      actorUserId: user._id,
      summary: "AI triage reviewed and accepted",
      metadata: undefined,
      createdAt: now,
    });
    return { caseId: record._id, status: "TRIAGED" as const };
  },
});
