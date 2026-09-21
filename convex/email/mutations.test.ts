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

function identityFor(tag: string) {
  return {
    subject: `user_email_mut_${tag}`,
    name: `Owner ${tag}`,
    email: `owner-${tag}@example.com`,
  };
}

async function makeWorkspace(t: Backend, tag: string) {
  const authed = t.withIdentity(identityFor(tag));
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

async function makeCase(
  t: Backend,
  tag: string,
): Promise<{ authed: Authed; workspaceId: Id<"workspaces">; caseId: Id<"cases"> }> {
  const { authed, workspaceId } = await makeWorkspace(t, tag);
  const created = await authed.mutation(api.cases.mutations.createManual, {
    title: "Leaking pipe",
    description: "Kitchen pipe needs attention.",
    category: "plumbing",
    priority: "MEDIUM",
  });
  return { authed, workspaceId, caseId: created.caseId };
}

async function insertCommunication(
  t: Backend,
  workspaceId: Id<"workspaces">,
  overrides: {
    direction?: "inbound" | "outbound";
    createdAt?: number;
    threadId?: string;
    caseId?: Id<"cases">;
  } = {},
): Promise<Id<"communications">> {
  const createdAt = overrides.createdAt ?? 1_757_772_000_000;
  return await t.run(async (ctx) =>
    ctx.db.insert("communications", {
      workspaceId,
      caseId: overrides.caseId,
      direction: overrides.direction ?? "inbound",
      participantType: "other",
      agentMailInboxId: "inbox_mut_1",
      agentMailThreadId: overrides.threadId ?? `thread_${createdAt}`,
      agentMailMessageId: `msg_${createdAt}`,
      status: "received",
      fromEmail: "resident@example.com",
      toEmails: ["estate@example.com"],
      subject: `Subject ${createdAt}`,
      textBody: `Body ${createdAt}`,
      aiDraftSource: false,
      approvedBy: undefined,
      approvedAt: undefined,
      providerDraftId: undefined,
      providerMessageId: undefined,
      lastError: undefined,
      readAt: undefined,
      createdAt,
      updatedAt: createdAt,
    }),
  );
}

async function readCommunication(
  t: Backend,
  communicationId: Id<"communications">,
) {
  return await t.run(async (ctx) =>
    ctx.db.get("communications", communicationId),
  );
}

async function activitiesForCase(t: Backend, caseId: Id<"cases">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("caseActivities")
      .withIndex("by_caseId", (q) => q.eq("caseId", caseId))
      .collect(),
  );
}

