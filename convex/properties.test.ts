// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

const USER_A = {
  subject: "user_prop_a",
  name: "User A",
  email: "user-a@example.com",
};

const USER_B = {
  subject: "user_prop_b",
  name: "User B",
  email: "user-b@example.com",
};

function workspaceArgs(name: string) {
  return {
    workspaceName: name,
    timezone: "Africa/Lagos",
    currency: "NGN",
    propertyName: `${name} Main`,
    propertyAddress: `1 ${name} Road, Lagos`,
  };
}

async function seedTwoWorkspaces() {
  const t = convexTest(schema, modules);
  const a = t.withIdentity(USER_A);
  const b = t.withIdentity(USER_B);
  await a.mutation(api.users.syncUser, {});
  await b.mutation(api.users.syncUser, {});
  const createdA = await a.mutation(
    api.workspace.create,
    workspaceArgs("Estate A"),
  );
  const createdB = await b.mutation(
    api.workspace.create,
    workspaceArgs("Estate B"),
  );
  return { t, a, b, createdA, createdB };
}

describe("properties.list", () => {
  test("returns only the caller's workspace properties", async () => {
    const { a, createdA } = await seedTwoWorkspaces();
    const properties = await a.query(api.properties.list, {});
    expect(properties).toHaveLength(1);
    expect(properties[0]).toMatchObject({
      _id: createdA.propertyId,
      workspaceId: createdA.workspaceId,
    });
  });

  test("returns an empty array when the workspace has none", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(USER_A);
    await authed.mutation(api.users.syncUser, {});
    // Membership without a property (workspace.create always adds one, so
    // insert the workspace + membership directly).
    const now = Date.now();
    const userId = await t.run(async (ctx) => {
      const rows = await ctx.db.query("users").collect();
      return rows[0]._id;
    });
    const workspaceId = await t.run(async (ctx) => {
      return await ctx.db.insert("workspaces", {
        name: "Empty Estate",
        timezone: "UTC",
        currency: "USD",
        status: "active",
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("workspaceMembers", {
        workspaceId,
        userId,
        role: "owner",
        createdAt: now,
        updatedAt: now,
      });
    });
    const properties = await authed.query(api.properties.list, {});
    expect(properties).toEqual([]);
  });
});

describe("properties.get", () => {
  test("returns the property when the caller is a member", async () => {
    const { a, createdA } = await seedTwoWorkspaces();
    const property = await a.query(api.properties.get, {
      propertyId: createdA.propertyId,
    });
    expect(property).toMatchObject({ _id: createdA.propertyId });
  });

  test("throws NOT_FOUND for a property in another workspace", async () => {
    const { b, createdA } = await seedTwoWorkspaces();
    await expect(
      b.query(api.properties.get, { propertyId: createdA.propertyId }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });
});

describe("properties.create", () => {
  test("inserts a property owned by the caller's workspace", async () => {
    const { a, createdA } = await seedTwoWorkspaces();
    const { propertyId } = await a.mutation(api.properties.create, {
      name: "Annex",
      address: "5 Annex Close, Lagos",
    });
    const property = await a.query(api.properties.get, { propertyId });
    expect(property).toMatchObject({
      workspaceId: createdA.workspaceId,
      name: "Annex",
      timezone: "Africa/Lagos",
      active: true,
    });
  });

  test("rejects a name that is too short or too long", async () => {
    const { a } = await seedTwoWorkspaces();
    await expect(
      a.mutation(api.properties.create, {
        name: "P",
        address: "5 Annex Close, Lagos",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    await expect(
      a.mutation(api.properties.create, {
        name: "P".repeat(101),
        address: "5 Annex Close, Lagos",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  test("rejects an address that is too short or too long", async () => {
    const { a } = await seedTwoWorkspaces();
    await expect(
      a.mutation(api.properties.create, {
        name: "Annex",
        address: "1234",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    await expect(
      a.mutation(api.properties.create, {
        name: "Annex",
        address: "A".repeat(241),
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });
});

describe("properties.update", () => {
  test("rejects a cross-workspace propertyId", async () => {
    const { b, createdA } = await seedTwoWorkspaces();
    await expect(
      b.mutation(api.properties.update, {
        propertyId: createdA.propertyId,
        name: "Hijacked",
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });
});
