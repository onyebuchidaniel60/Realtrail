// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("/convex/**/*.ts");

function makeBackend() {
  return convexTest(schema, modules);
}

type Backend = ReturnType<typeof makeBackend>;

const OWNER_A = {
  subject: "user_vendor_a",
  name: "Owner A",
  email: "owner-a@example.com",
};

const OWNER_B = {
  subject: "user_vendor_b",
  name: "Owner B",
  email: "owner-b@example.com",
};

async function makeWorkspace(t: Backend, identity = OWNER_A) {
  const authed = t.withIdentity(identity);
  await authed.mutation(api.users.syncUser, {});
  const created = await authed.mutation(api.workspace.create, {
    workspaceName: `Estate ${identity.subject}`,
    timezone: "Africa/Lagos",
    currency: "NGN",
    propertyName: "Main Property",
    propertyAddress: "1 Main Road, Lagos",
  });
  return { authed, ...created };
}

function vendorArgs(overrides: Record<string, unknown> = {}) {
  return {
    name: "Aqua Plumbing",
    serviceCategories: ["plumbing", "water"],
    email: "hello@aqua.example.com",
    phone: "+234 801 000 0001",
    website: "https://aqua.example.com/",
    location: "Lagos",
    notes: "Reliable.",
    source: "manual",
    ...overrides,
  };
}

describe("vendors.save", () => {
  test("creates a vendor scoped to the caller's workspace", async () => {
    const t = makeBackend();
    const { authed, workspaceId } = await makeWorkspace(t);
    const { vendorId } = await authed.mutation(
      api.vendors.save,
      vendorArgs() as never,
    );
    const vendor = await t.run(async (ctx) => ctx.db.get("vendors", vendorId));
    expect(vendor).toMatchObject({
      workspaceId,
      name: "Aqua Plumbing",
      source: "manual",
    });
    expect(vendor?.serviceCategories).toEqual(["plumbing", "water"]);
  });

  test("rejects a website without a scheme", async () => {
    const t = makeBackend();
    const { authed } = await makeWorkspace(t);
    await expect(
      authed.mutation(
        api.vendors.save,
        vendorArgs({ website: "aqua.example.com" }) as never,
      ),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  test("rejects empty serviceCategories", async () => {
    const t = makeBackend();
    const { authed } = await makeWorkspace(t);
    await expect(
      authed.mutation(
        api.vendors.save,
        vendorArgs({ serviceCategories: [] }) as never,
      ),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });
});

describe("vendors.update", () => {
  test("patches allowed fields", async () => {
    const t = makeBackend();
    const { authed } = await makeWorkspace(t);
    const { vendorId } = await authed.mutation(
      api.vendors.save,
      vendorArgs() as never,
    );
    await authed.mutation(api.vendors.update, {
      vendorId,
      phone: "+234 802 000 0002",
      notes: "Updated notes.",
    });
    const vendor = await t.run(async (ctx) => ctx.db.get("vendors", vendorId));
    expect(vendor).toMatchObject({
      phone: "+234 802 000 0002",
      notes: "Updated notes.",
      name: "Aqua Plumbing",
    });
  });

  test("rejects a cross-workspace vendorId", async () => {
    const t = makeBackend();
    const a = await makeWorkspace(t, OWNER_A);
    const b = await makeWorkspace(t, OWNER_B);
    const { vendorId } = await b.authed.mutation(
      api.vendors.save,
      vendorArgs() as never,
    );
    await expect(
      a.authed.mutation(api.vendors.update, {
        vendorId,
        notes: "Sneaky edit.",
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });
});

describe("vendors.list", () => {
  test("returns only the caller's workspace vendors, ordered by name", async () => {
    const t = makeBackend();
    const a = await makeWorkspace(t, OWNER_A);
    const b = await makeWorkspace(t, OWNER_B);
    await a.authed.mutation(api.vendors.save, vendorArgs({ name: "Zeta" }) as never);
    await a.authed.mutation(api.vendors.save, vendorArgs({ name: "Alpha" }) as never);
    await b.authed.mutation(api.vendors.save, vendorArgs({ name: "Other" }) as never);
    const rows = await a.authed.query(api.vendors.list, {});
    expect(rows.map((v: { name: string }) => v.name)).toEqual(["Alpha", "Zeta"]);
  });

  test("filters by category", async () => {
    const t = makeBackend();
    const { authed } = await makeWorkspace(t);
    await authed.mutation(
      api.vendors.save,
      vendorArgs({ name: "Plumber", serviceCategories: ["plumbing"] }) as never,
    );
    await authed.mutation(
      api.vendors.save,
      vendorArgs({ name: "Sparky", serviceCategories: ["electrical"] }) as never,
    );
    const rows = await authed.query(api.vendors.list, {
      category: "electrical",
    });
    expect(rows.map((v: { name: string }) => v.name)).toEqual(["Sparky"]);
  });

  test("filters by name substring", async () => {
    const t = makeBackend();
    const { authed } = await makeWorkspace(t);
    await authed.mutation(api.vendors.save, vendorArgs({ name: "Aqua" }) as never);
    await authed.mutation(api.vendors.save, vendorArgs({ name: "Bolt" }) as never);
    const rows = await authed.query(api.vendors.list, { search: "aqu" });
    expect(rows.map((v: { name: string }) => v.name)).toEqual(["Aqua"]);
  });
});
