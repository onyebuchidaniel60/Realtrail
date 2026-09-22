import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";
import { requireUser } from "./lib/auth";
import { appError } from "./lib/errors";
import { EMAIL_PATTERN, bounded, categoryValidator } from "./cases/mutations";

// Saved operational vendor directory. Vendors are workspace-scoped;
// provider-discovered entries are snapshots saved explicitly by a
// manager, never auto-created.

const MAX_VENDORS = 200;

function validateWebsite(value: string, field: string): string {
  const trimmed = value.trim();
  if (
    !(trimmed.startsWith("https://") || trimmed.startsWith("http://")) ||
    trimmed.length < 10 ||
    trimmed.length > 500
  ) {
    appError(
      "VALIDATION_ERROR",
      "Website must start with https:// or http://.",
      field,
    );
  }
  return trimmed;
}

export const save = mutation({
  args: {
    name: v.string(),
    serviceCategories: v.array(categoryValidator),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
    source: v.union(v.literal("manual"), v.literal("firecrawl")),
    sourceUrl: v.optional(v.string()),
  },
  returns: v.object({ vendorId: v.id("vendors") }),
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

    const name = bounded(args.name, 1, 120, "name");
    if (args.serviceCategories.length < 1 || args.serviceCategories.length > 5) {
      appError(
        "VALIDATION_ERROR",
        "Provide 1..5 service categories.",
        "serviceCategories",
      );
    }
    let email = args.email?.trim();
    if (email !== undefined && email !== "") {
      if (!EMAIL_PATTERN.test(email)) {
        appError("VALIDATION_ERROR", "Vendor email is invalid.", "email");
      }
    } else {
      email = undefined;
    }
    let phone = args.phone?.trim();
    if (phone !== undefined) {
      phone = bounded(phone, 1, 30, "phone");
    }
    const website =
      args.website === undefined
        ? undefined
        : validateWebsite(args.website, "website");
    const location =
      args.location === undefined || args.location.trim() === ""
        ? undefined
        : bounded(args.location, 1, 120, "location");
    const notes =
      args.notes === undefined || args.notes.trim() === ""
        ? undefined
        : bounded(args.notes, 1, 2000, "notes");
    const sourceUrl =
      args.sourceUrl === undefined
        ? undefined
        : validateWebsite(args.sourceUrl, "sourceUrl");

    const now = Date.now();
    const vendorId = await ctx.db.insert("vendors", {
      workspaceId,
      name,
      serviceCategories: [...args.serviceCategories],
      email,
      phone,
      website,
      location,
      source: args.source,
      sourceUrl,
      notes,
      createdAt: now,
      updatedAt: now,
    });
    return { vendorId };
  },
});

export const update = mutation({
  args: {
    vendorId: v.id("vendors"),
    name: v.optional(v.string()),
    serviceCategories: v.optional(v.array(categoryValidator)),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.object({ vendorId: v.id("vendors") }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const vendor = await ctx.db.get("vendors", args.vendorId);
    if (vendor === null) {
      appError("NOT_FOUND", "Vendor not found.");
    }
    // Existence-hiding convention (Phase 2-A): cross-workspace access
    // reads as NOT_FOUND, never FORBIDDEN.
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspaceId_and_userId", (q) =>
        q.eq("workspaceId", vendor.workspaceId).eq("userId", user._id),
      )
      .unique();
    if (membership === null) {
      appError("NOT_FOUND", "Vendor not found.");
    }
    // workspaceId and source are immutable by design — not in args.

    const patch: {
      name?: string;
      serviceCategories?: Doc<"vendors">["serviceCategories"];
      email?: string;
      phone?: string;
      website?: string;
      location?: string;
      notes?: string;
      updatedAt: number;
    } = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      patch.name = bounded(args.name, 1, 120, "name");
    }
    if (args.serviceCategories !== undefined) {
      if (
        args.serviceCategories.length < 1 ||
        args.serviceCategories.length > 5
      ) {
        appError(
          "VALIDATION_ERROR",
          "Provide 1..5 service categories.",
          "serviceCategories",
        );
      }
      patch.serviceCategories = [...args.serviceCategories];
    }
    if (args.email !== undefined) {
      const trimmed = args.email.trim();
      if (trimmed !== "" && !EMAIL_PATTERN.test(trimmed)) {
        appError("VALIDATION_ERROR", "Vendor email is invalid.", "email");
      }
      patch.email = trimmed === "" ? undefined : trimmed;
    }
    if (args.phone !== undefined) {
      patch.phone = bounded(args.phone.trim(), 1, 30, "phone");
    }
    if (args.website !== undefined) {
      patch.website = validateWebsite(args.website, "website");
    }
    if (args.location !== undefined) {
      const trimmed = args.location.trim();
      patch.location =
        trimmed === "" ? undefined : bounded(trimmed, 1, 120, "location");
    }
    if (args.notes !== undefined) {
      const trimmed = args.notes.trim();
      patch.notes =
        trimmed === "" ? undefined : bounded(trimmed, 1, 2000, "notes");
    }
    await ctx.db.patch("vendors", vendor._id, patch);
    return { vendorId: vendor._id };
  },
});

export const list = query({
  args: {
    search: v.optional(v.string()),
    category: v.optional(categoryValidator),
  },
  returns: v.array(schema.doc("vendors")),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    if (memberships.length === 0) {
      return [];
    }
    memberships.sort((a, b) => b.updatedAt - a.updatedAt);
    const workspaceId = memberships[0].workspaceId;
    const rows = await ctx.db
      .query("vendors")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    const needle = args.search?.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (
        needle !== undefined &&
        needle !== "" &&
        !row.name.toLowerCase().includes(needle)
      ) {
        return false;
      }
      if (
        args.category !== undefined &&
        !row.serviceCategories.includes(args.category)
      ) {
        return false;
      }
      return true;
    });
    filtered.sort((a, b) => a.name.localeCompare(b.name));
    // TODO(pagination): capped at 200 rows; add cursor pagination if a
    // workspace outgrows it.
    return filtered.slice(0, MAX_VENDORS);
  },
});
