import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import schema from "./schema";
import { requireUser } from "./lib/auth";
import { appError } from "./lib/errors";

const occupancyStatusValidator = v.union(
  v.literal("occupied"),
  v.literal("vacant"),
  v.literal("unknown"),
);

export const listByBuilding = query({
  args: { buildingId: v.id("buildings") },
  returns: v.array(schema.doc("units")),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const building = await ctx.db.get("buildings", args.buildingId);
    if (building === null) {
      return [];
    }
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspaceId_and_userId", (q) =>
        q.eq("workspaceId", building.workspaceId).eq("userId", user._id),
      )
      .unique();
    if (membership === null) {
      return [];
    }
    const units = await ctx.db
      .query("units")
      .withIndex("by_buildingId", (q) => q.eq("buildingId", args.buildingId))
      .collect();
    units.sort((a, b) => a.label.localeCompare(b.label));
    return units;
  },
});

export const create = mutation({
  args: {
    buildingId: v.id("buildings"),
    label: v.string(),
    occupancyStatus: occupancyStatusValidator,
  },
  returns: v.object({ unitId: v.id("units") }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const building = await ctx.db.get("buildings", args.buildingId);
    if (building === null) {
      appError("NOT_FOUND", "Building not found.");
    }
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspaceId_and_userId", (q) =>
        q.eq("workspaceId", building.workspaceId).eq("userId", user._id),
      )
      .unique();
    if (membership === null) {
      appError("NOT_FOUND", "Building not found.");
    }
    const label = args.label.trim();
    if (label.length < 1 || label.length > 40) {
      appError(
        "VALIDATION_ERROR",
        "Unit label must be 1..40 characters.",
        "label",
      );
    }
    const property = await ctx.db.get("properties", building.propertyId);
    if (property === null) {
      appError("NOT_FOUND", "Building has no property.");
    }
    const now = Date.now();
    const unitId = await ctx.db.insert("units", {
      workspaceId: building.workspaceId,
      propertyId: property._id,
      buildingId: building._id,
      label,
      occupancyStatus: args.occupancyStatus,
      createdAt: now,
      updatedAt: now,
    });
    return { unitId };
  },
});

export const update = mutation({
  args: {
    unitId: v.id("units"),
    label: v.optional(v.string()),
    occupancyStatus: v.optional(occupancyStatusValidator),
  },
  returns: v.object({ unitId: v.id("units") }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const unit = await ctx.db.get("units", args.unitId);
    if (unit === null) {
      appError("NOT_FOUND", "Unit not found.");
    }
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspaceId_and_userId", (q) =>
        q.eq("workspaceId", unit.workspaceId).eq("userId", user._id),
      )
      .unique();
    if (membership === null) {
      appError("NOT_FOUND", "Unit not found.");
    }
    const patch: {
      label?: string;
      occupancyStatus?: "occupied" | "vacant" | "unknown";
      updatedAt: number;
    } = { updatedAt: Date.now() };
    if (args.label !== undefined) {
      const label = args.label.trim();
      if (label.length < 1 || label.length > 40) {
        appError(
          "VALIDATION_ERROR",
          "Unit label must be 1..40 characters.",
          "label",
        );
      }
      patch.label = label;
    }
    if (args.occupancyStatus !== undefined) {
      patch.occupancyStatus = args.occupancyStatus;
    }
    await ctx.db.patch("units", args.unitId, patch);
    return { unitId: args.unitId };
  },
});
