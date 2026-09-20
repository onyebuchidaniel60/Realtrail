// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import {
  getAuthenticatedIdentity,
  getCurrentUser,
  requireUser,
} from "./auth";

const modules = import.meta.glob("../**/*.ts");

const IDENTITY = {
  subject: "user_auth_test_1",
  name: "Auth Test",
  email: "auth-test@example.com",
};

describe("getAuthenticatedIdentity", () => {
  test("throws UNAUTHENTICATED when no identity is present", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.run(async (ctx) => {
        await getAuthenticatedIdentity(ctx);
      }),
    ).rejects.toMatchObject({ data: { code: "UNAUTHENTICATED" } });
  });

  test("returns the identity when present", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(IDENTITY);
    const identity = await authed.run(async (ctx) => {
      return await getAuthenticatedIdentity(ctx);
    });
    expect(identity.subject).toEqual(IDENTITY.subject);
  });
});

describe("getCurrentUser", () => {
  test("creates a users row on first call (mirror on miss)", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(IDENTITY);
    const user = await authed.run(async (ctx) => {
      return await getCurrentUser(ctx);
    });
    expect(user).toMatchObject({
      clerkUserId: IDENTITY.subject,
      email: IDENTITY.email,
      name: IDENTITY.name,
    });
  });

  test("returns the existing row on second call (no duplicate)", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(IDENTITY);
    const first = await authed.run(async (ctx) => {
      return await getCurrentUser(ctx);
    });
    const second = await authed.run(async (ctx) => {
      return await getCurrentUser(ctx);
    });
    expect(second._id).toEqual(first._id);
    const count = await t.run(async (ctx) => {
      const rows = await ctx.db.query("users").collect();
      return rows.length;
    });
    expect(count).toEqual(1);
  });
});

describe("requireUser", () => {
  test("returns the user doc when authenticated", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(IDENTITY);
    const user = await authed.run(async (ctx) => {
      return await requireUser(ctx);
    });
    expect(user.clerkUserId).toEqual(IDENTITY.subject);
  });

  test("throws UNAUTHENTICATED when identity is missing", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.run(async (ctx) => {
        await requireUser(ctx);
      }),
    ).rejects.toMatchObject({ data: { code: "UNAUTHENTICATED" } });
  });
});
