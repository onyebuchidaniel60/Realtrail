// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

const USER_A = {
  subject: "user_unit_a",
  name: "User A",
  email: "user-a@example.com",
};

const USER_B = {
  subject: "user_unit_b",
  name: "User B",
  email: "user-b@example.com",
};

async function seedTwoWorkspacesWithUnits() {
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
  });
  const { buildingId: buildingB } = await b.mutation(api.buildings.create, {
    propertyId: createdB.propertyId,
    name: "Block B",
  });
  const { unitId: unitA } = await a.mutation(api.units.create, {
    buildingId: buildingA,
    label: "A1",
    occupancyStatus: "occupied",
  });
  return { t, a, b, createdA, createdB, buildingA, buildingB, unitA };
}

describe("units.listByBuilding", () => {
  test("returns units in the building", async () => {
    const { a, buildingA, unitA } = await seedTwoWorkspacesWithUnits();
    await a.mutation(api.units.create, {
      buildingId: buildingA,
      label: "A10",
      occupancyStatus: "vacant",
    });
    const units = await a.query(api.units.listByBuilding, {
      buildingId: buildingA,
    });
    expect(units.map((u) => u.label)).toEqual(["A1", "A10"]);
    expect(units[0]._id).toEqual(unitA);
  });
});

describe("units.create", () => {
  test("derives buildingId, propertyId, and workspaceId server-side", async () => {
    const { a, createdA, buildingA } = await seedTwoWorkspacesWithUnits();
    const { unitId } = await a.mutation(api.units.create, {
      buildingId: buildingA,
      label: "A2",
      occupancyStatus: "unknown",
    });
    const units = await a.query(api.units.listByBuilding, {
      buildingId: buildingA,
    });
    const created = units.find((u) => u._id === unitId);
    expect(created).toMatchObject({
      buildingId: buildingA,
      propertyId: createdA.propertyId,
      workspaceId: createdA.workspaceId,
      label: "A2",
      occupancyStatus: "unknown",
    });
  });

  test("rejects a buildingId in another workspace", async () => {
    const { b, buildingA } = await seedTwoWorkspacesWithUnits();
    await expect(
      b.mutation(api.units.create, {
        buildingId: buildingA,
        label: "X1",
        occupancyStatus: "vacant",
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });

  test("rejects a label that is too short", async () => {
    const { a, buildingA } = await seedTwoWorkspacesWithUnits();
    await expect(
      a.mutation(api.units.create, {
        buildingId: buildingA,
        label: "   ",
        occupancyStatus: "vacant",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });
});

describe("units.update", () => {
  test("rejects a cross-workspace unitId", async () => {
    const { b, unitA } = await seedTwoWorkspacesWithUnits();
    await expect(
      b.mutation(api.units.update, {
        unitId: unitA,
        label: "Hijacked",
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });

  test("rejects an invalid occupancyStatus", async () => {
    const { a, unitA } = await seedTwoWorkspacesWithUnits();
    await expect(
      a.mutation(api.units.update, {
        unitId: unitA,
        occupancyStatus: "broken" as unknown as "occupied",
      }),
    ).rejects.toThrow();
  });
});
