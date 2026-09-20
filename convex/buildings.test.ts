// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

const USER_A = {
  subject: "user_bld_a",
  name: "User A",
  email: "user-a@example.com",
};

const USER_B = {
  subject: "user_bld_b",
  name: "User B",
  email: "user-b@example.com",
};

async function seedTwoWorkspacesWithBuildings() {
  const t = convexTest(schema, modules);
  const a = t.withIdentity(USER_A);
  const b = t.withIdentity(USER_B);
  await a.mutation(api.users.syncUser, {});
  await b.mutation(api.users.syncUser, {});
  const createdA = await a.mutation(api.workspace.create, {
    workspaceName: "Estate A",
    timezone: "Africa/Lagos",
    currency: "NGN",
    propertyName: "Estate A Main",
    propertyAddress: "1 Estate A Road, Lagos",
  });
  const createdB = await b.mutation(api.workspace.create, {
    workspaceName: "Estate B",
    timezone: "Africa/Lagos",
    currency: "NGN",
    propertyName: "Estate B Main",
    propertyAddress: "1 Estate B Road, Lagos",
  });
  const { buildingId: buildingA } = await a.mutation(api.buildings.create, {
    propertyId: createdA.propertyId,
    name: "Block A",
    code: "BLKA",
  });
  return { t, a, b, createdA, createdB, buildingA };
}

describe("buildings.listByProperty", () => {
  test("returns buildings in the property", async () => {
    const { a, createdA, buildingA } = await seedTwoWorkspacesWithBuildings();
    await a.mutation(api.buildings.create, {
      propertyId: createdA.propertyId,
      name: "Block Z",
    });
    const buildings = await a.query(api.buildings.listByProperty, {
      propertyId: createdA.propertyId,
    });
    expect(buildings.map((b) => b.name)).toEqual(["Block A", "Block Z"]);
    expect(buildings[0]._id).toEqual(buildingA);
  });
});

describe("buildings.create", () => {
  test("inserts a building with correct propertyId and workspaceId", async () => {
    const { a, createdA } = await seedTwoWorkspacesWithBuildings();
    const { buildingId } = await a.mutation(api.buildings.create, {
      propertyId: createdA.propertyId,
      name: "Block C",
      code: "blkc",
    });
    const buildings = await a.query(api.buildings.listByProperty, {
      propertyId: createdA.propertyId,
    });
    const created = buildings.find((b) => b._id === buildingId);
    expect(created).toMatchObject({
      propertyId: createdA.propertyId,
      workspaceId: createdA.workspaceId,
      name: "Block C",
      code: "BLKC",
    });
  });

  test("rejects a propertyId in another workspace", async () => {
    const { b, createdA } = await seedTwoWorkspacesWithBuildings();
    await expect(
      b.mutation(api.buildings.create, {
        propertyId: createdA.propertyId,
        name: "Intruder Block",
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });

  test("rejects a name that is too short", async () => {
    const { a, createdA } = await seedTwoWorkspacesWithBuildings();
    await expect(
      a.mutation(api.buildings.create, {
        propertyId: createdA.propertyId,
        name: "   ",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });
});

describe("buildings.update", () => {
  test("rejects a cross-workspace buildingId", async () => {
    const { b, buildingA } = await seedTwoWorkspacesWithBuildings();
    await expect(
      b.mutation(api.buildings.update, {
        buildingId: buildingA,
        name: "Hijacked",
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });
});
