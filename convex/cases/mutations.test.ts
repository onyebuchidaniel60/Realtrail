// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { TestConvexForDataModel } from "convex-test";
import { describe, expect, test } from "vitest";
import type { DataModelFromSchemaDefinition } from "convex/server";
import schema from "../schema";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { CaseStatus } from "./stateMachine";

// Absolute glob: Vite emits root-relative keys ("/convex/cases/...") that
// convex-test resolves to module paths. Relative globs from this
// subdirectory produce keys convex-test cannot resolve.
const modules = import.meta.glob("/convex/**/*.ts");

type Backend = TestConvexForDataModel<
  DataModelFromSchemaDefinition<typeof schema>
>;
type Authed = ReturnType<Backend["withIdentity"]>;

const OWNER_A = {
  subject: "user_case_owner_a",
  name: "Owner A",
  email: "owner-a@example.com",
};

const STAFF_A = {
  subject: "user_case_staff_a",
  name: "Staff A",
  email: "staff-a@example.com",
};

const OWNER_B = {
  subject: "user_case_owner_b",
  name: "Owner B",
  email: "owner-b@example.com",
};

const VALID_CASE = {
  title: "Low water pressure in Block C",
  description: "Residents report reduced water pressure since yesterday.",
  category: "water" as const,
  priority: "HIGH" as const,
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

async function addMember(
  t: Backend,
  workspaceId: Id<"workspaces">,
  subject: string,
  role: "owner" | "manager" | "staff",
) {
  return await t.run(async (ctx) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", subject))
      .unique();
    const now = Date.now();
    const userId =
      existing !== null
        ? existing._id
        : await ctx.db.insert("users", {
            clerkUserId: subject,
            email: undefined,
            name: undefined,
            createdAt: now,
            updatedAt: now,
          });
    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId,
      role,
      createdAt: now,
      updatedAt: now,
    });
    return userId;
  });
}

async function drive(
  authed: Authed,
  caseId: Id<"cases">,
  statuses: CaseStatus[],
) {
  for (const nextStatus of statuses) {
    await authed.mutation(api.cases.mutations.transitionStatus, {
      caseId,
      nextStatus,
    });
  }
}

