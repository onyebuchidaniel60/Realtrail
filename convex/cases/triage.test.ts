// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const modules = import.meta.glob("/convex/**/*.ts");

function makeBackend() {
  return convexTest(schema, modules);
}

type Backend = ReturnType<typeof makeBackend>;
type Authed = ReturnType<Backend["withIdentity"]>;

const OWNER = {
  subject: "user_accept_owner",
  name: "Owner",
  email: "owner@example.com",
};

const STAFF = {
  subject: "user_accept_staff",
  name: "Staff",
  email: "staff@example.com",
};

const ORIGINAL_OUTPUT = {
  title: "AI title",
  summary: "AI summary",
  category: "water",
  prioritySuggestion: "HIGH",
  propertyCandidateId: null,
  buildingCandidateId: null,
  unitCandidateId: null,
  affectedArea: null,
  missingInformation: [],
  suggestedNextAction: "Check the pump.",
  possibleRelatedCaseIds: [],
  needsReview: true,
};

async function makeWorkspace(t: Backend, identity = OWNER) {
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

async function addStaffMember(t: Backend) {
  const staff = t.withIdentity(STAFF);
  await staff.mutation(api.users.syncUser, {});
  const staffUser = await t.run(async (ctx) =>
    ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", STAFF.subject))
      .unique(),
  );
  if (staffUser === null) {
    throw new Error("staff user row missing");
  }
  const ownerMemberships = await t.run(async (ctx) =>
    ctx.db.query("workspaceMembers").collect(),
  );
  const workspaceId = ownerMemberships[0].workspaceId;
  await t.run(async (ctx) =>
    ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId: staffUser._id,
      role: "staff",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  return staff;
}

async function makeTriagedCase(
  t: Backend,
  authed: Authed,
  overrides: { priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT"; status?: string } = {},
) {
  const created = await authed.mutation(api.cases.mutations.createManual, {
    title: "Triaged issue",
    description: "Needs review.",
    category: "plumbing",
    priority: overrides.priority ?? "MEDIUM",
  });
  await t.run(async (ctx) => {
    const patch: Record<string, unknown> = {
      aiTriageStatus: "completed",
      aiTriageOutput: ORIGINAL_OUTPUT,
    };
    if (overrides.status !== undefined) {
      patch.status = overrides.status;
    }
    await ctx.db.patch("cases", created.caseId, patch);
  });
  return created.caseId;
}

async function makeProperty(t: Backend, authed: Authed, name: string) {
  const { propertyId } = await authed.mutation(api.properties.create, {
    name,
    address: `${name} address, Lagos`,
  });
  return propertyId;
}

function acceptArgs(caseId: Id<"cases">, overrides: Record<string, unknown> = {}) {
  return {
    caseId,
    title: "Confirmed leak",
    summary: "Kitchen pipe confirmed leaking.",
    category: "plumbing",
    priority: "HIGH",
    propertyId: null,
    buildingId: null,
    unitId: null,
    nextActionType: null,
    nextActionLabel: "Send the plumber.",
    locationUnknown: true,
    ...overrides,
  };
}

async function activitiesFor(t: Backend, caseId: Id<"cases">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("caseActivities")
      .withIndex("by_caseId", (q) => q.eq("caseId", caseId))
      .collect(),
  );
}

describe("cases.acceptAiTriage", () => {
  test("accepts a NEW completed case into TRIAGED", async () => {
    const t = makeBackend();
    const { authed } = await makeWorkspace(t);
    const propertyId = await makeProperty(t, authed, "Palm Grove");
    const caseId = await makeTriagedCase(t, authed);
    const result = await authed.mutation(api.cases.triage.acceptAiTriage, acceptArgs(caseId, {
      propertyId,
      locationUnknown: false,
    }) as never);
    expect(result).toEqual({ caseId, status: "TRIAGED" });
    const record = await t.run(async (ctx) => ctx.db.get("cases", caseId));
    expect(record).toMatchObject({
      status: "TRIAGED",
      title: "Confirmed leak",
      category: "plumbing",
      priority: "HIGH",
      locationUnknown: false,
    });
    expect(record?.propertyId).toBe(propertyId);
    expect(record?.triageReviewedBy).toBeDefined();
    expect(record?.triageReviewedAt).toBeDefined();
  });

  test("rejects when the case is not NEW", async () => {
    const t = makeBackend();
    const { authed } = await makeWorkspace(t);
    const caseId = await makeTriagedCase(t, authed, { status: "IN_PROGRESS" });
    await expect(
      authed.mutation(api.cases.triage.acceptAiTriage, acceptArgs(caseId) as never),
    ).rejects.toMatchObject({ data: { code: "INVALID_TRANSITION" } });
  });

  test("rejects when aiTriageStatus is not completed", async () => {
    const t = makeBackend();
    const { authed } = await makeWorkspace(t);
    const created = await authed.mutation(api.cases.mutations.createManual, {
      title: "Plain issue",
      description: "No triage here.",
      category: "plumbing",
      priority: "MEDIUM",
    });
    await expect(
      authed.mutation(api.cases.triage.acceptAiTriage, acceptArgs(created.caseId) as never),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  test("staff downgrading URGENT is rejected", async () => {
    const t = makeBackend();
    const { authed } = await makeWorkspace(t);
    const staff = await addStaffMember(t);
    const caseId = await makeTriagedCase(t, authed, { priority: "URGENT" });
    await expect(
      staff.mutation(
        api.cases.triage.acceptAiTriage,
        acceptArgs(caseId, { priority: "LOW" }) as never,
      ),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });

  test("owner downgrading URGENT is allowed", async () => {
    const t = makeBackend();
    const { authed } = await makeWorkspace(t);
    const caseId = await makeTriagedCase(t, authed, { priority: "URGENT" });
    const result = await authed.mutation(
      api.cases.triage.acceptAiTriage,
      acceptArgs(caseId, { priority: "LOW" }) as never,
    );
    expect(result.status).toBe("TRIAGED");
    const record = await t.run(async (ctx) => ctx.db.get("cases", caseId));
    expect(record?.priority).toBe("LOW");
  });

  test("rejects inconsistent property/building hierarchy", async () => {
    const t = makeBackend();
    const { authed } = await makeWorkspace(t);
    const propertyA = await makeProperty(t, authed, "Property A");
    const propertyB = await makeProperty(t, authed, "Property B");
    const { buildingId } = await authed.mutation(api.buildings.create, {
      propertyId: propertyB,
      name: "Block B",
    });
    const caseId = await makeTriagedCase(t, authed);
    await expect(
      authed.mutation(
        api.cases.triage.acceptAiTriage,
        acceptArgs(caseId, {
          propertyId: propertyA,
          buildingId,
          locationUnknown: false,
        }) as never,
      ),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  test("creates a TRIAGE_REVIEWED activity", async () => {
    const t = makeBackend();
    const { authed } = await makeWorkspace(t);
    const caseId = await makeTriagedCase(t, authed);
    await authed.mutation(
      api.cases.triage.acceptAiTriage,
      acceptArgs(caseId) as never,
    );
    const activities = await activitiesFor(t, caseId);
    const reviewed = activities.filter((a) => a.type === "TRIAGE_REVIEWED");
    expect(reviewed).toHaveLength(1);
    expect(reviewed[0]).toMatchObject({
      actorType: "user",
      summary: "AI triage reviewed and accepted",
    });
    expect(reviewed[0].actorUserId).toBeDefined();
  });

  test("preserves the original aiTriageOutput", async () => {
    const t = makeBackend();
    const { authed } = await makeWorkspace(t);
    const caseId = await makeTriagedCase(t, authed);
    await authed.mutation(
      api.cases.triage.acceptAiTriage,
      acceptArgs(caseId) as never,
    );
    const record = await t.run(async (ctx) => ctx.db.get("cases", caseId));
    expect(record?.aiTriageOutput).toEqual(ORIGINAL_OUTPUT);
  });

  test("requires a property unless location is unknown", async () => {
    const t = makeBackend();
    const { authed } = await makeWorkspace(t);
    const caseId = await makeTriagedCase(t, authed);
    await expect(
      authed.mutation(
        api.cases.triage.acceptAiTriage,
        acceptArgs(caseId, { locationUnknown: false }) as never,
      ),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  test("rejects a property together with locationUnknown", async () => {
    const t = makeBackend();
    const { authed } = await makeWorkspace(t);
    const propertyId = await makeProperty(t, authed, "Palm Grove");
    const caseId = await makeTriagedCase(t, authed);
    await expect(
      authed.mutation(
        api.cases.triage.acceptAiTriage,
        acceptArgs(caseId, { propertyId, locationUnknown: true }) as never,
      ),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });
});
