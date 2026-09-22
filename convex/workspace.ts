import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import schema from "./schema";
import { requireUser } from "./lib/auth";
import { appError } from "./lib/errors";
import {
  validateCurrency,
  validateTimezone,
  validateWorkspaceName,
} from "./workspace/validation";

export const getCurrent = query({
  args: {},
  returns: v.object({
    workspace: v.union(v.null(), schema.doc("workspaces")),
    member: v.union(v.null(), schema.doc("workspaceMembers")),
    needsOnboarding: v.boolean(),
  }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    if (memberships.length === 0) {
      return { workspace: null, member: null, needsOnboarding: true };
    }
    memberships.sort((a, b) => b.updatedAt - a.updatedAt);
    const member = memberships[0];
    const workspace = await ctx.db.get("workspaces", member.workspaceId);
    return { workspace, member, needsOnboarding: false };
  },
});

export const create = mutation({
  args: {
    workspaceName: v.string(),
    timezone: v.string(),
    currency: v.string(),
    propertyName: v.string(),
    propertyAddress: v.string(),
  },
  returns: v.object({
    workspaceId: v.id("workspaces"),
    propertyId: v.id("properties"),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    // Shared validators (convex/workspace/validation.ts) — same rules as
    // before, now reused by settings.updateWorkspace.
    const name = validateWorkspaceName(args.workspaceName, "workspaceName");
    validateTimezone(args.timezone);
    const currency = validateCurrency(args.currency);

    const existing = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();
    if (existing !== null) {
      appError("CONFLICT", "User already belongs to a workspace.");
    }

    const propertyName = args.propertyName.trim();
    if (propertyName.length < 2 || propertyName.length > 100) {
      appError(
        "VALIDATION_ERROR",
        "Property name must be 2..100 characters.",
        "propertyName",
      );
    }

    const propertyAddress = args.propertyAddress.trim();
    if (propertyAddress.length < 5 || propertyAddress.length > 240) {
      appError(
        "VALIDATION_ERROR",
        "Property address must be 5..240 characters.",
        "propertyAddress",
      );
    }

    const now = Date.now();
    const workspaceId = await ctx.db.insert("workspaces", {
      name,
      timezone: args.timezone,
      currency,
      status: "active",
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId: user._id,
      role: "owner",
      createdAt: now,
      updatedAt: now,
    });
    const propertyId = await ctx.db.insert("properties", {
      workspaceId,
      name: propertyName,
      address: propertyAddress,
      city: undefined,
      country: undefined,
      timezone: args.timezone,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    return { workspaceId, propertyId };
  },
});
