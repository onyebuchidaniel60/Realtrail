import { action, internalMutation, internalQuery } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";
import { getAuthenticatedIdentity } from "../lib/auth";
import { appError } from "../lib/errors";
import {
  scrape,
  search,
  type FirecrawlSearchResult,
} from "../lib/providers/firecrawl";
import {
  buildVendorSearchQuery,
  extractLocality,
} from "../lib/providers/vendorSearch";
import {
  extractContactInfo,
  normalizeSearchResults,
  truncateEvidence,
  type RankBand,
} from "../lib/providers/vendorNormalize";

const SEARCH_LIMIT = 5;
const MAX_SCRAPES = 3;
const RATE_LIMIT_WINDOW_MS = 60_000;

const RANK_ORDER: Record<RankBand, number> = {
  high_relevance: 0,
  relevant: 1,
  other: 2,
};

// All reads for the action in one transaction: case, workspace routing,
// property context, and any recent pending research for the cooldown.
export const loadDiscovery = internalQuery({
  args: {
    caseId: v.id("cases"),
    clerkUserId: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      record: schema.doc("cases"),
      workspaceId: v.id("workspaces"),
      property: v.union(
        v.null(),
        v.object({
          address: v.string(),
          city: v.optional(v.string()),
        }),
      ),
      recentPending: v.union(v.null(), schema.doc("vendorResearch")),
    }),
  ),
  handler: async (ctx, args) => {
    const record = await ctx.db.get("cases", args.caseId);
    if (record === null) {
      return null;
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (user === null) {
      return null;
    }
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspaceId_and_userId", (q) =>
        q.eq("workspaceId", record.workspaceId).eq("userId", user._id),
      )
      .unique();
    if (membership === null) {
      return null;
    }
    const property =
      record.propertyId !== undefined
        ? await ctx.db.get("properties", record.propertyId)
        : null;
    const researches = await ctx.db
      .query("vendorResearch")
      .withIndex("by_caseId", (q) => q.eq("caseId", args.caseId))
      .collect();
    const recentPending =
      researches.find(
        (row) =>
          row.status === "pending" &&
          Date.now() - row.createdAt < RATE_LIMIT_WINDOW_MS,
      ) ?? null;
    return {
      record,
      workspaceId: record.workspaceId,
      property:
        property === null
          ? null
          : { address: property.address, city: property.city },
      recentPending,
    };
  },
});

export const recordResearch = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    caseId: v.id("cases"),
    query: v.string(),
    locationContext: v.optional(v.string()),
  },
  returns: v.object({ researchId: v.id("vendorResearch") }),
  handler: async (ctx, args) => {
    const researchId = await ctx.db.insert("vendorResearch", {
      workspaceId: args.workspaceId,
      caseId: args.caseId,
      query: args.query,
      locationContext: args.locationContext,
      status: "pending",
      errorMessage: undefined,
      createdAt: Date.now(),
      completedAt: undefined,
    });
    return { researchId };
  },
});

export const finishResearch = internalMutation({
  args: {
    researchId: v.id("vendorResearch"),
    status: v.union(v.literal("completed"), v.literal("failed")),
    errorMessage: v.optional(v.string()),
  },
  returns: v.object({ researchId: v.id("vendorResearch") }),
  handler: async (ctx, args) => {
    await ctx.db.patch("vendorResearch", args.researchId, {
      status: args.status,
      // Fixed redacted message only; provider errors never touch the db.
      errorMessage: args.errorMessage,
      completedAt: Date.now(),
    });
    return { researchId: args.researchId };
  },
});

export const storeResult = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    researchId: v.id("vendorResearch"),
    providerName: v.string(),
    website: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    services: v.array(v.string()),
    location: v.optional(v.string()),
    sourceUrl: v.string(),
    evidence: v.optional(v.string()),
    rankBand: v.union(
      v.literal("high_relevance"),
      v.literal("relevant"),
      v.literal("other"),
    ),
  },
  returns: v.object({ resultId: v.id("vendorResearchResults") }),
  handler: async (ctx, args) => {
    const resultId = await ctx.db.insert("vendorResearchResults", {
      workspaceId: args.workspaceId,
      researchId: args.researchId,
      providerName: args.providerName,
      website: args.website,
      email: args.email,
      phone: args.phone,
      services: args.services,
      location: args.location,
      sourceUrl: args.sourceUrl,
      evidence: args.evidence,
      rankBand: args.rankBand,
      fetchedAt: Date.now(),
    });
    return { resultId };
  },
});

