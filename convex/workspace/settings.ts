import { mutation, query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { v } from "convex/values";
import { requireUser } from "../lib/auth";
import { appError } from "../lib/errors";
import {
  validateCurrency,
  validateTimezone,
  validateWorkspaceName,
} from "./validation";

// Workspace settings (Phase 11). Read + owner-only update of the
// workspace record plus a presence-only integration health surface.
//
// Security contract (AI_HANDOFF §11 — do not change without a spec
// change):
// - getSettings returns ONLY integration status enums. It never returns
//   env var names, values, partial values, or inbox IDs.
// - updateWorkspace is owner-only. Managers and staff get FORBIDDEN.

type DbContext = QueryCtx | MutationCtx;

const roleValidator = v.union(
  v.literal("owner"),
  v.literal("manager"),
  v.literal("staff"),
);

const integrationValidator = (liveLabel: "live" | "configured") =>
  v.union(v.literal(liveLabel), v.literal("not_configured"));

// Same most-recent-membership rule as workspace.getCurrent: MVP users
// belong to one workspace; if several memberships exist defensively, the
// most recently updated wins.
async function getCurrentMembership(
  ctx: DbContext,
  userId: Id<"users">,
): Promise<Doc<"workspaceMembers">> {
  const memberships = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  if (memberships.length === 0) {
    appError("FORBIDDEN", "No workspace membership for this user.");
  }
  memberships.sort((a, b) => b.updatedAt - a.updatedAt);
  return memberships[0];
}

function envPresent(name: string): boolean {
  const value = process.env[name];
  return value !== undefined && value !== "";
}

export const getSettings = query({
  args: {},
  returns: v.object({
    workspace: v.object({
      _id: v.id("workspaces"),
      name: v.string(),
      timezone: v.string(),
      currency: v.string(),
      status: v.union(v.literal("active"), v.literal("suspended")),
      agentMailInboxAddress: v.union(v.string(), v.null()),
      agentMailInboxConfigured: v.boolean(),
      createdAt: v.number(),
    }),
    member: v.object({
      role: roleValidator,
    }),
    integrations: v.object({
      agentMailInbound: integrationValidator("live"),
      agentMailOutbound: integrationValidator("live"),
      openAiTriage: integrationValidator("configured"),
      openAiDraft: integrationValidator("configured"),
      firecrawl: integrationValidator("configured"),
      clerkFrontend: integrationValidator("configured"),
    }),
  }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const membership = await getCurrentMembership(ctx, user._id);
    const workspace = await ctx.db.get("workspaces", membership.workspaceId);
    if (workspace === null) {
      appError("NOT_FOUND", "Workspace not found.");
    }
    const inboxId = workspace.agentMailInboxId;
    const inboxConfigured = inboxId !== undefined && inboxId !== "";
    return {
      workspace: {
        _id: workspace._id,
        name: workspace.name,
        timezone: workspace.timezone,
        currency: workspace.currency,
        status: workspace.status,
        agentMailInboxAddress: workspace.agentMailInboxAddress ?? null,
        agentMailInboxConfigured: inboxConfigured,
        createdAt: workspace.createdAt,
      },
      member: {
        role: membership.role,
      },
      // Presence-only health. MVP performs no live probes: "live" means
      // the workspace has a provisioned inbox AND the server holds the
      // matching credential; "configured" means the server holds the
      // model/key needed for that feature. No names or values leave the
      // server — only these enums.
      integrations: {
        agentMailInbound:
          inboxConfigured && envPresent("AGENTMAIL_WEBHOOK_SECRET")
            ? ("live" as const)
            : ("not_configured" as const),
        agentMailOutbound:
          inboxConfigured && envPresent("AGENTMAIL_API_KEY")
            ? ("live" as const)
            : ("not_configured" as const),
        openAiTriage:
          envPresent("OPENAI_API_KEY") && envPresent("OPENAI_TRIAGE_MODEL")
            ? ("configured" as const)
            : ("not_configured" as const),
        openAiDraft:
          envPresent("OPENAI_API_KEY") && envPresent("OPENAI_DRAFT_MODEL")
            ? ("configured" as const)
            : ("not_configured" as const),
        firecrawl: envPresent("FIRECRAWL_API_KEY")
          ? ("configured" as const)
          : ("not_configured" as const),
        clerkFrontend: envPresent("CLERK_FRONTEND_API_URL")
          ? ("configured" as const)
          : ("not_configured" as const),
      },
    };
  },
});

export const updateWorkspace = mutation({
  args: {
    name: v.optional(v.string()),
    timezone: v.optional(v.string()),
    currency: v.optional(v.string()),
  },
  returns: v.object({
    updated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const membership = await getCurrentMembership(ctx, user._id);
    // PROJECT_SPEC §1.6: only the owner manages workspace settings.
    if (membership.role !== "owner") {
      appError("FORBIDDEN", "Only the workspace owner can update settings.");
    }
    const workspace = await ctx.db.get("workspaces", membership.workspaceId);
    if (workspace === null) {
      appError("NOT_FOUND", "Workspace not found.");
    }
    const patch: {
      name?: string;
      timezone?: string;
      currency?: string;
      updatedAt: number;
    } = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      patch.name = validateWorkspaceName(args.name, "name");
    }
    if (args.timezone !== undefined) {
      patch.timezone = validateTimezone(args.timezone);
    }
    if (args.currency !== undefined) {
      patch.currency = validateCurrency(args.currency);
    }
    // Workspace-level change: no case activity (no case timeline) and no
    // provider logging per AGENTS.md §18-adjacent sensitive-log rules.
    await ctx.db.patch("workspaces", workspace._id, patch);
    return { updated: true };
  },
});
