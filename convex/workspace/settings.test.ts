// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const modules = import.meta.glob("/convex/**/*.ts");

const OWNER = {
  subject: "user_settings_owner",
  name: "Settings Owner",
  email: "settings-owner@example.com",
};

const MANAGER = {
  subject: "user_settings_manager",
  name: "Settings Manager",
  email: "settings-manager@example.com",
};

const STAFF = {
  subject: "user_settings_staff",
  name: "Settings Staff",
  email: "settings-staff@example.com",
};

const OTHER_OWNER = {
  subject: "user_settings_other",
  name: "Other Owner",
  email: "settings-other@example.com",
};

const ENV_NAMES = [
  "AGENTMAIL_API_KEY",
  "AGENTMAIL_WEBHOOK_SECRET",
  "OPENAI_API_KEY",
  "OPENAI_TRIAGE_MODEL",
  "OPENAI_DRAFT_MODEL",
  "FIRECRAWL_API_KEY",
  "CLERK_FRONTEND_API_URL",
] as const;

const ENV_VALUES: Record<(typeof ENV_NAMES)[number], string> = {
  AGENTMAIL_API_KEY: "test-agentmail-key",
  AGENTMAIL_WEBHOOK_SECRET: "test-webhook-secret",
  OPENAI_API_KEY: "test-openai-key",
  OPENAI_TRIAGE_MODEL: "test-triage-model",
  OPENAI_DRAFT_MODEL: "test-draft-model",
  FIRECRAWL_API_KEY: "test-firecrawl-key",
  CLERK_FRONTEND_API_URL: "https://test.clerk.accounts.dev",
};

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const name of ENV_NAMES) {
    savedEnv[name] = process.env[name];
  }
});

afterEach(() => {
  for (const name of ENV_NAMES) {
    if (savedEnv[name] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = savedEnv[name];
    }
  }
});

function setAllEnv() {
  for (const name of ENV_NAMES) {
    process.env[name] = ENV_VALUES[name];
  }
}

function clearAllEnv() {
  for (const name of ENV_NAMES) {
    delete process.env[name];
  }
}

const VALID_CREATE = {
  workspaceName: "Settings Estate",
  timezone: "Africa/Lagos",
  currency: "NGN",
  propertyName: "Palm Grove",
  propertyAddress: "12 Marina Road, Lagos",
};

async function setupOwnerWorkspace() {
  const t = convexTest(schema, modules);
  const authed = t.withIdentity(OWNER);
  await authed.mutation(api.users.syncUser, {});
  const { workspaceId } = await authed.mutation(
    api.workspace.create,
    VALID_CREATE,
  );
  return { t, authed, workspaceId };
}

async function provisionInbox(
  t: ReturnType<typeof convexTest>,
  workspaceId: Id<"workspaces">,
) {
  await t.run(async (ctx) => {
    await ctx.db.patch("workspaces", workspaceId, {
      agentMailInboxId: "inbox_test_123",
      agentMailInboxAddress: "estate-123@agentmail.to",
    });
  });
}

async function addMember(
  t: ReturnType<typeof convexTest>,
  workspaceId: Id<"workspaces">,
  identity: { subject: string; name: string; email: string },
  role: "manager" | "staff" | "owner",
) {
  const authed = t.withIdentity(identity);
  const userId = await authed.mutation(api.users.syncUser, {});
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId,
      role,
      createdAt: now,
      updatedAt: now,
    });
  });
  return authed;
}

describe("workspace.settings.getSettings", () => {
  test("returns workspace, member role, and live/configured statuses", async () => {
    setAllEnv();
    const { t, authed, workspaceId } = await setupOwnerWorkspace();
    await provisionInbox(t, workspaceId);
    const settings = await authed.query(api.workspace.settings.getSettings, {});
    expect(settings.workspace).toMatchObject({
      _id: workspaceId,
      name: "Settings Estate",
      timezone: "Africa/Lagos",
      currency: "NGN",
      status: "active",
      agentMailInboxAddress: "estate-123@agentmail.to",
      agentMailInboxConfigured: true,
    });
    expect(settings.member).toMatchObject({ role: "owner" });
    expect(settings.integrations).toEqual({
      agentMailInbound: "live",
      agentMailOutbound: "live",
      openAiTriage: "configured",
      openAiDraft: "configured",
      firecrawl: "configured",
      clerkFrontend: "configured",
    });
  });

  test("does not leak env names, values, or inbox IDs", async () => {
    setAllEnv();
    const { t, authed, workspaceId } = await setupOwnerWorkspace();
    await provisionInbox(t, workspaceId);
    const settings = await authed.query(api.workspace.settings.getSettings, {});
    const serialized = JSON.stringify(settings);
    for (const needle of [
      "OPENAI",
      "FIRECRAWL",
      "AGENTMAIL",
      "CLERK",
      "sk-",
      "whsec_",
      "inbox_test_123",
      "test-agentmail-key",
      "test-webhook-secret",
      "test-openai-key",
    ]) {
      expect(serialized).not.toContain(needle);
    }
  });

  test("reports not_configured when the inbox is absent", async () => {
    setAllEnv();
    const { authed } = await setupOwnerWorkspace();
    const settings = await authed.query(api.workspace.settings.getSettings, {});
    expect(settings.workspace.agentMailInboxAddress).toBeNull();
    expect(settings.workspace.agentMailInboxConfigured).toBe(false);
    expect(settings.integrations.agentMailInbound).toBe("not_configured");
    expect(settings.integrations.agentMailOutbound).toBe("not_configured");
    // Key-only integrations still report configured from env presence.
    expect(settings.integrations.firecrawl).toBe("configured");
  });

  test("reports not_configured when env vars are absent", async () => {
    clearAllEnv();
    const { t, authed, workspaceId } = await setupOwnerWorkspace();
    await provisionInbox(t, workspaceId);
    const settings = await authed.query(api.workspace.settings.getSettings, {});
    expect(settings.integrations).toEqual({
      agentMailInbound: "not_configured",
      agentMailOutbound: "not_configured",
      openAiTriage: "not_configured",
      openAiDraft: "not_configured",
      firecrawl: "not_configured",
      clerkFrontend: "not_configured",
    });
  });

  test("throws UNAUTHENTICATED without an identity", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.query(api.workspace.settings.getSettings, {}),
    ).rejects.toMatchObject({ data: { code: "UNAUTHENTICATED" } });
  });
});