async function failResearch(
  ctx: ActionCtx,
  researchId: Id<"vendorResearch">,
): Promise<never> {
  await ctx.runMutation(internal.vendors.discover.finishResearch, {
    researchId,
    status: "failed",
    errorMessage: "Vendor discovery failed.",
  });
  appError("PROVIDER_ERROR", "Vendor discovery failed.", undefined, true);
}

export const discover = action({
  args: {
    caseId: v.id("cases"),
    refinement: v.optional(v.string()),
  },
  returns: v.object({ researchId: v.id("vendorResearch") }),
  handler: async (ctx, args) => {
    const identity = await getAuthenticatedIdentity(ctx);
    // Annotated to break same-file inference circularity.
    const loaded: {
      record: Doc<"cases">;
      workspaceId: Id<"workspaces">;
      property: { address: string; city?: string } | null;
      recentPending: Doc<"vendorResearch"> | null;
    } | null = await ctx.runQuery(internal.vendors.discover.loadDiscovery, {
      caseId: args.caseId,
      clerkUserId: identity.subject,
    });
    if (loaded === null) {
      appError("NOT_FOUND", "Case not found.");
    }
    // 60s per-case cooldown on pending research. No new infrastructure:
    // a plain indexed lookup doubles as the rate limiter.
    if (loaded.recentPending !== null) {
      appError(
        "RATE_LIMITED",
        "A discovery is already running for this case.",
        undefined,
        true,
      );
    }
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      appError(
        "PROVIDER_ERROR",
        "FIRECRAWL_API_KEY not configured.",
        undefined,
        false,
      );
    }
    // Query inputs are category + locality only. Case titles,
    // descriptions, notes, and contacts never leave the deployment.
    const locality = extractLocality({
      propertyAddress: loaded.property?.address ?? "",
      propertyCity: loaded.property?.city,
    });
    const query = buildVendorSearchQuery({
      category: loaded.record.category,
      propertyCity: loaded.property?.city,
      propertyAddress: loaded.property?.address ?? "",
      refinement: args.refinement,
    });
    // Annotated to break same-file inference circularity (the
    // mutation lives in this module).
    const created: { researchId: Id<"vendorResearch"> } =
      await ctx.runMutation(internal.vendors.discover.recordResearch, {
        workspaceId: loaded.workspaceId,
        caseId: args.caseId,
        query,
        locationContext: locality,
      });
    const researchId = created.researchId;
    let results: Array<FirecrawlSearchResult>;
    try {
      results = await search({ apiKey, query, limit: SEARCH_LIMIT });
    } catch {
      await failResearch(ctx, researchId);
      // Unreachable: failResearch always throws. Present only to satisfy
      // definite-assignment analysis.
      results = [];
    }
    if (results.length === 0) {
      await ctx.runMutation(internal.vendors.discover.finishResearch, {
        researchId,
        status: "completed",
      });
      return { researchId };
    }
    const normalized = normalizeSearchResults({
      results,
      targetCategory: loaded.record.category,
      targetLocality: locality,
    })
      .map((entry, index) => ({ ...entry, index }))
      .sort(
        (a, b) =>
          RANK_ORDER[a.rankBand] - RANK_ORDER[b.rankBand] || a.index - b.index,
      )
      .slice(0, MAX_SCRAPES);
    for (const entry of normalized) {
      try {
        const scraped = await scrape({ apiKey, url: entry.website });
        const contact = extractContactInfo({ scraped });
        await ctx.runMutation(internal.vendors.discover.storeResult, {
          workspaceId: loaded.workspaceId,
          researchId,
          providerName: entry.providerName,
          website: entry.website,
          email: contact.email,
          phone: contact.phone,
          // services stays empty in MVP — a future enhancement.
          services: [],
          location: contact.location,
          sourceUrl: entry.website,
          evidence: truncateEvidence(scraped.markdown),
          rankBand: entry.rankBand,
        });
      } catch {
        // One bad scrape must not fail the whole discovery. The URL is
        // public search-result data, safe to note in the log.
        console.warn(`vendor discovery scrape skipped for ${entry.website}`);
      }
    }
    await ctx.runMutation(internal.vendors.discover.finishResearch, {
      researchId,
      status: "completed",
    });
    return { researchId };
  },
});
