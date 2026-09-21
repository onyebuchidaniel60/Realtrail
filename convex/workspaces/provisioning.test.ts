// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  __setCreateInboxForTests,
  type CreateInboxArgs,
} from "../lib/providers/agentmail";

const modules = import.meta.glob("/convex/**/*.ts");

function makeBackend() {
  return convexTest(schema, modules);
}

type Backend = ReturnType<typeof makeBackend>;

const OWNER = {
  subject: "user_provision_a",
  name: "Owner A",
  email: "owner-a@example.com",
};

async function makeWorkspace(t: Backend) {
  const authed = t.withIdentity(OWNER);
  await authed.mutation(api.users.syncUser, {});
  const created = await authed.mutation(api.workspace.create, {
    workspaceName: "Provision Estate",
    timezone: "Africa/Lagos",
    currency: "NGN",
    propertyName: "Main Property",
    propertyAddress: "1 Main Road, Lagos",
  });
  return { authed, ...created };
}

async function readWorkspace(t: Backend, workspaceId: Id<"workspaces">) {
  return await t.run(async (ctx) => ctx.db.get("workspaces", workspaceId));
}

beforeEach(() => {
  process.env.AGENTMAIL_API_KEY = "test-api-key";
});

afterEach(() => {
  __setCreateInboxForTests(undefined);
  delete process.env.AGENTMAIL_API_KEY;
});

describe("storeInboxAddress", () => {
  test("stores the inbox id and address on the workspace", async () => {
    const t = makeBackend();
    const { workspaceId } = await makeWorkspace(t);
    await t.mutation(internal.workspaces.provisioning.storeInboxAddress, {
      workspaceId,
      inboxId: "inbox_store_1",
      address: "estate@example.com",
    });
    const workspace = await readWorkspace(t, workspaceId);
    expect(workspace).toMatchObject({
      agentMailInboxId: "inbox_store_1",
      agentMailInboxAddress: "estate@example.com",
    });
  });
});

describe("provisionAgentMailInbox", () => {
  test("creates the inbox and stores it on the workspace", async () => {
    const t = makeBackend();
    const { workspaceId } = await makeWorkspace(t);
    const seen: Array<CreateInboxArgs> = [];
    __setCreateInboxForTests(async (args) => {
      seen.push(args);
      return { inboxId: "inbox_live_1", address: "estate@example.com" };
    });
    const result = await t.action(
      internal.workspaces.provisioning.provisionAgentMailInbox,
      { workspaceId },
    );
    expect(result).toEqual({
      inboxId: "inbox_live_1",
      address: "estate@example.com",
      alreadyProvisioned: false,
    });
    expect(seen).toEqual([
      {
        apiKey: "test-api-key",
        clientId: workspaceId,
        displayName: "Provision Estate",
      },
    ]);
    const workspace = await readWorkspace(t, workspaceId);
    expect(workspace).toMatchObject({
      agentMailInboxId: "inbox_live_1",
      agentMailInboxAddress: "estate@example.com",
    });
  });

  test("second call returns early without calling the provider", async () => {
    const t = makeBackend();
    const { workspaceId } = await makeWorkspace(t);
    let calls = 0;
    __setCreateInboxForTests(async () => {
      calls += 1;
      return { inboxId: "inbox_live_1", address: "estate@example.com" };
    });
    await t.action(internal.workspaces.provisioning.provisionAgentMailInbox, {
      workspaceId,
    });
    const second = await t.action(
      internal.workspaces.provisioning.provisionAgentMailInbox,
      { workspaceId },
    );
    expect(second).toEqual({
      inboxId: "inbox_live_1",
      address: "estate@example.com",
      alreadyProvisioned: true,
    });
    expect(calls).toBe(1);
  });
});

describe("provisionMyWorkspaceInbox", () => {
  test("provisions the caller's workspace", async () => {
    const t = makeBackend();
    const { authed, workspaceId } = await makeWorkspace(t);
    __setCreateInboxForTests(async () => ({
      inboxId: "inbox_live_2",
      address: "estate2@example.com",
    }));
    const result = await authed.action(
      api.workspaces.provisioning.provisionMyWorkspaceInbox,
      {},
    );
    expect(result).toEqual({
      inboxId: "inbox_live_2",
      address: "estate2@example.com",
      alreadyProvisioned: false,
    });
    const workspace = await readWorkspace(t, workspaceId);
    expect(workspace?.agentMailInboxId).toBe("inbox_live_2");
  });

  test("rejects unauthenticated callers", async () => {
    const t = makeBackend();
    await expect(
      t.action(api.workspaces.provisioning.provisionMyWorkspaceInbox, {}),
    ).rejects.toMatchObject({ data: { code: "UNAUTHENTICATED" } });
  });
});
