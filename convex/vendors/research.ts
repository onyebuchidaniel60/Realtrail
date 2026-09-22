import { query } from "../_generated/server";
import schema from "../schema";
import { requireUser } from "../lib/auth";
import { appError } from "../lib/errors";
import { v } from "convex/values";

export const getResearch = query({
  args: {
    researchId: v.id("vendorResearch"),
  },
  returns: v.object({
    research: schema.doc("vendorResearch"),
    results: v.array(schema.doc("vendorResearchResults")),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const research = await ctx.db.get("vendorResearch", args.researchId);
    if (research === null) {
      appError("NOT_FOUND", "Research not found.");
    }
    // Existence-hiding convention (Phase 2-A): cross-workspace access
    // reads as NOT_FOUND, never FORBIDDEN.
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspaceId_and_userId", (q) =>
        q.eq("workspaceId", research.workspaceId).eq("userId", user._id),
      )
      .unique();
    if (membership === null) {
      appError("NOT_FOUND", "Research not found.");
    }
    const results = await ctx.db
      .query("vendorResearchResults")
      .withIndex("by_researchId", (q) => q.eq("researchId", args.researchId))
      .collect();
    return { research, results };
  },
});
