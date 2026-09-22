import { internalMutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { appError } from "../lib/errors";

// Admin smoke-workspace cleanup (Phase 11, Part D). INTERNAL-ONLY: never
// wire to client code, never add a UI. Gated by
// REALTRAIL_ADMIN_CLEANUP_TOKEN — unset means disabled, mismatch means
// FORBIDDEN. Deletes a workspace and every workspace-scoped dependent in
// one transaction, capped at MAX_ROWS rows per call. Oversized
// workspaces return { deleted: false, reason: "too_large" } with NOTHING
// deleted. The global users table is intentionally left alone (identity
// mirrors, not workspace data).

const MAX_ROWS = 5000;

const countsValidator = v.object({
  workspaceMembers: v.number(),
  caseActivities: v.number(),
  cases: v.number(),
  communications: v.number(),
  confirmationTokens: v.number(),
  vendorResearchResults: v.number(),
  vendorResearch: v.number(),
  vendors: v.number(),
  units: v.number(),
  buildings: v.number(),
  properties: v.number(),
  inboundEvents: v.number(),
  notifications: v.number(),
  caseCounters: v.number(),
  workspaces: v.number(),
});

type Counts = {
  workspaceMembers: number;
  caseActivities: number;
  cases: number;
  communications: number;
  confirmationTokens: number;
  vendorResearchResults: number;
  vendorResearch: number;
  vendors: number;
  units: number;
  buildings: number;
  properties: number;
  inboundEvents: number;
  notifications: number;
  caseCounters: number;
  workspaces: number;
};

function zeroCounts(): Counts {
  return {
    workspaceMembers: 0,
    caseActivities: 0,
    cases: 0,
    communications: 0,
    confirmationTokens: 0,
    vendorResearchResults: 0,
    vendorResearch: 0,
    vendors: 0,
    units: 0,
    buildings: 0,
    properties: 0,
    inboundEvents: 0,
    notifications: 0,
    caseCounters: 0,
    workspaces: 0,
  };
}

export const deleteWorkspace = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    confirmToken: v.string(),
  },
  returns: v.object({
    deleted: v.boolean(),
    reason: v.optional(v.string()),
    counts: countsValidator,
  }),
  handler: async (ctx, args) => {
    const expected = process.env.REALTRAIL_ADMIN_CLEANUP_TOKEN;
    if (expected === undefined || expected === "") {
      appError("INTERNAL_ERROR", "Workspace cleanup is disabled.");
    }
    if (args.confirmToken !== expected) {
      appError("FORBIDDEN", "Invalid cleanup token.");
    }
    const workspace = await ctx.db.get("workspaces", args.workspaceId);
    if (workspace === null) {
      return { deleted: false, counts: zeroCounts() };
    }
    const workspaceId = workspace._id;

    // Phase 1 — budget check (reads only). Each take asks for one more
    // row than the remaining budget allows; a full batch means the
    // workspace is too large and NOTHING is deleted.
    let remaining = MAX_ROWS;
    const overBudget = (fetched: number): boolean => fetched > remaining;
    const consume = (fetched: number): void => {
      remaining -= fetched;
    };

    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
      .take(remaining + 1);
    if (overBudget(members.length)) {
      return { deleted: false, reason: "too_large", counts: zeroCounts() };
    }
    consume(members.length);

    const cases = await ctx.db
      .query("cases")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
      .take(remaining + 1);
    if (overBudget(cases.length)) {
      return { deleted: false, reason: "too_large", counts: zeroCounts() };
    }
    consume(cases.length);

    const activities = await ctx.db
      .query("caseActivities")
      .withIndex("by_workspaceId_and_createdAt", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .take(remaining + 1);
    if (overBudget(activities.length)) {
      return { deleted: false, reason: "too_large", counts: zeroCounts() };
    }
    consume(activities.length);

    const communications = await ctx.db
      .query("communications")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
      .take(remaining + 1);
    if (overBudget(communications.length)) {
      return { deleted: false, reason: "too_large", counts: zeroCounts() };
    }
    consume(communications.length);

    const tokens = await ctx.db
      .query("confirmationTokens")
      .filter((q) => q.eq(q.field("workspaceId"), workspaceId))
      .take(remaining + 1);
    if (overBudget(tokens.length)) {
      return { deleted: false, reason: "too_large", counts: zeroCounts() };
    }
    consume(tokens.length);

    const research = await ctx.db
      .query("vendorResearch")
      .withIndex("by_workspaceId_and_createdAt", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .take(remaining + 1);
    if (overBudget(research.length)) {
      return { deleted: false, reason: "too_large", counts: zeroCounts() };
    }
    consume(research.length);

    const results: Array<{ _id: Id<"vendorResearchResults"> }> = [];
    for (const run of research) {
      const batch = await ctx.db
        .query("vendorResearchResults")
        .withIndex("by_researchId", (q) => q.eq("researchId", run._id))
        .take(remaining + 1 - results.length);
      results.push(...batch);
      if (overBudget(results.length)) {
        return { deleted: false, reason: "too_large", counts: zeroCounts() };
      }
    }
    consume(results.length);

    const vendors = await ctx.db
      .query("vendors")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
      .take(remaining + 1);
    if (overBudget(vendors.length)) {
      return { deleted: false, reason: "too_large", counts: zeroCounts() };
    }
    consume(vendors.length);

    const units = await ctx.db
      .query("units")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
      .take(remaining + 1);
    if (overBudget(units.length)) {
      return { deleted: false, reason: "too_large", counts: zeroCounts() };
    }
    consume(units.length);

    const buildings = await ctx.db
      .query("buildings")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
      .take(remaining + 1);
    if (overBudget(buildings.length)) {
      return { deleted: false, reason: "too_large", counts: zeroCounts() };
    }
    consume(buildings.length);

    const properties = await ctx.db
      .query("properties")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
      .take(remaining + 1);
    if (overBudget(properties.length)) {
      return { deleted: false, reason: "too_large", counts: zeroCounts() };
    }
    consume(properties.length);

    // inboundEvents carry no workspaceId: scope by the workspace's
    // provisioned inbox. No inbox means no routable events.
    const inboxId = workspace.agentMailInboxId;
    const events =
      inboxId === undefined || inboxId === ""
        ? []
        : await ctx.db
            .query("inboundEvents")
            .filter((q) => q.eq(q.field("providerInboxId"), inboxId))
            .take(remaining + 1);
    if (overBudget(events.length)) {
      return { deleted: false, reason: "too_large", counts: zeroCounts() };
    }
    consume(events.length);

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_workspaceId_and_createdAt", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .take(remaining + 1);
    if (overBudget(notifications.length)) {
      return { deleted: false, reason: "too_large", counts: zeroCounts() };
    }
    consume(notifications.length);

    const counters = await ctx.db
      .query("caseCounters")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
      .take(remaining + 1);
    if (overBudget(counters.length)) {
      return { deleted: false, reason: "too_large", counts: zeroCounts() };
    }
    consume(counters.length);

    // Phase 2 — delete everything collected, then the workspace row.
    const counts = zeroCounts();
    for (const doc of members) {
      await ctx.db.delete("workspaceMembers", doc._id);
    }
    counts.workspaceMembers = members.length;
    for (const doc of activities) {
      await ctx.db.delete("caseActivities", doc._id);
    }
    counts.caseActivities = activities.length;
    for (const doc of cases) {
      await ctx.db.delete("cases", doc._id);
    }
    counts.cases = cases.length;
    for (const doc of communications) {
      await ctx.db.delete("communications", doc._id);
    }
    counts.communications = communications.length;
    for (const doc of tokens) {
      await ctx.db.delete("confirmationTokens", doc._id);
    }
    counts.confirmationTokens = tokens.length;
    for (const doc of results) {
      await ctx.db.delete("vendorResearchResults", doc._id);
    }
    counts.vendorResearchResults = results.length;
    for (const doc of research) {
      await ctx.db.delete("vendorResearch", doc._id);
    }
    counts.vendorResearch = research.length;
    for (const doc of vendors) {
      await ctx.db.delete("vendors", doc._id);
    }
    counts.vendors = vendors.length;
    for (const doc of units) {
      await ctx.db.delete("units", doc._id);
    }
    counts.units = units.length;
    for (const doc of buildings) {
      await ctx.db.delete("buildings", doc._id);
    }
    counts.buildings = buildings.length;
    for (const doc of properties) {
      await ctx.db.delete("properties", doc._id);
    }
    counts.properties = properties.length;
    for (const doc of events) {
      await ctx.db.delete("inboundEvents", doc._id);
    }
    counts.inboundEvents = events.length;
    for (const doc of notifications) {
      await ctx.db.delete("notifications", doc._id);
    }
    counts.notifications = notifications.length;
    for (const doc of counters) {
      await ctx.db.delete("caseCounters", doc._id);
    }
    counts.caseCounters = counters.length;
    await ctx.db.delete("workspaces", workspaceId);
    counts.workspaces = 1;

    return { deleted: true, counts };
  },
});
