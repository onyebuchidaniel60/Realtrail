// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const modules = import.meta.glob("/convex/**/*.ts");

function makeBackend() {
  return convexTest(schema, modules);
}

type Backend = ReturnType<typeof makeBackend>;

async function makeWorkspace(t: Backend, tag: string) {
  const authed = t.withIdentity({
    subject: `user_notif_${tag}`,
    name: `Owner ${tag}`,
    email: `owner-${tag}@example.com`,
  });
  await authed.mutation(api.users.syncUser, {});
  const created = await authed.mutation(api.workspace.create, {
    workspaceName: `Estate ${tag}`,
    timezone: "Africa/Lagos",
    currency: "NGN",
    propertyName: "Main Property",
    propertyAddress: "1 Main Road, Lagos",
  });
  return { authed, ...created };
}

async function addMember(
  t: Backend,
  workspaceId: Id<"workspaces">,
  tag: string,
  role: "manager" | "staff",
): Promise<Id<"users">> {
  const now = Date.now();
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkUserId: `user_notif_${tag}`,
      email: `${tag}@example.com`,
      name: tag,
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

function draftArgs(
  workspaceId: Id<"workspaces">,
  userId: Id<"users">,
  dedupeKey = "case-1:vendor_followup:1",
) {
  return {
    workspaceId,
    userId,
    caseId: undefined,
    type: "vendor_followup" as const,
    title: "Vendor follow-up due",
    body: "No vendor reply has arrived.",
    dedupeKey,
  };
}

describe("notifications.internal.createIfAbsent", () => {
  test("inserts once and returns the id", async () => {
    const t = makeBackend();
    const { workspaceId } = await makeWorkspace(t, "once");
    const owner = await t.run(async (ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_clerkUserId", (q) =>
          q.eq("clerkUserId", "user_notif_once"),
        )
        .unique()
        .then((u) => u!._id),
    );
    const result = await t.mutation(
      internal.notifications.internal.createIfAbsent,
      draftArgs(workspaceId, owner),
    );
    expect(result.created).toBe(true);
    const row = await t.run(async (ctx) =>
      ctx.db.get("notifications", result.notificationId),
    );
    expect(row).toMatchObject({ title: "Vendor follow-up due" });
  });

  test("is idempotent by dedupeKey", async () => {
    const t = makeBackend();
    const { workspaceId } = await makeWorkspace(t, "idem");
    const owner = await t.run(async (ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_clerkUserId", (q) =>
          q.eq("clerkUserId", "user_notif_idem"),
        )
        .unique()
        .then((u) => u!._id),
    );
    const first = await t.mutation(
      internal.notifications.internal.createIfAbsent,
      draftArgs(workspaceId, owner),
    );
    const second = await t.mutation(
      internal.notifications.internal.createIfAbsent,
      draftArgs(workspaceId, owner),
    );
    expect(first.created).toBe(true);
    expect(second).toEqual({
      created: false,
      notificationId: first.notificationId,
    });
  });

  test("rejects a cross-workspace caseId", async () => {
    const t = makeBackend();
    const a = await makeWorkspace(t, "ws-a");
    const b = await makeWorkspace(t, "ws-b");
    const ownerA = await t.run(async (ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_clerkUserId", (q) =>
          q.eq("clerkUserId", "user_notif_ws-a"),
        )
        .unique()
        .then((u) => u!._id),
    );
    const caseB = await b.authed.mutation(api.cases.mutations.createManual, {
      title: "Other",
      description: "Other workspace case.",
      category: "plumbing",
      priority: "MEDIUM",
    });
    await expect(
      t.mutation(internal.notifications.internal.createIfAbsent, {
        ...draftArgs(a.workspaceId, ownerA),
        caseId: caseB.caseId,
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });
});

describe("notifications.internal.resolveRecipients", () => {
  test("returns owner and manager, excludes staff", async () => {
    const t = makeBackend();
    const { workspaceId } = await makeWorkspace(t, "roles");
    const managerId = await addMember(t, workspaceId, "mgr", "manager");
    await addMember(t, workspaceId, "stf", "staff");
    const recipients = await t.query(
      internal.notifications.internal.resolveRecipients,
      { workspaceId },
    );
    expect(recipients).toContain(managerId);
    expect(recipients).toHaveLength(2);
    // The two entries are owner + manager (staff excluded).
    const staffRow = await t.run(async (ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", "user_notif_stf"))
        .unique(),
    );
    expect(recipients).not.toContain(staffRow!._id);
  });
});
