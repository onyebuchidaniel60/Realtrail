import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import schema from "./schema";
import { requireUser } from "./lib/auth";
import { appError } from "./lib/errors";

function bounded(
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

function normalizedCode(code: string): string {
  const trimmed = code.trim().toUpperCase();
  if (trimmed.length > 20 || !/^[A-Z0-9]*$/.test(trimmed)) {
    appError(
      "VALIDATION_ERROR",
      "Building code must be up to 20 uppercase alphanumeric characters.",
      "code",
    );
  }
  return trimmed;
}

export const listByProperty = query({
  args: { propertyId: v.id("properties") },
  returns: v.array(schema.doc("buildings")),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const property = await ctx.db.get("properties", args.propertyId);
    if (property === null) {
      return [];
    }
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspaceId_and_userId", (q) =>
        q.eq("workspaceId", property.workspaceId).eq("userId", user._id),
      )
      .unique();
    if (membership === null) {
      return [];
    }
    const buildings = await ctx.db
      .query("buildings")
      .withIndex("by_propertyId", (q) => q.eq("propertyId", args.propertyId))
      .collect();
    buildings.sort((a, b) => a.name.localeCompare(b.name));
    return buildings;
  },
});

export const create = mutation({
  args: {
    propertyId: v.id("properties"),
    name: v.string(),
    code: v.optional(v.string()),
  },
  returns: v.object({ buildingId: v.id("buildings") }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const property = await ctx.db.get("properties", args.propertyId);
    if (property === null) {
      appError("NOT_FOUND", "Property not found.");
    }
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspaceId_and_userId", (q) =>
        q.eq("workspaceId", property.workspaceId).eq("userId", user._id),
      )
      .unique();
    if (membership === null) {
      appError("NOT_FOUND", "Property not found.");
    }
    const name = bounded(args.name, 1, 80, "name");
    const now = Date.now();
    const buildingId = await ctx.db.insert("buildings", {
      workspaceId: property.workspaceId,
      propertyId: property._id,
      name,
      code: args.code === undefined ? undefined : normalizedCode(args.code),
      createdAt: now,
      updatedAt: now,
    });
    return { buildingId };
  },
});

export const update = mutation({
  args: {
    buildingId: v.id("buildings"),
    name: v.optional(v.string()),
    code: v.optional(v.string()),
  },
  returns: v.object({ buildingId: v.id("buildings") }),
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
    const patch: {
      name?: string;
      code?: string;
      updatedAt: number;
    } = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      patch.name = bounded(args.name, 1, 80, "name");
    }
    if (args.code !== undefined) {
      patch.code = normalizedCode(args.code);
    }
    await ctx.db.patch("buildings", args.buildingId, patch);
    return { buildingId: args.buildingId };
  },
});