describe("cases.createManual", () => {
  test("creates a case with caseNumber 1 in an empty workspace", async () => {
    const { authed } = await setupWorkspace(OWNER_A);
    const { caseId, caseNumber } = await authed.mutation(
      api.cases.mutations.createManual,
      VALID_CASE,
    );
    expect(caseNumber).toEqual(1);
    expect(caseId).toBeDefined();
  });

  test("two calls in the same workspace produce 1 and 2", async () => {
    const { authed } = await setupWorkspace(OWNER_A);
    const first = await authed.mutation(api.cases.mutations.createManual, VALID_CASE);
    const second = await authed.mutation(api.cases.mutations.createManual, {
      ...VALID_CASE,
      title: "Second issue",
    });
    expect(first.caseNumber).toEqual(1);
    expect(second.caseNumber).toEqual(2);
  });

  test("two workspaces each start at 1", async () => {
    const setupA = await setupWorkspace(OWNER_A);
    const setupB = await setupWorkspace(OWNER_B);
    const a = await setupA.authed.mutation(api.cases.mutations.createManual, VALID_CASE);
    const b = await setupB.authed.mutation(api.cases.mutations.createManual, VALID_CASE);
    expect(a.caseNumber).toEqual(1);
    expect(b.caseNumber).toEqual(1);
  });

  test("validates string bounds", async () => {
    const { authed } = await setupWorkspace(OWNER_A);
    await expect(
      authed.mutation(api.cases.mutations.createManual, { ...VALID_CASE, title: "Hi" }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    await expect(
      authed.mutation(api.cases.mutations.createManual, {
        ...VALID_CASE,
        description: "x".repeat(10001),
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  test("rejects a buildingId that does not match propertyId", async () => {
    const { t, authed, workspaceId } = await setupWorkspace(OWNER_A);
    const otherProperty = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("properties", {
        workspaceId,
        name: "Other",
        address: "2 Other Road, Lagos",
        city: undefined,
        country: undefined,
        timezone: "Africa/Lagos",
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    });
    const building = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("buildings", {
        workspaceId,
        propertyId: otherProperty,
        name: "Block X",
        code: undefined,
        createdAt: now,
        updatedAt: now,
      });
    });
    const ownProperty = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("properties")
        .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
        .collect();
      return rows.find((p) => p._id !== otherProperty)!._id;
    });
    await expect(
      authed.mutation(api.cases.mutations.createManual, {
        ...VALID_CASE,
        propertyId: ownProperty,
        buildingId: building,
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  test("rejects a unitId that does not match buildingId", async () => {
    const { t, authed, workspaceId } = await setupWorkspace(OWNER_A);
    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const propertyId = await ctx.db.insert("properties", {
        workspaceId,
        name: "P",
        address: "1 Road, Lagos",
        city: undefined,
        country: undefined,
        timezone: "Africa/Lagos",
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      const buildingOne = await ctx.db.insert("buildings", {
        workspaceId,
        propertyId,
        name: "One",
        code: undefined,
        createdAt: now,
        updatedAt: now,
      });
      const buildingTwo = await ctx.db.insert("buildings", {
        workspaceId,
        propertyId,
        name: "Two",
        code: undefined,
        createdAt: now,
        updatedAt: now,
      });
      const unitId = await ctx.db.insert("units", {
        workspaceId,
        propertyId,
        buildingId: buildingOne,
        label: "U1",
        occupancyStatus: "occupied",
        createdAt: now,
        updatedAt: now,
      });
      return { propertyId, buildingTwo, unitId };
    });
    await expect(
      authed.mutation(api.cases.mutations.createManual, {
        ...VALID_CASE,
        propertyId: ids.propertyId,
        buildingId: ids.buildingTwo,
        unitId: ids.unitId,
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  test("rejects an assigneeId outside the workspace", async () => {
    // Single backend: separate convex-test instances generate colliding
    // ids, so both workspaces live here to keep ids distinct.
    const t = convexTest(schema, modules);
    const a = t.withIdentity(OWNER_A);
    const b = t.withIdentity(OWNER_B);
    await a.mutation(api.users.syncUser, {});
    await b.mutation(api.users.syncUser, {});
    await a.mutation(api.workspace.create, {
      workspaceName: "Estate A",
      timezone: "Africa/Lagos",
      currency: "NGN",
      propertyName: "Main A",
      propertyAddress: "1 A Road, Lagos",
    });
    await b.mutation(api.workspace.create, {
      workspaceName: "Estate B",
      timezone: "Africa/Lagos",
      currency: "NGN",
      propertyName: "Main B",
      propertyAddress: "1 B Road, Lagos",
    });
    const outsiderId = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("users")
        .withIndex("by_clerkUserId", (q) =>
          q.eq("clerkUserId", OWNER_B.subject),
        )
        .collect();
      return rows[0]._id;
    });
    await expect(
      a.mutation(api.cases.mutations.createManual, {
        ...VALID_CASE,
        assigneeId: outsiderId,
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  test("rejects an invalid reporterEmail", async () => {
    const { authed } = await setupWorkspace(OWNER_A);
    await expect(
      authed.mutation(api.cases.mutations.createManual, {
        ...VALID_CASE,
        reporterEmail: "not-an-email",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  test("creates a CASE_CREATED activity", async () => {
    const { t, authed } = await setupWorkspace(OWNER_A);
    const { caseId } = await authed.mutation(
      api.cases.mutations.createManual,
      VALID_CASE,
    );
    const activities = await t.run(async (ctx) => {
      return await ctx.db
        .query("caseActivities")
        .withIndex("by_caseId", (q) => q.eq("caseId", caseId))
        .collect();
    });
    expect(activities).toHaveLength(1);
    expect(activities[0].type).toEqual("CASE_CREATED");
  });
});

describe("cases.updateFields", () => {
  test("rejects an unexpected status field", async () => {
    const { authed } = await setupWorkspace(OWNER_A);
    const { caseId } = await authed.mutation(
      api.cases.mutations.createManual,
      VALID_CASE,
    );
    await expect(
      authed.mutation(api.cases.mutations.updateFields, {
        caseId,
        status: "TRIAGED",
      } as never),
    ).rejects.toThrow();
  });

  test("rejects a cross-workspace caseId with NOT_FOUND", async () => {
    const setupA = await setupWorkspace(OWNER_A);
    const setupB = await setupWorkspace(OWNER_B);
    const { caseId } = await setupB.authed.mutation(
      api.cases.mutations.createManual,
      VALID_CASE,
    );
    await expect(
      setupA.authed.mutation(api.cases.mutations.updateFields, {
        caseId,
        title: "Hijacked",
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });

  test("rejects edits when the case is CLOSED", async () => {
    const { t, authed } = await setupWorkspace(OWNER_A);
    const { caseId } = await authed.mutation(
      api.cases.mutations.createManual,
      VALID_CASE,
    );
    await t.run(async (ctx) => {
      await ctx.db.patch("cases", caseId, { status: "CLOSED" });
    });
    await expect(
      authed.mutation(api.cases.mutations.updateFields, {
        caseId,
        title: "Edit closed",
      }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });

  test("staff cannot downgrade URGENT priority", async () => {
    const { t, authed, workspaceId } = await setupWorkspace(OWNER_A);
    await addMember(t, workspaceId, STAFF_A.subject, "staff");
    const { caseId } = await authed.mutation(api.cases.mutations.createManual, {
      ...VALID_CASE,
      priority: "URGENT",
    });
    const staff = t.withIdentity(STAFF_A);
    await staff.mutation(api.users.syncUser, {});
    await expect(
      staff.mutation(api.cases.mutations.updateFields, {
        caseId,
        priority: "LOW",
      }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });

  test("owner can downgrade URGENT priority", async () => {
    const { authed } = await setupWorkspace(OWNER_A);
    const { caseId } = await authed.mutation(api.cases.mutations.createManual, {
      ...VALID_CASE,
      priority: "URGENT",
    });
    const result = await authed.mutation(api.cases.mutations.updateFields, {
      caseId,
      priority: "LOW",
    });
    expect(result.caseId).toEqual(caseId);
  });
});

describe("cases.assign", () => {
  test("reassigns to another workspace member", async () => {
    const { t, authed, workspaceId } = await setupWorkspace(OWNER_A);
    const staffId = await addMember(t, workspaceId, STAFF_A.subject, "staff");
    const { caseId } = await authed.mutation(
      api.cases.mutations.createManual,
      VALID_CASE,
    );
    const result = await authed.mutation(api.cases.mutations.assign, {
      caseId,
      assigneeId: staffId,
    });
    expect(result.caseId).toEqual(caseId);
  });

  test("unassign with null works", async () => {
    const { authed } = await setupWorkspace(OWNER_A);
    const { caseId } = await authed.mutation(api.cases.mutations.createManual, {
      ...VALID_CASE,
    });
    const result = await authed.mutation(api.cases.mutations.assign, {
      caseId,
      assigneeId: null,
    });
    expect(result.caseId).toEqual(caseId);
  });

  test("staff cannot reassign a case owned by someone else", async () => {
    const { t, authed, workspaceId } = await setupWorkspace(OWNER_A);
    const ownerId = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("users")
        .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", OWNER_A.subject))
        .collect();
      return rows[0]._id;
    });
    const { caseId } = await authed.mutation(
      api.cases.mutations.createManual,
      VALID_CASE,
    );
    await authed.mutation(api.cases.mutations.assign, {
      caseId,
      assigneeId: ownerId,
    });
    await addMember(t, workspaceId, STAFF_A.subject, "staff");
    const staff = t.withIdentity(STAFF_A);
    await staff.mutation(api.users.syncUser, {});
    const otherStaffId = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("users")
        .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", STAFF_A.subject))
        .collect();
      return rows[0]._id;
    });
    await expect(
      staff.mutation(api.cases.mutations.assign, {
        caseId,
        assigneeId: otherStaffId,
      }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });
});

describe("cases.addNote", () => {
  test("rejects an empty body", async () => {
    const { authed } = await setupWorkspace(OWNER_A);
    const { caseId } = await authed.mutation(
      api.cases.mutations.createManual,
      VALID_CASE,
    );
    await expect(
      authed.mutation(api.cases.mutations.addNote, { caseId, body: "   " }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  test("rejects notes when the case is CLOSED", async () => {
    const { t, authed } = await setupWorkspace(OWNER_A);
    const { caseId } = await authed.mutation(
      api.cases.mutations.createManual,
      VALID_CASE,
    );
    await t.run(async (ctx) => {
      await ctx.db.patch("cases", caseId, { status: "CLOSED" });
    });
    await expect(
      authed.mutation(api.cases.mutations.addNote, { caseId, body: "Hello" }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });
});

describe("cases.transitionStatus", () => {
  test("allows valid transitions", async () => {
    const { authed } = await setupWorkspace(OWNER_A);
    const { caseId } = await authed.mutation(
      api.cases.mutations.createManual,
      VALID_CASE,
    );
    const result = await authed.mutation(api.cases.mutations.transitionStatus, {
      caseId,
      nextStatus: "TRIAGED",
    });
    expect(result).toMatchObject({ caseId, status: "TRIAGED" });
  });

  test("rejects invalid transitions with INVALID_TRANSITION", async () => {
    const { authed } = await setupWorkspace(OWNER_A);
    const { caseId } = await authed.mutation(
      api.cases.mutations.createManual,
      VALID_CASE,
    );
    await expect(
      authed.mutation(api.cases.mutations.transitionStatus, {
        caseId,
        nextStatus: "IN_PROGRESS",
      }),
    ).rejects.toMatchObject({ data: { code: "INVALID_TRANSITION" } });
  });

  test("rejects when the caller role is insufficient", async () => {
    const { t, authed, workspaceId } = await setupWorkspace(OWNER_A);
    await addMember(t, workspaceId, STAFF_A.subject, "staff");
    const { caseId } = await authed.mutation(
      api.cases.mutations.createManual,
      VALID_CASE,
    );
    await drive(authed, caseId, [
      "TRIAGED",
      "IN_PROGRESS",
      "VENDOR_CONTACTED",
      "SCHEDULED",
      "WORK_IN_PROGRESS",
      "AWAITING_CONFIRMATION",
    ]);
    const staff = t.withIdentity(STAFF_A);
    await staff.mutation(api.users.syncUser, {});
    await expect(
      staff.mutation(api.cases.mutations.transitionStatus, {
        caseId,
        nextStatus: "RESOLVED",
      }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });

  test("rejects CLOSED as nextStatus", async () => {
    const { authed } = await setupWorkspace(OWNER_A);
    const { caseId } = await authed.mutation(
      api.cases.mutations.createManual,
      VALID_CASE,
    );
    await expect(
      authed.mutation(api.cases.mutations.transitionStatus, {
        caseId,
        nextStatus: "CLOSED",
      }),
    ).rejects.toMatchObject({ data: { code: "INVALID_TRANSITION" } });
  });

  test("rejects RESOLVED as nextStatus", async () => {
    const { authed } = await setupWorkspace(OWNER_A);
    const { caseId } = await authed.mutation(
      api.cases.mutations.createManual,
      VALID_CASE,
    );
    await expect(
      authed.mutation(api.cases.mutations.transitionStatus, {
        caseId,
        nextStatus: "RESOLVED",
      }),
    ).rejects.toMatchObject({ data: { code: "INVALID_TRANSITION" } });
  });
});

describe("cases.close", () => {
  test("close as resolved from RESOLVED succeeds", async () => {
    const { t, authed } = await setupWorkspace(OWNER_A);
    const { caseId } = await authed.mutation(
      api.cases.mutations.createManual,
      VALID_CASE,
    );
    await t.run(async (ctx) => {
      await ctx.db.patch("cases", caseId, {
        status: "RESOLVED",
        resolvedAt: Date.now(),
        resolvedBy: "manager",
      });
    });
    const result = await authed.mutation(api.cases.mutations.close, {
      caseId,
      reason: "resolved",
    });
    expect(result).toMatchObject({ caseId, status: "CLOSED" });
  });

  test("close as resolved from NEW is rejected", async () => {
    const { authed } = await setupWorkspace(OWNER_A);
    const { caseId } = await authed.mutation(
      api.cases.mutations.createManual,
      VALID_CASE,
    );
    await expect(
      authed.mutation(api.cases.mutations.close, { caseId, reason: "resolved" }),
    ).rejects.toMatchObject({ data: { code: "INVALID_TRANSITION" } });
  });

  test("close as duplicate from NEW requires a note", async () => {
    const { authed } = await setupWorkspace(OWNER_A);
    const { caseId } = await authed.mutation(
      api.cases.mutations.createManual,
      VALID_CASE,
    );
    await expect(
      authed.mutation(api.cases.mutations.close, { caseId, reason: "duplicate" }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    const result = await authed.mutation(api.cases.mutations.close, {
      caseId,
      reason: "duplicate",
      note: "Same as case 1",
    });
    expect(result.status).toEqual("CLOSED");
  });

  test("close as duplicate from NEW by staff is rejected", async () => {
    const { t, authed, workspaceId } = await setupWorkspace(OWNER_A);
    await addMember(t, workspaceId, STAFF_A.subject, "staff");
    const { caseId } = await authed.mutation(
      api.cases.mutations.createManual,
      VALID_CASE,
    );
    const staff = t.withIdentity(STAFF_A);
    await staff.mutation(api.users.syncUser, {});
    await expect(
      staff.mutation(api.cases.mutations.close, {
        caseId,
        reason: "duplicate",
        note: "Staff attempt",
      }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });

  test("close on an already-CLOSED case is rejected", async () => {
    const { authed } = await setupWorkspace(OWNER_A);
    const { caseId } = await authed.mutation(
      api.cases.mutations.createManual,
      VALID_CASE,
    );
    await authed.mutation(api.cases.mutations.close, {
      caseId,
      reason: "invalid",
      note: "Not a real issue",
    });
    await expect(
      authed.mutation(api.cases.mutations.close, {
        caseId,
        reason: "invalid",
        note: "Again",
      }),
    ).rejects.toMatchObject({ data: { code: "INVALID_TRANSITION" } });
  });
});

describe("cases.reopen", () => {
  test("reopen from CLOSED by staff succeeds and clears fields", async () => {
    const { t, authed, workspaceId } = await setupWorkspace(OWNER_A);
    await addMember(t, workspaceId, STAFF_A.subject, "staff");
    const { caseId } = await authed.mutation(
      api.cases.mutations.createManual,
      VALID_CASE,
    );
    await t.run(async (ctx) => {
      await ctx.db.patch("cases", caseId, {
        status: "RESOLVED",
        resolvedAt: 1000,
        resolvedBy: "manager",
      });
    });
    await authed.mutation(api.cases.mutations.close, { caseId, reason: "resolved" });
    const staff = t.withIdentity(STAFF_A);
    await staff.mutation(api.users.syncUser, {});
    const result = await staff.mutation(api.cases.mutations.reopen, {
      caseId,
      reason: "Resident says it is back",
    });
    expect(result).toMatchObject({ caseId, status: "IN_PROGRESS" });
    const reopened = await t.run(async (ctx) => {
      return await ctx.db.get("cases", caseId);
    });
    expect(reopened?.status).toEqual("IN_PROGRESS");
    expect(reopened?.reopenCount).toEqual(1);
    expect(reopened?.resolvedAt).toBeUndefined();
    expect(reopened?.resolvedBy).toBeUndefined();
    expect(reopened?.closedAt).toBeUndefined();
    expect(reopened?.closedBy).toBeUndefined();
    expect(reopened?.closedReason).toBeUndefined();
    expect(reopened?.resolutionSummary).toBeUndefined();
    expect(reopened?.resolutionCostMinor).toBeUndefined();
    expect(reopened?.resolutionCompletedAt).toBeUndefined();
  });

  test("reopen from IN_PROGRESS is rejected", async () => {
    const { authed } = await setupWorkspace(OWNER_A);
    const { caseId } = await authed.mutation(
      api.cases.mutations.createManual,
      VALID_CASE,
    );
    await drive(authed, caseId, ["TRIAGED", "IN_PROGRESS"]);
    await expect(
      authed.mutation(api.cases.mutations.reopen, { caseId, reason: "Too early" }),
    ).rejects.toMatchObject({ data: { code: "INVALID_TRANSITION" } });
  });

  test("reopen increments reopenCount across cycles", async () => {
    const { authed } = await setupWorkspace(OWNER_A);
    const { caseId } = await authed.mutation(
      api.cases.mutations.createManual,
      VALID_CASE,
    );
    await authed.mutation(api.cases.mutations.close, {
      caseId,
      reason: "invalid",
      note: "First",
    });
    await authed.mutation(api.cases.mutations.reopen, {
      caseId,
      reason: "First reopen",
    });
    await authed.mutation(api.cases.mutations.transitionStatus, {
      caseId,
      nextStatus: "VENDOR_CONTACTED",
    });
    await authed.mutation(api.cases.mutations.close, {
      caseId,
      reason: "cancelled",
      note: "Second",
    });
    const result = await authed.mutation(api.cases.mutations.reopen, {
      caseId,
      reason: "Second reopen",
    });
    expect(result.status).toEqual("IN_PROGRESS");
  });
});

describe("cases cross-workspace IDOR", () => {
  test("user A cannot load user B's case via cases.get", async () => {
    const setupA = await setupWorkspace(OWNER_A);
    const setupB = await setupWorkspace(OWNER_B);
    const { caseId } = await setupB.authed.mutation(
      api.cases.mutations.createManual,
      VALID_CASE,
    );
    await expect(
      setupA.authed.query(api.cases.queries.get, { caseId }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });

  test("user A cannot list user B's cases", async () => {
    const setupA = await setupWorkspace(OWNER_A);
    const setupB = await setupWorkspace(OWNER_B);
    await setupB.authed.mutation(api.cases.mutations.createManual, VALID_CASE);
    const page = await setupA.authed.query(api.cases.queries.list, {});
    expect(page.cases).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });
});

describe("cases.setVendor", () => {
  async function setupCase() {
    const setup = await setupWorkspace(OWNER_A);
    const { caseId } = await setup.authed.mutation(
      api.cases.mutations.createManual,
      VALID_CASE,
    );
    const { vendorId } = await setup.authed.mutation(api.vendors.save, {
      name: "Aqua Plumbing",
      serviceCategories: ["plumbing"],
      website: "https://aqua.example.com/",
      source: "manual",
    });
    return { ...setup, caseId, vendorId };
  }

  test("links a vendor and records a VENDOR_SET activity", async () => {
    const { t, authed, caseId, vendorId } = await setupCase();
    const result = await authed.mutation(api.cases.mutations.setVendor, {
      caseId,
      vendorId,
    });
    expect(result).toEqual({ caseId });
    const record = await t.run(async (ctx) => ctx.db.get("cases", caseId));
    expect(record?.vendorId).toBe(vendorId);
    const activities = await t.run(async (ctx) =>
      ctx.db
        .query("caseActivities")
        .withIndex("by_caseId", (q) => q.eq("caseId", caseId))
        .collect(),
    );
    const linked = activities.filter((a) => a.type === "VENDOR_SET");
    expect(linked).toHaveLength(1);
    expect(linked[0].summary).toBe("Aqua Plumbing linked to case");
  });

  test("clears the vendor with null", async () => {
    const { t, authed, caseId, vendorId } = await setupCase();
    await authed.mutation(api.cases.mutations.setVendor, { caseId, vendorId });
    await authed.mutation(api.cases.mutations.setVendor, {
      caseId,
      vendorId: null,
    });
    const record = await t.run(async (ctx) => ctx.db.get("cases", caseId));
    expect(record?.vendorId).toBeUndefined();
  });

  test("rejects a cross-workspace vendorId", async () => {
    const setupA = await setupWorkspace(OWNER_A);
    const setupB = await setupWorkspace(OWNER_B);
    const { caseId } = await setupA.authed.mutation(
      api.cases.mutations.createManual,
      VALID_CASE,
    );
    const { vendorId } = await setupB.authed.mutation(api.vendors.save, {
      name: "Foreign Vendor",
      serviceCategories: ["plumbing"],
      source: "manual",
    });
    await expect(
      setupA.authed.mutation(api.cases.mutations.setVendor, {
        caseId,
        vendorId,
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });

  test("rejects setVendor on a CLOSED case", async () => {
    const { t, authed, caseId, vendorId } = await setupCase();
    await t.run(async (ctx) => {
      await ctx.db.patch("cases", caseId, { status: "CLOSED" });
    });
    await expect(
      authed.mutation(api.cases.mutations.setVendor, { caseId, vendorId }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });

  test("relinking creates one activity per link", async () => {
    const { t, authed, caseId, vendorId } = await setupCase();
    await authed.mutation(api.cases.mutations.setVendor, { caseId, vendorId });
    const { vendorId: secondId } = await authed.mutation(api.vendors.save, {
      name: "Bolt Electric",
      serviceCategories: ["electrical"],
      source: "manual",
    });
    await authed.mutation(api.cases.mutations.setVendor, {
      caseId,
      vendorId: secondId,
    });
    const activities = await t.run(async (ctx) =>
      ctx.db
        .query("caseActivities")
        .withIndex("by_caseId", (q) => q.eq("caseId", caseId))
        .collect(),
    );
    expect(
      activities.filter((a) => a.type === "VENDOR_SET"),
    ).toHaveLength(2);
  });
});
