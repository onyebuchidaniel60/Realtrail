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
type Authed = ReturnType<Backend["withIdentity"]>;

function identityFor(tag: string) {
  return {
    subject: `user_notifread_${tag}`,
    name: `Owner ${tag}`,
    email: `owner-${tag}@example.com`,
  };
}

async function makeUser(
  t: Backend,
  tag: string,
): Promise<{ authed: Authed; userId: Id<"users">; workspaceId: Id<"workspaces"> }> {
  const authed = t.withIdentity(identityFor(tag));
  await authed.mutation(api.users.syncUser, {});
  const created = await authed.mutation(api.workspace.create, {
    workspaceName: `Estate ${tag}`,
    timezone: "Africa/Lagos",
    currency: "NGN",
    propertyName: "Main Property",
    propertyAddress: "1 Main Road, Lagos",
  });
  const userId = await t.run(async (ctx) =>
    ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) =>
        q.eq("clerkUserId", `user_notifread_${tag}`),
      )
      .unique()
      .then((u) => u!._id),
  );
  return { authed, userId, workspaceId: created.workspaceId };
}

async function seed(
  t: Backend,
  workspaceId: Id<"workspaces">,
  userId: Id<"users">,
  n: number,
): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    await t.mutation(internal.notifications.internal.createIfAbsent, {
      workspaceId,
      userId,
      caseId: undefined,
      type: "urgent_case",
      title: `Notice ${i}`,
      body: `Body ${i}`,
      dedupeKey: `seed-${userId}-${i}`,
    });
  }
}

describe("notifications.queries.list", () => {
  test("returns rows for the calling user only", async () => {
    const t = makeBackend();
    const a = await makeUser(t, "la");
    const b = await makeUser(t, "lb");
    await seed(t, a.workspaceId, a.userId, 2);
    await seed(t, b.workspaceId, b.userId, 1);
    const rows = await a.authed.query(api.notifications.queries.list, {});
    expect(rows).toHaveLength(2);
    expect(rows[0].title).toBe("Notice 1");
  });
  test("returns newest first", async () => {
    const t = makeBackend();
    const a = await makeUser(t, "ord");
    await seed(t, a.workspaceId, a.userId, 3);
    const rows = await a.authed.query(api.notifications.queries.list, {});
    expect(rows.map((r) => r.title)).toEqual([
      "Notice 2",
      "Notice 1",
      "Notice 0",
    ]);
  });

  test("respects limit and clamps at 50", async () => {
    const t = makeBackend();
    const a = await makeUser(t, "lim");
    await seed(t, a.workspaceId, a.userId, 5);
    expect(
      await a.authed.query(api.notifications.queries.list, { limit: 2 }),
    ).toHaveLength(2);
    const clamped = await a.authed.query(api.notifications.queries.list, {
      limit: 500,
    });
    expect(clamped).toHaveLength(5);
  });
});

describe("notifications.queries.unreadCount", () => {
  test("returns 0 when all read, reflects new inserts", async () => {
    const t = makeBackend();
    const a = await makeUser(t, "uc");
    expect(
      await a.authed.query(api.notifications.queries.unreadCount, {}),
    ).toEqual({ count: 0 });
    await seed(t, a.workspaceId, a.userId, 3);
    expect(
      await a.authed.query(api.notifications.queries.unreadCount, {}),
    ).toEqual({ count: 3 });
    await a.authed.mutation(api.notifications.mutations.markAllRead, {});
    expect(
      await a.authed.query(api.notifications.queries.unreadCount, {}),
    ).toEqual({ count: 0 });
  });
});
