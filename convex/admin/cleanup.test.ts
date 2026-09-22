// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const modules = import.meta.glob("/convex/**/*.ts");

const OWNER = {
  subject: "user_cleanup_owner",
  name: "Cleanup Owner",
  email: "cleanup-owner@example.com",
};

const TOKEN_ENV = "REALTRAIL_ADMIN_CLEANUP_TOKEN";
const TOKEN = "test-cleanup-token-123";

let savedToken: string | undefined;

beforeEach(() => {
  savedToken = process.env[TOKEN_ENV];
});

afterEach(() => {
  if (savedToken === undefined) {
    delete process.env[TOKEN_ENV];
  } else {
    process.env[TOKEN_ENV] = savedToken;
  }
});

async function setupFixtureWorkspace() {
  const t = convexTest(schema, modules);
  const authed = t.withIdentity(OWNER);
  await authed.mutation(api.users.syncUser, {});
  const { workspaceId, propertyId } = await authed.mutation(
    api.workspace.create,
    {
      workspaceName: "Cleanup Estate",
      timezone: "Africa/Lagos",
      currency: "NGN",
      propertyName: "Palm Grove",
      propertyAddress: "12 Marina Road, Lagos",
    },
  );
  const { caseId } = await authed.mutation(api.cases.mutations.createManual, {
    title: "Leaking pipe in Block A",
    description: "Water leaking near the stairwell since morning.",
    propertyId,
    category: "plumbing",
    priority: "HIGH",
  });
  const { vendorId } = await authed.mutation(api.vendors.save, {
    name: "Aqua Plumbing",
    serviceCategories: ["plumbing"],
    source: "manual",
  });
  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    const me = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", OWNER.subject))
      .unique();
    const buildingId = await ctx.db.insert("buildings", {
      workspaceId,
      propertyId,
      name: "Block A",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("units", {
      workspaceId,
      propertyId,
      buildingId,
      label: "A1",
      occupancyStatus: "occupied",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("communications", {
      workspaceId,
      caseId,
      direction: "inbound",
      participantType: "resident",
      agentMailInboxId: "inbox_cleanup_1",
      agentMailThreadId: "thread_cleanup_1",
      fromEmail: "resident@example.com",
      toEmails: ["estate-1@agentmail.to"],
      subject: "Leak report",
      textBody: "Water leaking near the stairwell.",
      status: "received",
      aiDraftSource: false,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("confirmationTokens", {
      workspaceId,
      caseId,
      tokenHash: "hash_cleanup_1",
      expiresAt: now + 72 * 3600 * 1000,
      createdAt: now,
    });
    const researchId = await ctx.db.insert("vendorResearch", {
      workspaceId,
      caseId,
      query: "plumber Lagos",
      status: "completed",
      createdAt: now,
    });
    await ctx.db.insert("vendorResearchResults", {
      workspaceId,
      researchId,
      providerName: "Aqua Plumbing",
      sourceUrl: "https://aqua.example.com/",
      services: ["plumbing"],
      rankBand: "relevant",
      fetchedAt: now,
    });
    await ctx.db.insert("notifications", {
      workspaceId,
      userId: me!._id,
      caseId,
      type: "vendor_followup",
      title: "Follow up",
      body: "Vendor has not replied.",
      createdAt: now,
      dedupeKey: `${caseId}:vendor_followup:1`,
    });
    await ctx.db.insert("inboundEvents", {
      provider: "agentmail",
      providerEventId: "evt_cleanup_1",
      providerInboxId: "inbox_cleanup_1",
      eventType: "message.received",
      payloadHash: "payloadhash1",
      processingStatus: "processed",
      attempts: 1,
      createdAt: now,
    });
    return { buildingId };
  });
  // Route the workspace's inbox at the seeded events so the cleanup can
  // find them by providerInboxId.
  await t.run(async (ctx) => {
    await ctx.db.patch("workspaces", workspaceId, {
      agentMailInboxId: "inbox_cleanup_1",
      agentMailInboxAddress: "estate-1@agentmail.to",
    });
  });
  return { t, authed, workspaceId, propertyId, caseId, vendorId, ...seeded };
}

async function tableCount(
  t: ReturnType<typeof convexTest>,
  table:
    | "workspaceMembers"
    | "cases"
    | "caseActivities"
    | "caseCounters"
    | "communications"
    | "confirmationTokens"
    | "vendorResearch"
    | "vendorResearchResults"
    | "vendors"
    | "units"
    | "buildings"
    | "properties"
    | "inboundEvents"
    | "notifications"
    | "workspaces",
): Promise<number> {
  return await t.run(async (ctx) => {
    const rows = await ctx.db.query(table).take(100);
    return rows.length;
  });
}

describe("admin.cleanup.deleteWorkspace", () => {
  test("rejects when the cleanup token env var is unset", async () => {
    delete process.env[TOKEN_ENV];
    const { t, workspaceId } = await setupFixtureWorkspace();
    await expect(
      t.mutation(internal.admin.cleanup.deleteWorkspace, {
        workspaceId,
        confirmToken: TOKEN,
      }),
    ).rejects.toMatchObject({ data: { code: "INTERNAL_ERROR" } });
  });

  test("rejects on token mismatch", async () => {
    process.env[TOKEN_ENV] = TOKEN;
    const { t, workspaceId } = await setupFixtureWorkspace();
    await expect(
      t.mutation(internal.admin.cleanup.deleteWorkspace, {
        workspaceId,
        confirmToken: "wrong-token",
      }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    // Mismatch deletes nothing.
    expect(await tableCount(t, "workspaces")).toBe(1);
  });

  test("deletes the workspace and all dependents with counts", async () => {
    process.env[TOKEN_ENV] = TOKEN;
    const { t, workspaceId } = await setupFixtureWorkspace();
    const result = await t.mutation(internal.admin.cleanup.deleteWorkspace, {
      workspaceId,
      confirmToken: TOKEN,
    });
    expect(result.deleted).toBe(true);
    expect(result.counts).toMatchObject({
      workspaceMembers: 1,
      cases: 1,
      caseActivities: 1,
      communications: 1,
      confirmationTokens: 1,
      vendorResearchResults: 1,
      vendorResearch: 1,
      vendors: 1,
      units: 1,
      buildings: 1,
      properties: 1,
      inboundEvents: 1,
      notifications: 1,
      caseCounters: 1,
      workspaces: 1,
    });
    for (const table of [
      "workspaceMembers",
      "cases",
      "caseActivities",
      "caseCounters",
      "communications",
      "confirmationTokens",
      "vendorResearch",
      "vendorResearchResults",
      "vendors",
      "units",
      "buildings",
      "properties",
      "inboundEvents",
      "notifications",
      "workspaces",
    ] as const) {
      expect(await tableCount(t, table)).toBe(0);
    }
  });

  test("second call returns deleted false", async () => {
    process.env[TOKEN_ENV] = TOKEN;
    const { t, workspaceId } = await setupFixtureWorkspace();
    const first = await t.mutation(internal.admin.cleanup.deleteWorkspace, {
      workspaceId,
      confirmToken: TOKEN,
    });
    expect(first.deleted).toBe(true);
    const second = await t.mutation(internal.admin.cleanup.deleteWorkspace, {
      workspaceId,
      confirmToken: TOKEN,
    });
    expect(second).toMatchObject({ deleted: false });
  });

  test("unknown workspace id returns deleted false", async () => {
    process.env[TOKEN_ENV] = TOKEN;
    const { t, workspaceId } = await setupFixtureWorkspace();
    await t.mutation(internal.admin.cleanup.deleteWorkspace, {
      workspaceId,
      confirmToken: TOKEN,
    });
    const again = await t.mutation(internal.admin.cleanup.deleteWorkspace, {
      workspaceId: workspaceId as Id<"workspaces">,
      confirmToken: TOKEN,
    });
    expect(again.deleted).toBe(false);
  });
});
