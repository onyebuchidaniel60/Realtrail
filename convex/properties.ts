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

export const list = query({
  args: {},
  returns: v.array(schema.doc("properties")),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    if (memberships.length === 0) {
      return [];
    }
    memberships.sort((a, b) => b.updatedAt - a.updatedAt);
    return await ctx.db
      .query("properties")
      .withIndex("by_workspaceId", (q) =>
        q.eq("workspaceId", memberships[0].workspaceId),
      )
      .collect();
  },
});

export const get = query({
  args: { propertyId: v.id("properties") },
  returns: v.union(v.null(), schema.doc("properties")),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const property = await ctx.db.get("properties", args.propertyId);
    if (property === null) {
      return null;
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
    return property;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    address: v.string(),
    city: v.optional(v.string()),
    country: v.optional(v.string()),
  },
  returns: v.object({ propertyId: v.id("properties") }),
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
    const workspace = await ctx.db.get(
      "workspaces",
      memberships[0].workspaceId,
    );
    if (workspace === null) {
      appError("FORBIDDEN", "User has no workspace.");
    }
    const name = bounded(args.name, 2, 100, "name");
    const address = bounded(args.address, 5, 240, "address");
    const now = Date.now();
    const propertyId = await ctx.db.insert("properties", {
      workspaceId: workspace._id,
      name,
      address,
      city:
        args.city === undefined ? undefined : bounded(args.city, 1, 80, "city"),
      country:
        args.country === undefined
          ? undefined
          : bounded(args.country, 1, 80, "country"),
      timezone: workspace.timezone,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    return { propertyId };
  },
});

export const update = mutation({
  args: {
    propertyId: v.id("properties"),
    name: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    country: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  returns: v.object({ propertyId: v.id("properties") }),
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
    const patch: {
      name?: string;
      address?: string;
      city?: string;
      country?: string;
      active?: boolean;
      updatedAt: number;
    } = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      patch.name = bounded(args.name, 2, 100, "name");
    }
    if (args.address !== undefined) {
      patch.address = bounded(args.address, 5, 240, "address");
    }
    if (args.city !== undefined) {
      patch.city = bounded(args.city, 1, 80, "city");
    }
    if (args.country !== undefined) {
      patch.country = bounded(args.country, 1, 80, "country");
    }
    if (args.active !== undefined) {
      patch.active = args.active;
    }
    await ctx.db.patch("properties", args.propertyId, patch);
    return { propertyId: args.propertyId };
  },
});