describe("communications.linkToCase", () => {
  test("links an inbound communication to a same-workspace case", async () => {
    const t = makeBackend();
    const { authed, workspaceId, caseId } = await makeCase(t, "link");
    const communicationId = await insertCommunication(t, workspaceId);
    const result = await authed.mutation(api.email.mutations.linkToCase, {
      communicationId,
      caseId,
    });
    expect(result).toEqual({ communicationId });
    const comm = await readCommunication(t, communicationId);
    expect(comm?.caseId).toBe(caseId);
  });

  test("creates a COMMUNICATION_LINKED activity", async () => {
    const t = makeBackend();
    const { authed, workspaceId, caseId } = await makeCase(t, "activity");
    const communicationId = await insertCommunication(t, workspaceId, {
      createdAt: 5000,
    });
    await authed.mutation(api.email.mutations.linkToCase, {
      communicationId,
      caseId,
    });
    const activities = await activitiesForCase(t, caseId);
    const linked = activities.filter((a) => a.type === "COMMUNICATION_LINKED");
    expect(linked).toHaveLength(1);
    expect(linked[0]).toMatchObject({
      actorType: "user",
      summary: "Subject 5000 linked to case",
    });
    expect(linked[0].actorUserId).toBeDefined();
    expect(linked[0].metadata).toMatchObject({
      communicationId,
      fromEmail: "resident@example.com",
    });
  });

  test("rejects linking an outbound communication", async () => {
    const t = makeBackend();
    const { authed, workspaceId, caseId } = await makeCase(t, "outbound");
    const communicationId = await insertCommunication(t, workspaceId, {
      direction: "outbound",
    });
    await expect(
      authed.mutation(api.email.mutations.linkToCase, {
        communicationId,
        caseId,
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    const comm = await readCommunication(t, communicationId);
    expect(comm?.caseId).toBeUndefined();
  });

  test("rejects linking to a case in a different workspace", async () => {
    const t = makeBackend();
    const a = await makeCase(t, "ws-a");
    const b = await makeCase(t, "ws-b");
    const communicationId = await insertCommunication(t, a.workspaceId);
    await expect(
      a.authed.mutation(api.email.mutations.linkToCase, {
        communicationId,
        caseId: b.caseId,
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
    const comm = await readCommunication(t, communicationId);
    expect(comm?.caseId).toBeUndefined();
  });

  test("relinking the same case is idempotent with one activity", async () => {
    const t = makeBackend();
    const { authed, workspaceId, caseId } = await makeCase(t, "idem");
    const communicationId = await insertCommunication(t, workspaceId);
    await authed.mutation(api.email.mutations.linkToCase, {
      communicationId,
      caseId,
    });
    const again = await authed.mutation(api.email.mutations.linkToCase, {
      communicationId,
      caseId,
    });
    expect(again).toEqual({ communicationId });
    const activities = await activitiesForCase(t, caseId);
    expect(
      activities.filter((a) => a.type === "COMMUNICATION_LINKED"),
    ).toHaveLength(1);
  });

  test("sets case.lastInboundAt when the communication is newer", async () => {
    const t = makeBackend();
    const { authed, workspaceId, caseId } = await makeCase(t, "fresh");
    const communicationId = await insertCommunication(t, workspaceId, {
      createdAt: 9_000_000_000_000,
    });
    await authed.mutation(api.email.mutations.linkToCase, {
      communicationId,
      caseId,
    });
    const record = await t.run(async (ctx) => ctx.db.get("cases", caseId));
    expect(record?.lastInboundAt).toBe(9_000_000_000_000);
  });

  test("leaves case.lastInboundAt alone when the communication is older", async () => {
    const t = makeBackend();
    const { authed, workspaceId, caseId } = await makeCase(t, "stale");
    const newerId = await insertCommunication(t, workspaceId, {
      createdAt: 9_000_000_000_000,
    });
    await authed.mutation(api.email.mutations.linkToCase, {
      communicationId: newerId,
      caseId,
    });
    const olderId = await insertCommunication(t, workspaceId, {
      createdAt: 1_000_000_000_000,
    });
    await authed.mutation(api.email.mutations.linkToCase, {
      communicationId: olderId,
      caseId,
    });
    const record = await t.run(async (ctx) => ctx.db.get("cases", caseId));
    expect(record?.lastInboundAt).toBe(9_000_000_000_000);
  });
});

describe("communications.markRead", () => {
  test("sets readAt on an unread communication", async () => {
    const t = makeBackend();
    const { authed, workspaceId } = await makeWorkspace(t, "read");
    const communicationId = await insertCommunication(t, workspaceId);
    const result = await authed.mutation(api.email.mutations.markRead, {
      communicationId,
    });
    expect(result).toEqual({ communicationId });
    const comm = await readCommunication(t, communicationId);
    expect(comm?.readAt).toBeDefined();
  });

  test("is a no-op on an already-read communication", async () => {
    const t = makeBackend();
    const { authed, workspaceId } = await makeWorkspace(t, "noop");
    const communicationId = await insertCommunication(t, workspaceId);
    await authed.mutation(api.email.mutations.markRead, { communicationId });
    const first = await readCommunication(t, communicationId);
    await authed.mutation(api.email.mutations.markRead, { communicationId });
    const second = await readCommunication(t, communicationId);
    expect(second?.readAt).toBe(first?.readAt);
  });

  test("markThreadRead marks every unread row in the thread", async () => {
    const t = makeBackend();
    const { authed, workspaceId } = await makeWorkspace(t, "thread");
    const first = await insertCommunication(t, workspaceId, {
      createdAt: 1000,
      threadId: "thread_read_1",
    });
    const second = await insertCommunication(t, workspaceId, {
      createdAt: 2000,
      threadId: "thread_read_1",
    });
    const other = await insertCommunication(t, workspaceId, {
      createdAt: 3000,
      threadId: "thread_other",
    });
    await authed.mutation(api.email.mutations.markRead, {
      communicationId: first,
    });
    const result = await authed.mutation(api.email.mutations.markThreadRead, {
      threadId: "thread_read_1",
    });
    expect(result).toEqual({ updated: 1 });
    expect((await readCommunication(t, second))?.readAt).toBeDefined();
    expect((await readCommunication(t, other))?.readAt).toBeUndefined();
  });
});