describe("workspace.settings.updateWorkspace", () => {
  test("patches name, timezone, and currency as owner", async () => {
    const { t, authed, workspaceId } = await setupOwnerWorkspace();
    const result = await authed.mutation(
      api.workspace.settings.updateWorkspace,
      {
        name: "Renamed Estate",
        timezone: "Europe/London",
        currency: "gbp",
      },
    );
    expect(result).toEqual({ updated: true });
    const stored = await t.run(async (ctx) =>
      ctx.db.get("workspaces", workspaceId),
    );
    expect(stored).toMatchObject({
      name: "Renamed Estate",
      timezone: "Europe/London",
      currency: "GBP",
    });
  });

  test("patches only the provided fields", async () => {
    const { t, authed, workspaceId } = await setupOwnerWorkspace();
    await authed.mutation(api.workspace.settings.updateWorkspace, {
      name: "Only Name Changed",
    });
    const stored = await t.run(async (ctx) =>
      ctx.db.get("workspaces", workspaceId),
    );
    expect(stored).toMatchObject({
      name: "Only Name Changed",
      timezone: "Africa/Lagos",
      currency: "NGN",
    });
  });

  test("rejects a manager with FORBIDDEN", async () => {
    const { t, workspaceId } = await setupOwnerWorkspace();
    const manager = await addMember(t, workspaceId, MANAGER, "manager");
    await expect(
      manager.mutation(api.workspace.settings.updateWorkspace, {
        name: "Manager Rename",
      }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });

  test("rejects staff with FORBIDDEN", async () => {
    const { t, workspaceId } = await setupOwnerWorkspace();
    const staff = await addMember(t, workspaceId, STAFF, "staff");
    await expect(
      staff.mutation(api.workspace.settings.updateWorkspace, {
        name: "Staff Rename",
      }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });

  test("validates timezone, currency, and name", async () => {
    const { authed } = await setupOwnerWorkspace();
    await expect(
      authed.mutation(api.workspace.settings.updateWorkspace, {
        timezone: "Not/AZone",
      }),
    ).rejects.toMatchObject({
      data: { code: "VALIDATION_ERROR", field: "timezone" },
    });
    await expect(
      authed.mutation(api.workspace.settings.updateWorkspace, {
        currency: "XX1",
      }),
    ).rejects.toMatchObject({
      data: { code: "VALIDATION_ERROR", field: "currency" },
    });
    await expect(
      authed.mutation(api.workspace.settings.updateWorkspace, { name: "X" }),
    ).rejects.toMatchObject({
      data: { code: "VALIDATION_ERROR", field: "name" },
    });
  });

  test("a member elsewhere only affects their own workspace", async () => {
    const { t, workspaceId } = await setupOwnerWorkspace();
    const other = t.withIdentity(OTHER_OWNER);
    await other.mutation(api.users.syncUser, {});
    const { workspaceId: otherId } = await other.mutation(
      api.workspace.create,
      {
        ...VALID_CREATE,
        workspaceName: "Other Estate",
      },
    );
    await other.mutation(api.workspace.settings.updateWorkspace, {
      name: "Other Renamed",
    });
    const stored = await t.run(async (ctx) => ({
      first: await ctx.db.get("workspaces", workspaceId),
      second: await ctx.db.get("workspaces", otherId),
    }));
    expect(stored.first?.name).toBe("Settings Estate");
    expect(stored.second?.name).toBe("Other Renamed");
  });

  test("throws UNAUTHENTICATED without an identity", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.workspace.settings.updateWorkspace, { name: "Nope" }),
    ).rejects.toMatchObject({ data: { code: "UNAUTHENTICATED" } });
  });
});
