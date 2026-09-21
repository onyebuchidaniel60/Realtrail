import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";
import { getAuthenticatedIdentity } from "../lib/auth";
import { appError } from "../lib/errors";
import { createInbox } from "../lib/providers/agentmail";

// NOTE: this module lives at convex/workspaces/ (plural) because
// convex/workspace.ts already owns the "workspace" module path — a
// convex/workspace/ directory would collide in file-based routing.

const provisionResultValidator = v.object({
  inboxId: v.string(),
  address: v.string(),
  alreadyProvisioned: v.boolean(),
});

type ProvisionResult = {
  inboxId: string;
  address: string;
  alreadyProvisioned: boolean;
};

export const getWorkspace = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
  },
  returns: v.union(v.null(), schema.doc("workspaces")),
  handler: async (ctx, args) => {
    return await ctx.db.get("workspaces", args.workspaceId);
  },
});

// Resolves the caller's workspace inside action context. The clerkUserId
// argument always comes from ctx.auth.getUserIdentity() in the calling
// public action — never from client input — so this stays server-derived.
export const resolveCallerWorkspace = internalQuery({
  args: {
    clerkUserId: v.string(),
  },
  returns: v.object({
    workspace: schema.doc("workspaces"),
    member: schema.doc("workspaceMembers"),
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) =>
        q.eq("clerkUserId", args.clerkUserId),
      )
      .unique();
    if (user === null) {
      appError("FORBIDDEN", "No workspace membership for this user.");
    }
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    if (memberships.length === 0) {
      appError("FORBIDDEN", "No workspace membership for this user.");
    }
    memberships.sort((a, b) => b.updatedAt - a.updatedAt);
    const member = memberships[0];
    const workspace = await ctx.db.get("workspaces", member.workspaceId);
    if (workspace === null) {
      appError("NOT_FOUND", "Workspace no longer exists.");
    }
    return { workspace, member };
  },
});

export const storeInboxAddress = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    inboxId: v.string(),
    address: v.string(),
  },
  returns: v.object({ workspaceId: v.id("workspaces") }),
  handler: async (ctx, args) => {
    await ctx.db.patch("workspaces", args.workspaceId, {
      agentMailInboxId: args.inboxId,
      agentMailInboxAddress: args.address,
    });
    return { workspaceId: args.workspaceId };
  },
});

// Shared orchestration for both entry points below. Plain helper (not a
// Convex function): the two actions pass their own ctx through, which
// keeps action-to-action calls out of the picture per Convex guidelines.
async function provisionInboxForWorkspace(
  ctx: ActionCtx,
  workspaceId: Id<"workspaces">,
): Promise<ProvisionResult> {
  const workspace: Doc<"workspaces"> | null = await ctx.runQuery(
    internal.workspaces.provisioning.getWorkspace,
    { workspaceId },
  );
  if (workspace === null) {
    appError("NOT_FOUND", "Workspace no longer exists.");
  }
  // Workspace-field check first: provisioning is idempotent even if the
  // provider call is never retried.
  if (workspace.agentMailInboxId !== undefined) {
    return {
      inboxId: workspace.agentMailInboxId,
      address: workspace.agentMailInboxAddress ?? "",
      alreadyProvisioned: true,
    };
  }
  const apiKey = process.env.AGENTMAIL_API_KEY;
  if (!apiKey) {
    appError(
      "PROVIDER_ERROR",
      "AgentMail is not configured for this deployment.",
      undefined,
      false,
    );
  }
  // clientId is the workspaceId string: deterministic per workspace and
  // "@"-free, so provider-side client_id idempotency returns the original
  // inbox on retry instead of a duplicate.
  const created = await createInbox({
    apiKey,
    clientId: workspaceId,
    displayName: workspace.name,
  });
  await ctx.runMutation(internal.workspaces.provisioning.storeInboxAddress, {
    workspaceId,
    inboxId: created.inboxId,
    address: created.address,
  });
  return {
    inboxId: created.inboxId,
    address: created.address,
    alreadyProvisioned: false,
  };
}

export const provisionAgentMailInbox = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
  },
  returns: provisionResultValidator,
  handler: async (ctx, args) => {
    return await provisionInboxForWorkspace(ctx, args.workspaceId);
  },
});

export const provisionMyWorkspaceInbox = action({
  args: {},
  returns: provisionResultValidator,
  handler: async (ctx) => {
    const identity = await getAuthenticatedIdentity(ctx);
    // Annotated to break same-file inference circularity (the query lives
    // in this module; see Convex guidelines on ctx.runQuery annotations).
    const caller: {
      workspace: Doc<"workspaces">;
      member: Doc<"workspaceMembers">;
    } = await ctx.runQuery(
      internal.workspaces.provisioning.resolveCallerWorkspace,
      { clerkUserId: identity.subject },
    );
    return await provisionInboxForWorkspace(ctx, caller.workspace._id);
  },
});
