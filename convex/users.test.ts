// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

const IDENTITY = {
  subject: "user_sync_1",
  name: "Sync One",
  email: "sync-one@example.com",
};

describe("users.syncUser", () => {
  test("creates a users row for a new identity", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(IDENTITY);
    const userId = await authed.mutation(api.users.syncUser, {});
    const user = await t.run(async (ctx) => {
      return await ctx.db.get("users", userId);
    });
    expect(user).toMatchObject({
      clerkUserId: IDENTITY.subject,
      email: IDENTITY.email,
      name: IDENTITY.name,
    });
  });

  test("is idempotent: second call returns the same id, no duplicate", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(IDENTITY);
    const first = await authed.mutation(api.users.syncUser, {});
    const second = await authed.mutation(api.users.syncUser, {});
    expect(second).toEqual(first);
    const count = await t.run(async (ctx) => {
      const rows = await ctx.db.query("users").collect();
      return rows.length;
    });
    expect(count).toEqual(1);
  });

  test("updates email/name when identity claims change", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(IDENTITY);
    const userId = await authed.mutation(api.users.syncUser, {});
    const changed = t.withIdentity({
      subject: IDENTITY.subject,
      name: "Sync Renamed",
      email: "sync-renamed@example.com",
    });
    const sameId = await changed.mutation(api.users.syncUser, {});
    expect(sameId).toEqual(userId);
    const user = await t.run(async (ctx) => {
      return await ctx.db.get("users", userId);
    });
    expect(user).toMatchObject({
      name: "Sync Renamed",
      email: "sync-renamed@example.com",
    });
  });

  test("throws UNAUTHENTICATED when no identity is present", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.users.syncUser, {})).rejects.toMatchObject({
      data: { code: "UNAUTHENTICATED" },
    });
  });
});
