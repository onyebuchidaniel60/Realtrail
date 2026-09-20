// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("base schema stores users, workspaces, and memberships", async () => {
  const t = convexTest(schema, modules);
  const now = Date.now();

  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      clerkUserId: "user_test123",
      email: "owner@example.com",
      name: "Test Owner",
      createdAt: now,
      updatedAt: now,
    });
  });

  const user = await t.run(async (ctx) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) =>
        q.eq("clerkUserId", "user_test123"),
      )
      .unique();
  });
  expect(user?._id).toEqual(userId);
  expect(user).toMatchObject({
    clerkUserId: "user_test123",
    email: "owner@example.com",
    name: "Test Owner",
    createdAt: now,
    updatedAt: now,
  });

  const workspaceId = await t.run(async (ctx) => {
    return await ctx.db.insert("workspaces", {
      name: "Test Estate",
      timezone: "Africa/Lagos",
      currency: "NGN",
      status: "active",
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
  });

  const membershipId = await t.run(async (ctx) => {
    return await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId,
      role: "owner",
      createdAt: now,
      updatedAt: now,
    });
  });

  const membership = await t.run(async (ctx) => {
    return await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspaceId_and_userId", (q) =>
        q.eq("workspaceId", workspaceId).eq("userId", userId),
      )
      .unique();
  });
  expect(membership?._id).toEqual(membershipId);
  expect(membership).toMatchObject({
    workspaceId,
    userId,
    role: "owner",
  });
});
