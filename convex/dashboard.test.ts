// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { startOfWorkspaceWeek } from "./dashboard";

const modules = import.meta.glob("/convex/**/*.ts");

function makeBackend() {
  return convexTest(schema, modules);
}

type Backend = ReturnType<typeof makeBackend>;
type Authed = ReturnType<Backend["withIdentity"]>;

const OWNER_A = {
  subject: "user_dash_a",
  name: "Owner A",
  email: "owner-a@example.com",
};

const OWNER_B = {
  subject: "user_dash_b",
  name: "Owner B",
  email: "owner-b@example.com",
};

async function makeWorkspace(
  t: Backend,
  identity: { subject: string; name: string; email: string },
) {
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

async function createCase(
  authed: Authed,
  overrides: {
    title?: string;
    priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  } = {},
) {
  return await authed.mutation(api.cases.mutations.createManual, {
    title: "Issue",
    description: "Something needs attention.",
    category: "plumbing",
    priority: "MEDIUM",
    ...overrides,
  });
}

async function patchCase(
  t: Backend,
  caseId: Id<"cases">,
  patch: Record<string, unknown>,
) {
  await t.run(async (ctx) => {
    await ctx.db.patch("cases", caseId, patch);
  });
}

describe("dashboard.get", () => {
  test("empty workspace returns zeros and empty lists", async () => {
    const t = makeBackend();
    const authed = t.withIdentity(OWNER_A);
    await authed.mutation(api.users.syncUser, {});
    const result = await authed.query(api.dashboard.get, {});
    expect(result.metrics).toEqual({
      open: 0,
      urgent: 0,
      waitingOnVendor: 0,
      awaitingConfirmation: 0,
      resolvedThisWeek: 0,
    });
    expect(result.attention).toEqual([]);
    expect(result.upNext).toEqual([]);
    expect(result.recentActivity).toEqual([]);
    expect(result.operations).toMatchObject({ new: 0, closed: 0 });
  });

  test("open count excludes CLOSED cases", async () => {
    const t = makeBackend();
    const { authed } = await makeWorkspace(t, OWNER_A);
    const { caseId } = await createCase(authed);
    await createCase(authed, { title: "Other" });
    await patchCase(t, caseId, { status: "CLOSED" });
    const result = await authed.query(api.dashboard.get, {});
    expect(result.metrics.open).toEqual(1);
  });

  test("urgent count excludes CLOSED urgent cases", async () => {
    const t = makeBackend();
    const { authed } = await makeWorkspace(t, OWNER_A);
    const { caseId } = await createCase(authed, { priority: "URGENT" });
    await patchCase(t, caseId, { status: "CLOSED" });
    const result = await authed.query(api.dashboard.get, {});
    expect(result.metrics.urgent).toEqual(0);
  });

  test("waitingOnVendor counts only VENDOR_CONTACTED", async () => {
    const t = makeBackend();
    const { authed } = await makeWorkspace(t, OWNER_A);
    const { caseId } = await createCase(authed);
    await patchCase(t, caseId, { status: "VENDOR_CONTACTED" });
    await createCase(authed, { title: "Other" });
    const result = await authed.query(api.dashboard.get, {});
    expect(result.metrics.waitingOnVendor).toEqual(1);
  });

  test("awaitingConfirmation counts only AWAITING_CONFIRMATION", async () => {
    const t = makeBackend();
    const authed = t.withIdentity(OWNER_A);
    await authed.mutation(api.users.syncUser, {});
    await authed.mutation(api.workspace.create, {
      workspaceName: "Estate",
      timezone: "Africa/Lagos",
      currency: "NGN",
      propertyName: "Main",
      propertyAddress: "1 Main Road, Lagos",
    });
    const { caseId } = await createCase(authed);
    await patchCase(t, caseId, { status: "AWAITING_CONFIRMATION" });
    await createCase(authed, { title: "Other" });
    const result = await authed.query(api.dashboard.get, {});
    expect(result.metrics.awaitingConfirmation).toEqual(1);
  });

  test("resolvedThisWeek uses the workspace week boundary", async () => {
    const t = makeBackend();
    const authed = t.withIdentity(OWNER_A);
    await authed.mutation(api.users.syncUser, {});
    await authed.mutation(api.workspace.create, {
      workspaceName: "Estate",
      timezone: "Africa/Lagos",
      currency: "NGN",
      propertyName: "Main",
      propertyAddress: "1 Main Road, Lagos",
    });
    const weekStart = startOfWorkspaceWeek(Date.now(), "Africa/Lagos");
    const recent = await createCase(authed, { title: "Recent" });
    await patchCase(t, recent.caseId, {
      status: "RESOLVED",
      resolvedAt: weekStart + 60 * 60 * 1000,
    });
    const old = await createCase(authed, { title: "Old" });
    await patchCase(t, old.caseId, {
      status: "RESOLVED",
      resolvedAt: weekStart - 60 * 60 * 1000,
    });
    const result = await authed.query(api.dashboard.get, {});
    expect(result.metrics.resolvedThisWeek).toEqual(1);
  });

  test("operations buckets match per-status counts", async () => {
    const t = makeBackend();
    const authed = t.withIdentity(OWNER_A);
    await authed.mutation(api.users.syncUser, {});
    await authed.mutation(api.workspace.create, {
      workspaceName: "Estate",
      timezone: "Africa/Lagos",
      currency: "NGN",
      propertyName: "Main",
      propertyAddress: "1 Main Road, Lagos",
    });
    const a = await createCase(authed, { title: "Alpha issue" });
    const b = await createCase(authed, { title: "Beta issue" });
    await patchCase(t, a.caseId, { status: "TRIAGED" });
    await patchCase(t, b.caseId, { status: "CLOSED" });
    const result = await authed.query(api.dashboard.get, {});
    expect(result.operations).toMatchObject({
      new: 0,
      triaged: 1,
      closed: 1,
      resolved: 0,
    });
  });

  test("attention includes URGENT non-CLOSED cases", async () => {
    const t = makeBackend();
    const authed = t.withIdentity(OWNER_A);
    await authed.mutation(api.users.syncUser, {});
    await authed.mutation(api.workspace.create, {
      workspaceName: "Estate",
      timezone: "Africa/Lagos",
      currency: "NGN",
      propertyName: "Main",
      propertyAddress: "1 Main Road, Lagos",
    });
    const { caseId } = await createCase(authed, { priority: "URGENT" });
    const result = await authed.query(api.dashboard.get, {});
    expect(result.attention.map((c) => c._id)).toContain(caseId);
  });

  test("attention excludes CLOSED urgent cases", async () => {
    const t = makeBackend();
    const authed = t.withIdentity(OWNER_A);
    await authed.mutation(api.users.syncUser, {});
    await authed.mutation(api.workspace.create, {
      workspaceName: "Estate",
      timezone: "Africa/Lagos",
      currency: "NGN",
      propertyName: "Main",
      propertyAddress: "1 Main Road, Lagos",
    });
    const { caseId } = await createCase(authed, { priority: "URGENT" });
    await patchCase(t, caseId, { status: "CLOSED" });
    const result = await authed.query(api.dashboard.get, {});
    expect(result.attention).toEqual([]);
  });

  test("attention sorts URGENT before HIGH before MEDIUM before LOW", async () => {
    const t = makeBackend();
    const authed = t.withIdentity(OWNER_A);
    await authed.mutation(api.users.syncUser, {});
    await authed.mutation(api.workspace.create, {
      workspaceName: "Estate",
      timezone: "Africa/Lagos",
      currency: "NGN",
      propertyName: "Main",
      propertyAddress: "1 Main Road, Lagos",
    });
    // All four trigger via the stale-vendor-contact rule; priorities run
    // opposite to age so the assertion proves priority dominates time.
    const now = Date.now();
    const specs = [
      { title: "Low old", priority: "LOW", ageH: 10 },
      { title: "Medium case", priority: "MEDIUM", ageH: 7 },
      { title: "High case", priority: "HIGH", ageH: 4 },
      { title: "Urgent new", priority: "URGENT", ageH: 1 },
    ] as const;
    for (const spec of specs) {
      const { caseId } = await createCase(authed, {
        title: spec.title,
        priority: spec.priority,
      });
      await patchCase(t, caseId, {
        status: "VENDOR_CONTACTED",
        lastOutboundAt: now - 5 * 60 * 60 * 1000,
        lastActivityAt: now - spec.ageH * 60 * 60 * 1000,
      });
    }
    const result = await authed.query(api.dashboard.get, {});
    expect(result.attention.map((c) => c.priority)).toEqual([
      "URGENT",
      "HIGH",
      "MEDIUM",
      "LOW",
    ]);
  });

  test("attention caps at 10 items", async () => {
    const t = makeBackend();
    const authed = t.withIdentity(OWNER_A);
    await authed.mutation(api.users.syncUser, {});
    await authed.mutation(api.workspace.create, {
      workspaceName: "Estate",
      timezone: "Africa/Lagos",
      currency: "NGN",
      propertyName: "Main",
      propertyAddress: "1 Main Road, Lagos",
    });
    for (let i = 0; i < 12; i++) {
      await createCase(authed, { title: `Urgent ${i}`, priority: "URGENT" });
    }
    const result = await authed.query(api.dashboard.get, {});
    expect(result.attention).toHaveLength(10);
  });

  test("upNext caps at 5 and excludes CLOSED", async () => {
    const t = makeBackend();
    const authed = t.withIdentity(OWNER_A);
    await authed.mutation(api.users.syncUser, {});
    await authed.mutation(api.workspace.create, {
      workspaceName: "Estate",
      timezone: "Africa/Lagos",
      currency: "NGN",
      propertyName: "Main",
      propertyAddress: "1 Main Road, Lagos",
    });
    const now = Date.now();
    for (let i = 0; i < 6; i++) {
      const { caseId } = await createCase(authed, { title: `Case ${i}` });
      await patchCase(t, caseId, { lastActivityAt: now - i * 1000 });
    }
    const closed = await createCase(authed, { title: "Closed" });
    await patchCase(t, closed.caseId, {
      status: "CLOSED",
      lastActivityAt: now + 1000,
    });
    const result = await authed.query(api.dashboard.get, {});
    expect(result.upNext).toHaveLength(5);
    expect(
      result.upNext.some((c) => c.title === "Closed"),
    ).toEqual(false);
    expect(result.upNext.map((c) => c.title)).toEqual([
      "Case 0",
      "Case 1",
      "Case 2",
      "Case 3",
      "Case 4",
    ]);
  });

  test("recentActivity caps at 10 and orders newest first", async () => {
    const t = makeBackend();
    const authed = t.withIdentity(OWNER_A);
    await authed.mutation(api.users.syncUser, {});
    await authed.mutation(api.workspace.create, {
      workspaceName: "Estate",
      timezone: "Africa/Lagos",
      currency: "NGN",
      propertyName: "Main",
      propertyAddress: "1 Main Road, Lagos",
    });
    for (let i = 0; i < 12; i++) {
      await createCase(authed, { title: `Case ${i}` });
    }
    const result = await authed.query(api.dashboard.get, {});
    expect(result.recentActivity).toHaveLength(10);
    const times = result.recentActivity.map((a) => a.createdAt);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  test("recentActivity denormalizes caseNumber and caseTitle", async () => {
    const t = makeBackend();
    const authed = t.withIdentity(OWNER_A);
    await authed.mutation(api.users.syncUser, {});
    await authed.mutation(api.workspace.create, {
      workspaceName: "Estate",
      timezone: "Africa/Lagos",
      currency: "NGN",
      propertyName: "Main",
      propertyAddress: "1 Main Road, Lagos",
    });
    const { caseId, caseNumber } = await createCase(authed, {
      title: "Denorm check",
    });
    const result = await authed.query(api.dashboard.get, {});
    const entry = result.recentActivity.find((a) => a.caseId === caseId);
    expect(entry).toMatchObject({
      caseNumber,
      caseTitle: "Denorm check",
    });
  });

  test("cross-workspace isolation: user A sees only user A's data", async () => {
    const t = makeBackend();
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
    await createCase(a, { title: "A issue", priority: "URGENT" });
    await createCase(b, { title: "B issue", priority: "URGENT" });
    const resultA = await a.query(api.dashboard.get, {});
    expect(resultA.metrics.open).toEqual(1);
    expect(resultA.attention).toHaveLength(1);
    expect(resultA.attention[0].title).toEqual("A issue");
    expect(resultA.upNext).toHaveLength(1);
    expect(resultA.recentActivity).toHaveLength(1);
  });

  test("unauthenticated call rejects with UNAUTHENTICATED", async () => {
    const t = makeBackend();
    await expect(t.query(api.dashboard.get, {})).rejects.toMatchObject({
      data: { code: "UNAUTHENTICATED" },
    });
  });
});
