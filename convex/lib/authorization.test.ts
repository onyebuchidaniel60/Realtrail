// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { getCurrentUser } from "./auth";
import {
  requireResourceWorkspaceMembership,
  requireRole,
  requireWorkspaceMembership,
} from "./authorization";

const modules = import.meta.glob("../**/*.ts");

const OWNER_IDENTITY = {
  subject: "user_owner_1",
  name: "Owner One",
  email: "owner-one@example.com",
};

const STAFF_IDENTITY = {
  subject: "user_staff_1",
  name: "Staff One",
  email: "staff-one@example.com",
};

const OUTSIDER_IDENTITY = {
  subject: "user_outsider_1",
  name: "Outsider One",
  email: "outsider-one@example.com",
};

async function seedWorkspaceWithOwnerMember() {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const seeded = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkUserId: OWNER_IDENTITY.subject,
      email: OWNER_IDENTITY.email,
      name: OWNER_IDENTITY.name,
      createdAt: now,
      updatedAt: now,
    });
    const staffId = await ctx.db.insert("users", {
      clerkUserId: STAFF_IDENTITY.subject,
      email: STAFF_IDENTITY.email,
      name: STAFF_IDENTITY.name,
      createdAt: now,
      updatedAt: now,
    });
    const workspaceId = await ctx.db.insert("workspaces", {
      name: "Authz Estate",
      timezone: "Africa/Lagos",
      currency: "NGN",
      status: "active",
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId,
      role: "owner",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId: staffId,
      role: "staff",
      createdAt: now,
      updatedAt: now,
    });
    return { userId, staffId, workspaceId };
  });
  return { t, ...seeded };
}

describe("requireWorkspaceMembership", () => {
  test("returns the membership doc when the user is a member", async () => {
    const { t, userId, workspaceId } = await seedWorkspaceWithOwnerMember();
    const authed = t.withIdentity(OWNER_IDENTITY);
    const membership = await authed.run(async (ctx) => {
      const me = await getCurrentUser(ctx);
      return await requireWorkspaceMembership(ctx, me._id, workspaceId);
    });
    expect(membership).toMatchObject({
      userId,
      workspaceId,
      role: "owner",
    });
  });

  test("throws FORBIDDEN when no membership exists", async () => {
    const { t, workspaceId } = await seedWorkspaceWithOwnerMember();
    const outsider = t.withIdentity(OUTSIDER_IDENTITY);
    await expect(
      outsider.run(async (ctx) => {
        const me = await getCurrentUser(ctx);
        await requireWorkspaceMembership(ctx, me._id, workspaceId);
      }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });
});

describe("requireRole", () => {
  test("returns the membership when the role is allowed", async () => {
    const { t, workspaceId } = await seedWorkspaceWithOwnerMember();
    const authed = t.withIdentity(OWNER_IDENTITY);
    const membership = await authed.run(async (ctx) => {
      const me = await getCurrentUser(ctx);
      return await requireRole(ctx, me._id, workspaceId, [
        "owner",
        "manager",
      ]);
    });
    expect(membership.role).toEqual("owner");
  });

  test("throws FORBIDDEN when the role is not in the allowed list", async () => {
    const { t, workspaceId } = await seedWorkspaceWithOwnerMember();
    const staff = t.withIdentity(STAFF_IDENTITY);
    await expect(
      staff.run(async (ctx) => {
        const me = await getCurrentUser(ctx);
        await requireRole(ctx, me._id, workspaceId, ["owner", "manager"]);
      }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });
});

describe("requireResourceWorkspaceMembership", () => {
  test("behaves identically to requireWorkspaceMembership", async () => {
    const { t, userId, workspaceId } = await seedWorkspaceWithOwnerMember();
    const authed = t.withIdentity(OWNER_IDENTITY);
    const membership = await authed.run(async (ctx) => {
      const me = await getCurrentUser(ctx);
      return await requireResourceWorkspaceMembership(
        ctx,
        me._id,
        workspaceId,
      );
    });
    expect(membership).toMatchObject({
      userId,
      workspaceId,
      role: "owner",
    });

    const outsider = t.withIdentity(OUTSIDER_IDENTITY);
    await expect(
      outsider.run(async (ctx) => {
        const me = await getCurrentUser(ctx);
        await requireResourceWorkspaceMembership(ctx, me._id, workspaceId);
      }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });
});
