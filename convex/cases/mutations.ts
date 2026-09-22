import { mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { requireUser } from "../lib/auth";
import type { Role } from "../lib/authorization";
import { appError } from "../lib/errors";
import { allocateCaseNumber } from "./number";
import {
  canClose,
  canReopen,
  canTransition,
  type CaseStatus,
  type ClosureReason,
} from "./stateMachine";

const statusValidator = v.union(
  v.literal("NEW"),
  v.literal("TRIAGED"),
  v.literal("IN_PROGRESS"),
  v.literal("VENDOR_CONTACTED"),
  v.literal("SCHEDULED"),
  v.literal("WORK_IN_PROGRESS"),
  v.literal("AWAITING_CONFIRMATION"),
  v.literal("RESOLVED"),
  v.literal("CLOSED"),
);

export const priorityValidator = v.union(
  v.literal("LOW"),
  v.literal("MEDIUM"),
  v.literal("HIGH"),
  v.literal("URGENT"),
);

export const categoryValidator = v.union(
  v.literal("plumbing"),
  v.literal("electrical"),
  v.literal("power_generator"),
  v.literal("water"),
  v.literal("hvac"),
  v.literal("security_access"),
  v.literal("cleaning"),
  v.literal("structural"),
  v.literal("appliance"),
  v.literal("common_area"),
  v.literal("other"),
);

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function bounded(
  value: string,
  min: number,
  max: number,
  field: string,
): string {
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    appError(
      "VALIDATION_ERROR",
      `${field} must be ${min}..${max} characters.`,
      field,
    );
  }
  return trimmed;
}

export async function loadCaseForMember(
  ctx: MutationCtx,
  caseId: Id<"cases">,
  userId: Id<"users">,
): Promise<{ record: Doc<"cases">; role: Role }> {
  const record = await ctx.db.get("cases", caseId);
  if (record === null) {
    appError("NOT_FOUND", "Case not found.");
  }
  const membership = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspaceId_and_userId", (q) =>
      q.eq("workspaceId", record.workspaceId).eq("userId", userId),
    )
    .unique();
  if (membership === null) {
    appError("NOT_FOUND", "Case not found.");
  }
  return { record, role: membership.role as Role };
}

async function insertActivity(
  ctx: MutationCtx,
  record: Doc<"cases">,
  type: string,
  actorUserId: Id<"users"> | undefined,
  summary: string,
  metadata?: Record<string, unknown>,
): Promise<Id<"caseActivities">> {
  return await ctx.db.insert("caseActivities", {
    workspaceId: record.workspaceId,
    caseId: record._id,
    type,
    actorType: actorUserId === undefined ? "system" : "user",
    actorUserId,
    summary,
    metadata,
    createdAt: Date.now(),
  });
}

async function touchCase(ctx: MutationCtx, record: Doc<"cases">) {
  const now = Date.now();
  await ctx.db.patch("cases", record._id, {
    updatedAt: now,
    lastActivityAt: now,
  });
}

