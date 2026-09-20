// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

const USER_A = {
  subject: "user_ws_a",
  name: "User A",
  email: "user-a@example.com",
};

const USER_B = {
  subject: "user_ws_b",
  name: "User B",
  email: "user-b@example.com",
};

const VALID_CREATE = {
  workspaceName: "Test Estate",
  timezone: "Africa/Lagos",
  currency: "NGN",
};

describe("workspace.getCurrent", () => {
  test("returns needsOnboarding true when the user has no membership", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(USER_A);
    await authed.mutation(api.users.syncUser, {});
    const current = await authed.query(api.workspace.getCurrent, {});
    expect(current).toMatchObject({
      workspace: null,
      member: null,
      needsOnboarding: true,
    });
  });

  test("returns the workspace and member when one membership exists", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(USER_A);
    await authed.mutation(api.users.syncUser, {});
    const { workspaceId } = await authed.mutation(
      api.workspace.create,
      VALID_CREATE,
    );
    const current = await authed.query(api.workspace.getCurrent, {});
    expect(current.needsOnboarding).toEqual(false);
    expect(current.workspace?._id).toEqual(workspaceId);
    expect(current.member).toMatchObject({
      workspaceId,
      role: "owner",
    });
  });

  test("throws UNAUTHENTICATED when identity is missing", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.workspace.getCurrent, {})).rejects.toMatchObject(
      {
        data: { code: "UNAUTHENTICATED" },
      },
    );
  });
});

describe("workspace.create", () => {
  test("creates a workspace and owner membership atomically", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(USER_A);
    await authed.mutation(api.users.syncUser, {});
    const { workspaceId } = await authed.mutation(
      api.workspace.create,
      VALID_CREATE,
    );
    const stored = await t.run(async (ctx) => {
      const workspace = await ctx.db.get("workspaces", workspaceId);
      const memberships = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspaceId_and_userId", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .eq("userId", workspace!.createdBy),
        )
        .collect();
      return { workspace, memberships };
    });
    expect(stored.workspace).toMatchObject({
      name: "Test Estate",
      timezone: "Africa/Lagos",
      currency: "NGN",
      status: "active",
    });
    expect(stored.memberships).toHaveLength(1);
    expect(stored.memberships[0].role).toEqual("owner");
  });

  test("returns CONFLICT when the user already has a membership", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(USER_A);
    await authed.mutation(api.users.syncUser, {});
    await authed.mutation(api.workspace.create, VALID_CREATE);
    await expect(
      authed.mutation(api.workspace.create, {
        ...VALID_CREATE,
        workspaceName: "Second Estate",
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });

  test("rejects an invalid timezone", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(USER_A);
    await authed.mutation(api.users.syncUser, {});
    await expect(
      authed.mutation(api.workspace.create, {
        ...VALID_CREATE,
        timezone: "Mars/Olympus",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  test("rejects an invalid currency format", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(USER_A);
    await authed.mutation(api.users.syncUser, {});
    await expect(
      authed.mutation(api.workspace.create, {
        ...VALID_CREATE,
        currency: "XX1",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    await expect(
      authed.mutation(api.workspace.create, {
        ...VALID_CREATE,
        currency: "USDX",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  test("rejects a workspace name that is too short or too long", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(USER_A);
    await authed.mutation(api.users.syncUser, {});
    await expect(
      authed.mutation(api.workspace.create, {
        ...VALID_CREATE,
        workspaceName: "A",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    await expect(
      authed.mutation(api.workspace.create, {
        ...VALID_CREATE,
        workspaceName: "E".repeat(81),
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  test("rejects a workspace name that is only whitespace", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(USER_A);
    await authed.mutation(api.users.syncUser, {});
    await expect(
      authed.mutation(api.workspace.create, {
        ...VALID_CREATE,
        workspaceName: "   ",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  test("cross-user isolation: user A cannot see user B's workspace", async () => {
    const t = convexTest(schema, modules);
    const a = t.withIdentity(USER_A);
    await a.mutation(api.users.syncUser, {});
    await a.mutation(api.workspace.create, VALID_CREATE);

    const b = t.withIdentity(USER_B);
    await b.mutation(api.users.syncUser, {});
    const currentB = await b.query(api.workspace.getCurrent, {});
    expect(currentB).toMatchObject({
      workspace: null,
      member: null,
      needsOnboarding: true,
    });
  });
});
