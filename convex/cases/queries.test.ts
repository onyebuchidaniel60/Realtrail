// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { TestConvexForDataModel } from "convex-test";
import { describe, expect, test } from "vitest";
import type { DataModelFromSchemaDefinition } from "convex/server";
import schema from "../schema";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { Category, Priority } from "./stateMachine";

// Absolute glob: see comment in mutations.test.ts.
const modules = import.meta.glob("/convex/**/*.ts");

type Backend = TestConvexForDataModel<
  DataModelFromSchemaDefinition<typeof schema>
>;
type Authed = ReturnType<Backend["withIdentity"]>;

const OWNER_A = {
  subject: "user_q_owner_a",
  name: "Owner A",
  email: "owner-a@example.com",
};

const STAFF_A = {
  subject: "user_q_staff_a",
  name: "Staff A",
  email: "staff-a@example.com",
};

const OWNER_B = {
  subject: "user_q_owner_b",
  name: "Owner B",
  email: "owner-b@example.com",
};

async function setupWorkspace(identity: {
  subject: string;
  name: string;
  email: string;
}) {
  const t = convexTest(schema, modules);
  const authed = t.withIdentity(identity);
  await authed.mutation(api.users.syncUser, {});
  const created = await authed.mutation(api.workspace.create, {
    workspaceName: `Estate ${identity.subject}`,
    timezone: "Africa/Lagos",
    currency: "NGN",
    propertyName: "Main Property",
    propertyAddress: "1 Main Road, Lagos",
  });
  return { t, authed, ...created };
}

async function addStaffMember(t: Backend, workspaceId: Id<"workspaces">) {
  const staff = t.withIdentity(STAFF_A);
  await staff.mutation(api.users.syncUser, {});
  await t.run(async (ctx) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", STAFF_A.subject))
      .collect();
    const now = Date.now();
    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId: users[0]._id,
      role: "staff",
      createdAt: now,
      updatedAt: now,
    });
  });
  return staff;
}

async function createCase(
  authed: Authed,
  overrides: {
    title?: string;
    description?: string;
    category?: Category;
    priority?: Priority;
  } = {},
) {
  return await authed.mutation(api.cases.mutations.createManual, {
    title: "Leaking tap",
    description: "Tap leaks in the kitchen.",
    category: "plumbing",
    priority: "MEDIUM",
    ...overrides,
  });
}

describe("cases.get", () => {
  test("returns case, activities, and allowedActions for a member", async () => {
    const { authed } = await setupWorkspace(OWNER_A);
    const { caseId } = await createCase(authed);
    const result = await authed.query(api.cases.queries.get, { caseId });
    expect(result.case._id).toEqual(caseId);
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].type).toEqual("CASE_CREATED");
    expect(result.allowedActions.canTransitionTo).toEqual(["TRIAGED"]);
    expect(result.allowedActions.canClose).toMatchObject({
      resolved: false,
      duplicate: true,
      invalid: true,
      cancelled: true,
    });
    expect(result.allowedActions.canReopen).toEqual(false);
    expect(result.allowedActions.canAssign).toEqual(true);
    expect(result.allowedActions.canEdit).toEqual(true);
  });

  test("returns NOT_FOUND for a cross-workspace caseId", async () => {
    const setupA = await setupWorkspace(OWNER_A);
    const setupB = await setupWorkspace(OWNER_B);
    const { caseId } = await createCase(setupB.authed);
    await expect(
      setupA.authed.query(api.cases.queries.get, { caseId }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });

  test("allowedActions reflects role: staff cannot close as resolved", async () => {
    const { t, authed, workspaceId } = await setupWorkspace(OWNER_A);
    const staff = await addStaffMember(t, workspaceId);
    const { caseId } = await createCase(authed);
    const result = await staff.query(api.cases.queries.get, { caseId });
    expect(result.allowedActions.canClose.resolved).toEqual(false);
    expect(result.allowedActions.canTransitionTo).toEqual(["TRIAGED"]);
    expect(result.allowedActions.canReopen).toEqual(false);
  });
});