export const createManual = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    propertyId: v.optional(v.id("properties")),
    buildingId: v.optional(v.id("buildings")),
    unitId: v.optional(v.id("units")),
    category: categoryValidator,
    priority: priorityValidator,
    reporterName: v.optional(v.string()),
    reporterEmail: v.optional(v.string()),
    assigneeId: v.optional(v.id("users")),
    locationUnknown: v.optional(v.boolean()),
  },
  returns: v.object({
    caseId: v.id("cases"),
    caseNumber: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    if (memberships.length === 0) {
      appError("FORBIDDEN", "User has no workspace.");
    }
    memberships.sort((a, b) => b.updatedAt - a.updatedAt);
    const workspaceId = memberships[0].workspaceId;

    const title = bounded(args.title, 3, 120, "title");
    const description = bounded(args.description, 3, 10000, "description");

    let propertyId = args.propertyId;
    let buildingId = args.buildingId;
    const unitId = args.unitId;
    if (propertyId !== undefined) {
      const property = await ctx.db.get("properties", propertyId);
      if (property === null || property.workspaceId !== workspaceId) {
        appError("NOT_FOUND", "Property not found.", "propertyId");
      }
    }
    if (buildingId !== undefined) {
      const building = await ctx.db.get("buildings", buildingId);
      if (building === null || building.workspaceId !== workspaceId) {
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
      if (unit === null || unit.workspaceId !== workspaceId) {
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

    const assigneeId = args.assigneeId;
    if (assigneeId !== undefined) {
      const assigneeMembership = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspaceId_and_userId", (q) =>
          q.eq("workspaceId", workspaceId).eq("userId", assigneeId!),
        )
        .unique();
      if (assigneeMembership === null) {
        appError(
          "VALIDATION_ERROR",
          "Assignee must be a member of the workspace.",
          "assigneeId",
        );
      }
    }

    let reporterEmail = args.reporterEmail;
    if (reporterEmail !== undefined) {
      reporterEmail = reporterEmail.trim();
      if (!EMAIL_PATTERN.test(reporterEmail)) {
        appError(
          "VALIDATION_ERROR",
          "Reporter email is invalid.",
          "reporterEmail",
        );
      }
    }

    const now = Date.now();
    const caseNumber = await allocateCaseNumber(ctx, workspaceId);
    const caseId = await ctx.db.insert("cases", {
      workspaceId,
      caseNumber,
      title,
      description,
      status: "NEW",
      priority: args.priority,
      category: args.category,
      propertyId,
      buildingId,
      unitId,
      reporterName:
        args.reporterName === undefined
          ? undefined
          : bounded(args.reporterName, 1, 120, "reporterName"),
      reporterEmail,
      assigneeId,
      aiTriageStatus: "not_started",
      aiTriageVersion: undefined,
      aiTriageOutput: undefined,
      triageReviewedAt: undefined,
      triageReviewedBy: undefined,
      nextActionType: undefined,
      nextActionLabel: undefined,
      lastInboundAt: undefined,
      lastOutboundAt: undefined,
      lastActivityAt: now,
      reopenCount: 0,
      locationUnknown: args.locationUnknown ?? propertyId === undefined,
      closedReason: undefined,
      resolutionSummary: undefined,
      resolutionCostMinor: undefined,
      resolutionCompletedAt: undefined,
      resolvedAt: undefined,
      resolvedBy: undefined,
      closedAt: undefined,
      closedBy: undefined,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
    await insertActivity(
      ctx,
      (await ctx.db.get("cases", caseId))!,
      "CASE_CREATED",
      user._id,
      "Case created",
      { caseNumber },
    );
    return { caseId, caseNumber };
  },
});

export const updateFields = mutation({
  args: {
    caseId: v.id("cases"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(categoryValidator),
    priority: v.optional(priorityValidator),
    propertyId: v.optional(v.union(v.id("properties"), v.null())),
    buildingId: v.optional(v.union(v.id("buildings"), v.null())),
    unitId: v.optional(v.union(v.id("units"), v.null())),
    reporterName: v.optional(v.string()),
    reporterEmail: v.optional(v.string()),
    nextActionType: v.optional(v.string()),
    nextActionLabel: v.optional(v.string()),
  },
  returns: v.object({ caseId: v.id("cases") }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const { record, role } = await loadCaseForMember(ctx, args.caseId, user._id);
    if (record.status === "CLOSED") {
      appError("FORBIDDEN", "Closed cases cannot be edited.");
    }

    const changedFields: string[] = [];
    const patch: Record<string, unknown> = {};
    if (args.title !== undefined) {
      patch.title = bounded(args.title, 3, 120, "title");
      changedFields.push("title");
    }
    if (args.description !== undefined) {
      patch.description = bounded(args.description, 3, 10000, "description");
      changedFields.push("description");
    }
    if (args.category !== undefined) {
      patch.category = args.category;
      changedFields.push("category");
    }
    if (args.priority !== undefined) {
      if (
        record.priority === "URGENT" &&
        args.priority !== "URGENT" &&
        role === "staff"
      ) {
        appError("FORBIDDEN", "Staff cannot downgrade URGENT priority.");
      }
      patch.priority = args.priority;
      changedFields.push("priority");
    }

    let propertyId = record.propertyId;
    let buildingId = record.buildingId;
    let unitId = record.unitId;
    if (args.propertyId !== undefined) {
      propertyId = args.propertyId ?? undefined;
      if (propertyId !== undefined) {
        const property = await ctx.db.get("properties", propertyId);
        if (property === null || property.workspaceId !== record.workspaceId) {
          appError("NOT_FOUND", "Property not found.", "propertyId");
        }
      }
      changedFields.push("propertyId");
    }
    if (args.buildingId !== undefined) {
      buildingId = args.buildingId ?? undefined;
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
      }
      changedFields.push("buildingId");
    }
    if (args.unitId !== undefined) {
      unitId = args.unitId ?? undefined;
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
      }
      changedFields.push("unitId");
    }
    patch.propertyId = propertyId;
    patch.buildingId = buildingId;
    patch.unitId = unitId;

    if (args.reporterName !== undefined) {
      patch.reporterName = bounded(args.reporterName, 1, 120, "reporterName");
      changedFields.push("reporterName");
    }
    if (args.reporterEmail !== undefined) {
      const email = args.reporterEmail.trim();
      if (!EMAIL_PATTERN.test(email)) {
        appError(
          "VALIDATION_ERROR",
          "Reporter email is invalid.",
          "reporterEmail",
        );
      }
      patch.reporterEmail = email;
      changedFields.push("reporterEmail");
    }
    if (args.nextActionType !== undefined) {
      patch.nextActionType = bounded(args.nextActionType, 1, 120, "nextActionType");
      changedFields.push("nextActionType");
    }
    if (args.nextActionLabel !== undefined) {
      patch.nextActionLabel = bounded(
        args.nextActionLabel,
        1,
        240,
        "nextActionLabel",
      );
      changedFields.push("nextActionLabel");
    }

    const now = Date.now();
    await ctx.db.patch("cases", record._id, {
      ...patch,
      updatedAt: now,
      lastActivityAt: now,
    });
    await insertActivity(ctx, record, "FIELDS_UPDATED", user._id, "Case fields updated", {
      changedFields,
    });
    return { caseId: record._id };
  },
});

export const assign = mutation({
  args: {
    caseId: v.id("cases"),
    assigneeId: v.union(v.id("users"), v.null()),
  },
  returns: v.object({ caseId: v.id("cases") }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const { record, role } = await loadCaseForMember(ctx, args.caseId, user._id);

    if (args.assigneeId !== null) {
      const assigneeMembership = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspaceId_and_userId", (q) =>
          q.eq("workspaceId", record.workspaceId).eq("userId", args.assigneeId!),
        )
        .unique();
      if (assigneeMembership === null) {
        appError(
          "VALIDATION_ERROR",
          "Assignee must be a member of the workspace.",
          "assigneeId",
        );
      }
    }

    if (
      role === "staff" &&
      record.assigneeId !== undefined &&
      record.assigneeId !== null &&
      record.assigneeId !== user._id
    ) {
      appError("FORBIDDEN", "Staff cannot reassign a case owned by someone else.");
    }
    if (
      role === "staff" &&
      record.assigneeId !== undefined &&
      record.assigneeId !== null &&
      record.assigneeId === user._id &&
      args.assigneeId !== null &&
      args.assigneeId !== user._id
    ) {
      appError(
        "FORBIDDEN",
        "Staff can only release their own assignment, not reassign it.",
      );
    }

    const previousAssigneeId = record.assigneeId ?? null;
    const now = Date.now();
    await ctx.db.patch("cases", record._id, {
      assigneeId: args.assigneeId ?? undefined,
      updatedAt: now,
      lastActivityAt: now,
    });
    await insertActivity(ctx, record, "ASSIGNED", user._id, "Case assigned", {
      previousAssigneeId,
      newAssigneeId: args.assigneeId,
    });
    return { caseId: record._id };
  },
});

export const addNote = mutation({
  args: {
    caseId: v.id("cases"),
    body: v.string(),
  },
  returns: v.object({ activityId: v.id("caseActivities") }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const { record } = await loadCaseForMember(ctx, args.caseId, user._id);
    if (record.status === "CLOSED") {
      appError("FORBIDDEN", "Cannot add notes to a closed case.");
    }
    const body = args.body.trim();
    if (body.length < 1 || body.length > 5000) {
      appError(
        "VALIDATION_ERROR",
        "Note body must be 1..5000 characters.",
        "body",
      );
    }
    const activityId = await insertActivity(
      ctx,
      record,
      "NOTE_ADDED",
      user._id,
      body.length <= 80 ? body : body.slice(0, 80),
      { body },
    );
    await touchCase(ctx, record);
    return { activityId };
  },
});

export const transitionStatus = mutation({
  args: {
    caseId: v.id("cases"),
    nextStatus: statusValidator,
    note: v.optional(v.string()),
  },
  returns: v.object({
    caseId: v.id("cases"),
    status: statusValidator,
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const { record, role } = await loadCaseForMember(ctx, args.caseId, user._id);
    const nextStatus = args.nextStatus as CaseStatus;
    if (record.status === nextStatus) {
      appError(
        "CONFLICT",
        `Case is already ${nextStatus}.`,
      );
    }
    const check = canTransition(record.status, nextStatus, role);
    if (!check.ok) {
      appError(check.code, check.message);
    }
    if (nextStatus === "CLOSED" || nextStatus === "RESOLVED") {
      appError(
        "INVALID_TRANSITION",
        `${nextStatus} has a dedicated flow and cannot be set here.`,
      );
    }
    const now = Date.now();
    await ctx.db.patch("cases", record._id, {
      status: nextStatus,
      updatedAt: now,
      lastActivityAt: now,
    });
    await insertActivity(
      ctx,
      record,
      "STATUS_CHANGED",
      user._id,
      `Status changed from ${record.status} to ${nextStatus}`,
      { from: record.status, to: nextStatus, note: args.note },
    );
    return { caseId: record._id, status: nextStatus };
  },
});

export const close = mutation({
  args: {
    caseId: v.id("cases"),
    reason: v.union(
      v.literal("resolved"),
      v.literal("duplicate"),
      v.literal("invalid"),
      v.literal("cancelled"),
    ),
    note: v.optional(v.string()),
  },
  returns: v.object({
    caseId: v.id("cases"),
    status: v.literal("CLOSED"),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const { record, role } = await loadCaseForMember(ctx, args.caseId, user._id);
    const reason = args.reason as ClosureReason;
    const check = canClose(record.status, reason, role);
    if (!check.ok) {
      appError(check.code, check.message);
    }
    if (reason !== "resolved") {
      if (args.note === undefined || args.note.trim().length === 0) {
        appError(
          "VALIDATION_ERROR",
          "A note is required for non-resolution closure.",
          "note",
        );
      }
    }
    const now = Date.now();
    await ctx.db.patch("cases", record._id, {
      status: "CLOSED",
      closedReason: reason,
      closedAt: now,
      closedBy: user._id,
      updatedAt: now,
      lastActivityAt: now,
    });
    await insertActivity(ctx, record, "CLOSED", user._id, `Case closed as ${reason}`, {
      reason,
      note: args.note,
    });
    return { caseId: record._id, status: "CLOSED" as const };
  },
});

export const reopen = mutation({
  args: {
    caseId: v.id("cases"),
    reason: v.string(),
  },
  returns: v.object({
    caseId: v.id("cases"),
    status: v.literal("IN_PROGRESS"),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const { record, role } = await loadCaseForMember(ctx, args.caseId, user._id);
    const check = canReopen(record.status, role);
    if (!check.ok) {
      appError(check.code, check.message);
    }
    const reason = args.reason.trim();
    if (reason.length < 3 || reason.length > 500) {
      appError(
        "VALIDATION_ERROR",
        "Reopen reason must be 3..500 characters.",
        "reason",
      );
    }
    const now = Date.now();
    const reopenCount = record.reopenCount + 1;
    // Full-document replace: resolution and closure fields are dropped
    // entirely rather than patched to undefined.
    /* eslint-disable @typescript-eslint/no-unused-vars -- rest siblings dropped intentionally */
    const {
      _id,
      _creationTime,
      resolvedAt,
      resolvedBy,
      closedAt,
      closedBy,
      closedReason,
      resolutionSummary,
      resolutionCostMinor,
      resolutionCompletedAt,
      ...kept
    } = record;
    /* eslint-enable @typescript-eslint/no-unused-vars */
    await ctx.db.replace("cases", record._id, {
      ...kept,
      status: "IN_PROGRESS",
      reopenCount,
      updatedAt: now,
      lastActivityAt: now,
    });
    await insertActivity(ctx, record, "REOPENED", user._id, "Case reopened", {
      reason,
      reopenCount,
    });
    return { caseId: record._id, status: "IN_PROGRESS" as const };
  },
});

export const setVendor = mutation({
  args: {
    caseId: v.id("cases"),
    vendorId: v.union(v.id("vendors"), v.null()),
  },
  returns: v.object({ caseId: v.id("cases") }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const { record } = await loadCaseForMember(ctx, args.caseId, user._id);
    let vendorName: string | null = null;
    if (args.vendorId !== null) {
      const vendor = await ctx.db.get("vendors", args.vendorId);
      // Existence-hiding convention: a vendor outside the case's
      // workspace reads as NOT_FOUND, never FORBIDDEN.
      if (vendor === null || vendor.workspaceId !== record.workspaceId) {
        appError("NOT_FOUND", "Vendor not found.");
      }
      vendorName = vendor.name;
    }
    if (record.status === "CLOSED") {
      appError("FORBIDDEN", "Closed cases cannot change vendor.");
    }
    const now = Date.now();
    await ctx.db.patch("cases", record._id, {
      vendorId: args.vendorId ?? undefined,
      updatedAt: now,
      lastActivityAt: now,
    });
    await insertActivity(
      ctx,
      record,
      "VENDOR_SET",
      user._id,
      vendorName === null
        ? "Vendor unlinked from case"
        : `${vendorName} linked to case`,
      args.vendorId === null
        ? undefined
        : { vendorId: args.vendorId },
    );
    return { caseId: record._id };
  },
});
