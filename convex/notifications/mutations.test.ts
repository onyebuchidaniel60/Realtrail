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
    subject: `user_notifmut_${tag}`,
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
        q.eq("clerkUserId", `user_notifmut_${tag}`),
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
  key: string,
): Promise<Id<"notifications">> {
  const result = await t.mutation(
    internal.notifications.internal.createIfAbsent,
    {
      workspaceId,
      userId,
      caseId: undefined,
      type: "urgent_case",
      title: `Notice ${key}`,
      body: `Body ${key}`,
      dedupeKey: `mut-${userId}-${key}`,
    },
  );
  return result.notificationId;
}

describe("notifications.mutations.markRead", () => {
  test("patches readAt and is idempotent", async () => {
    const t = makeBackend();
    const a = await makeUser(t, "mr");
    const id = await seed(t, a.workspaceId, a.userId, "one");
    const result = await a.authed.mutation(
      api.notifications.mutations.markRead,
      { notificationId: id },
    );
    expect(result).toEqual({ notificationId: id });
    const first = await t.run(async (ctx) =>
      ctx.db.get("notifications", id),
    );
    expect(first?.readAt).toBeDefined();
    await a.authed.mutation(api.notifications.mutations.markRead, {
      notificationId: id,
    });
    const second = await t.run(async (ctx) =>
      ctx.db.get("notifications", id),
    );
    expect(second?.readAt).toBe(first?.readAt);
  });

  test("rejects cross-user access with FORBIDDEN", async () => {
    const t = makeBackend();
    const a = await makeUser(t, "mra");
    const b = await makeUser(t, "mrb");
    const id = await seed(t, a.workspaceId, a.userId, "theirs");
    await expect(
      b.authed.mutation(api.notifications.mutations.markRead, {
        notificationId: id,
      }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });

  test("rejects an unknown id with NOT_FOUND", async () => {
    const t = makeBackend();
    const a = await makeUser(t, "mrnone");
    const id = await seed(t, a.workspaceId, a.userId, "gone");
    await t.run(async (ctx) => ctx.db.delete("notifications", id));
    await expect(
      a.authed.mutation(api.notifications.mutations.markRead, {
        notificationId: id,
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });
});

describe("notifications.mutations.markAllRead", () => {
  test("patches only the caller's rows", async () => {
    const t = makeBackend();
    const a = await makeUser(t, "maa");
    const b = await makeUser(t, "mab");
    await seed(t, a.workspaceId, a.userId, "a1");
    await seed(t, a.workspaceId, a.userId, "a2");
    await seed(t, b.workspaceId, b.userId, "b1");
    const result = await a.authed.mutation(
      api.notifications.mutations.markAllRead,
      {},
    );
    expect(result).toEqual({ updated: 2 });
    expect(
      await a.authed.query(api.notifications.queries.unreadCount, {}),
    ).toEqual({ count: 0 });
    expect(
      await b.authed.query(api.notifications.queries.unreadCount, {}),
    ).toEqual({ count: 1 });
  });
});
