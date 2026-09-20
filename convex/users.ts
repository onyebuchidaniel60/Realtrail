import { mutation } from "./_generated/server";
import { getAuthenticatedIdentity, requireUser } from "./lib/auth";

export const syncUser = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const identity = await getAuthenticatedIdentity(ctx);
    const patch: {
      email?: string;
      name?: string;
      updatedAt: number;
    } = { updatedAt: Date.now() };
    if (
      identity.email !== undefined &&
      identity.email !== user.email
    ) {
      patch.email = identity.email;
    }
    if (identity.name !== undefined && identity.name !== user.name) {
      patch.name = identity.name;
    }
    await ctx.db.patch("users", user._id, patch);
    return user._id;
  },
});
