import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "./errors";

export type DbContext = QueryCtx | MutationCtx;
export type Role = "owner" | "manager" | "staff";

export async function requireWorkspaceMembership(
  ctx: DbContext,
  userId: Id<"users">,
  workspaceId: Id<"workspaces">,
): Promise<Doc<"workspaceMembers">> {
  const membership = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspaceId_and_userId", (q) =>
      q.eq("workspaceId", workspaceId).eq("userId", userId),
    )
    .unique();
  if (membership === null) {
    appError("FORBIDDEN", "Not a member of this workspace.");
  }
  return membership;
}

export async function requireRole(
  ctx: DbContext,
  userId: Id<"users">,
  workspaceId: Id<"workspaces">,
  allowedRoles: Array<Role>,
): Promise<Doc<"workspaceMembers">> {
  const membership = await requireWorkspaceMembership(
    ctx,
    userId,
    workspaceId,
  );
  if (!allowedRoles.includes(membership.role)) {
    appError("FORBIDDEN", "Role not permitted for this operation.");
  }
  return membership;
}

export async function requireResourceWorkspaceMembership(
  ctx: DbContext,
  userId: Id<"users">,
  resourceWorkspaceId: Id<"workspaces">,
): Promise<Doc<"workspaceMembers">> {
  return requireWorkspaceMembership(ctx, userId, resourceWorkspaceId);
}