describe("cases.list", () => {
  test("returns only workspace cases", async () => {
    const setupA = await setupWorkspace(OWNER_A);
    const setupB = await setupWorkspace(OWNER_B);
    await createCase(setupA.authed, { title: "A issue" });
    await createCase(setupB.authed, { title: "B issue" });
    const page = await setupA.authed.query(api.cases.queries.list, {});
    expect(page.cases).toHaveLength(1);
    expect(page.cases[0].title).toEqual("A issue");
    expect(page.nextCursor).toBeNull();
  });

  test("filters by status", async () => {
    const { authed } = await setupWorkspace(OWNER_A);
    const { caseId } = await createCase(authed);
    await createCase(authed, { title: "Other issue" });
    await authed.mutation(api.cases.mutations.transitionStatus, {
      caseId,
      nextStatus: "TRIAGED",
    });
    const triaged = await authed.query(api.cases.queries.list, {
      status: "TRIAGED",
    });
    expect(triaged.cases).toHaveLength(1);
    expect(triaged.cases[0]._id).toEqual(caseId);
    const fresh = await authed.query(api.cases.queries.list, { status: "NEW" });
    expect(fresh.cases).toHaveLength(1);
  });

  test("filters by priority", async () => {
    const { authed } = await setupWorkspace(OWNER_A);
    await createCase(authed, { priority: "URGENT" });
    await createCase(authed, { priority: "LOW" });
    const urgent = await authed.query(api.cases.queries.list, {
      priority: "URGENT",
    });
    expect(urgent.cases).toHaveLength(1);
    expect(urgent.cases[0].priority).toEqual("URGENT");
  });

  test("search matches title and description", async () => {
    const { authed } = await setupWorkspace(OWNER_A);
    await createCase(authed, {
      title: "Broken elevator",
      description: "Unrelated matter.",
    });
    await createCase(authed, {
      title: "Routine check",
      description: "The water pump hums loudly.",
    });
    const byTitle = await authed.query(api.cases.queries.list, {
      search: "elevator",
    });
    expect(byTitle.cases.map((c) => c.title)).toEqual(["Broken elevator"]);
    const byDescription = await authed.query(api.cases.queries.list, {
      search: "PUMP",
    });
    expect(byDescription.cases.map((c) => c.title)).toEqual([
      "Routine check",
    ]);
  });

  test("filters by category", async () => {
    const { authed } = await setupWorkspace(OWNER_A);
    await createCase(authed, { category: "electrical" });
    await createCase(authed, { category: "water" });
    const electrical = await authed.query(api.cases.queries.list, {
      category: "electrical",
    });
    expect(electrical.cases).toHaveLength(1);
    expect(electrical.cases[0].category).toEqual("electrical");
  });

  test("respects pageSize", async () => {
    const { authed } = await setupWorkspace(OWNER_A);
    await createCase(authed, { title: "One" });
    await createCase(authed, { title: "Two" });
    const page = await authed.query(api.cases.queries.list, { pageSize: 1 });
    expect(page.cases).toHaveLength(1);
    expect(page.nextCursor).not.toBeNull();
  });

  test("cursor paginates without duplicating or skipping", async () => {
    const { authed } = await setupWorkspace(OWNER_A);
    await createCase(authed, { title: "One" });
    await createCase(authed, { title: "Two" });
    await createCase(authed, { title: "Three" });
    const seen: string[] = [];
    let cursor: string | null | undefined;
    do {
      const page = await authed.query(
        api.cases.queries.list,
        cursor ? { pageSize: 1, cursor } : { pageSize: 1 },
      );
      for (const record of page.cases) {
        seen.push(record._id);
      }
      cursor = page.nextCursor;
    } while (cursor !== null);
    expect(seen).toHaveLength(3);
    expect(new Set(seen).size).toEqual(3);
  });
});

describe("cases.get vendor summary", () => {
  test("returns vendor null when no vendor is linked", async () => {
    const { authed } = await setupWorkspace(OWNER_A);
    const { caseId } = await authed.mutation(api.cases.mutations.createManual, {
      title: "Leak",
      description: "Kitchen leak needs attention.",
      category: "plumbing",
      priority: "MEDIUM",
    });
    const result = await authed.query(api.cases.queries.get, { caseId });
    expect(result.vendor).toBeNull();
  });

  test("returns the linked vendor summary", async () => {
    const { authed } = await setupWorkspace(OWNER_A);
    const { caseId } = await authed.mutation(api.cases.mutations.createManual, {
      title: "Leak",
      description: "Kitchen leak needs attention.",
      category: "plumbing",
      priority: "MEDIUM",
    });
    const { vendorId } = await authed.mutation(api.vendors.save, {
      name: "Aqua Plumbing",
      serviceCategories: ["plumbing"],
      email: "hello@aqua.example.com",
      website: "https://aqua.example.com/",
      source: "manual",
    });
    await authed.mutation(api.cases.mutations.setVendor, {
      caseId,
      vendorId,
    });
    const result = await authed.query(api.cases.queries.get, { caseId });
    expect(result.vendor).toMatchObject({
      _id: vendorId,
      name: "Aqua Plumbing",
      email: "hello@aqua.example.com",
      website: "https://aqua.example.com/",
    });
    expect(result.vendor?.serviceCategories).toEqual(["plumbing"]);
  });
});
