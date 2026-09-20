import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

// Allocates the next per-workspace case number atomically inside the
// calling mutation's transaction. Never timestamps, never random.
export async function allocateCaseNumber(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
): Promise<number> {
  const counter = await ctx.db
    .query("caseCounters")
    .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
    .unique();
  if (counter === null) {
    await ctx.db.insert("caseCounters", { workspaceId, nextNumber: 2 });
    return 1;
  }
  await ctx.db.patch("caseCounters", counter._id, {
    nextNumber: counter.nextNumber + 1,
  });
  return counter.nextNumber;
}
