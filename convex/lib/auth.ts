import type { Doc, Id } from "../_generated/dataModel";
import type {
  ActionCtx,
  MutationCtx,
  QueryCtx,
} from "../_generated/server";
import { appError } from "./errors";

// Contexts that can read the database. Mirroring a first-time user
// requires a write, so getCurrentUser must be called from a mutation
// (or action via runMutation) when the user row may not exist yet.
export type DbContext = QueryCtx | MutationCtx;
export type AuthContext = QueryCtx | MutationCtx | ActionCtx;

export async function getAuthenticatedIdentity(ctx: AuthContext) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    appError("UNAUTHENTICATED", "Authentication required.");
  }
  return identity;
}

export async function getCurrentUser(
  ctx: DbContext,
): Promise<Doc<"users">> {
  const identity = await getAuthenticatedIdentity(ctx);
  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) =>
      q.eq("clerkUserId", identity.subject),
    )
    .unique();
  if (existing !== null) {
    return existing;
  }
  // Mirroring requires a write context. Queries run against users that a
  // prior mutation has already mirrored; convex-test's t.run counts as one.
  if (typeof (ctx.db as { insert?: unknown }).insert !== "function") {
    appError(
      "UNAUTHENTICATED",
      "No user record exists for this identity yet.",
    );
  }
  const now = Date.now();
  const userId: Id<"users"> = await (ctx as MutationCtx).db.insert("users", {
    clerkUserId: identity.subject,
    email: identity.email ?? undefined,
    name: identity.name ?? undefined,
    createdAt: now,
    updatedAt: now,
  });
  const created = await ctx.db.get("users", userId);
  if (created === null) {
    appError("UNAUTHENTICATED", "Unable to establish user record.");
  }
  return created;
}

export async function requireUser(
  ctx: DbContext,
): Promise<Doc<"users">> {
  return getCurrentUser(ctx);
}
