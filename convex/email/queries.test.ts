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

function identityFor(tag: string) {
  return {
    subject: `user_inbox_${tag}`,
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

async function insertCommunication(
  t: Backend,
  workspaceId: Id<"workspaces">,
  overrides: {
    createdAt?: number;
    textBody?: string;
    caseId?: Id<"cases">;
    threadId?: string;
    messageId?: string;
  } = {},
): Promise<Id<"communications">> {
  const createdAt = overrides.createdAt ?? 1_757_772_000_000;
  return await t.run(async (ctx) =>
    ctx.db.insert("communications", {
      workspaceId,
      caseId: overrides.caseId,
      direction: "inbound",
      participantType: "other",
      agentMailInboxId: "inbox_list_1",
      agentMailThreadId: overrides.threadId ?? `thread_${createdAt}`,
      agentMailMessageId: overrides.messageId ?? `msg_${createdAt}`,
      status: "received",
      fromEmail: "resident@example.com",
      toEmails: ["estate@example.com"],
      subject: `Subject ${createdAt}`,
      textBody: overrides.textBody ?? `Body ${createdAt}`,
      aiDraftSource: false,
      approvedBy: undefined,
      approvedAt: undefined,
      providerDraftId: undefined,
      providerMessageId: undefined,
      lastError: undefined,
      createdAt,
      updatedAt: createdAt,
    }),
  );
}

describe("inbox.list", () => {
  test("returns only the caller's workspace communications", async () => {
    const t = makeBackend();
    const a = await makeWorkspace(t, "a");
    const b = await makeWorkspace(t, "b");
    await insertCommunication(t, a.workspaceId, { createdAt: 1000 });
    await insertCommunication(t, a.workspaceId, { createdAt: 2000 });
    await insertCommunication(t, b.workspaceId, { createdAt: 3000 });

    const result = await a.authed.query(api.email.queries.list, {
      filter: "all",
    });
    expect(result.communications).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
    // Newest first.
    expect(result.communications[0].createdAt).toBe(2000);
    expect(result.communications[0]).toMatchObject({
      direction: "inbound",
      participantType: "other",
      subject: "Subject 2000",
      fromEmail: "resident@example.com",
      toEmails: ["estate@example.com"],
      preview: "Body 2000",
    });
    expect(result.communications[0].caseId).toBeUndefined();
    expect(result.communications[0].caseNumber).toBeUndefined();
    expect(result.communications[0].caseTitle).toBeUndefined();
  });

  test("cursor pagination walks all rows without duplication", async () => {
    const t = makeBackend();
    const { authed, workspaceId } = await makeWorkspace(t, "page");
    for (let i = 1; i <= 5; i += 1) {
      await insertCommunication(t, workspaceId, { createdAt: i * 1000 });
    }
    const seen: Array<string> = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page += 1) {
      const result = await authed.query(api.email.queries.list, {
        filter: "all",
        pageSize: 2,
        ...(cursor === undefined ? {} : { cursor }),
      });
      for (const row of result.communications) {
        seen.push(String(row._id));
      }
      if (result.nextCursor === null) {
        break;
      }
      cursor = result.nextCursor;
    }
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  test("residents and vendors filters return empty while all rows are other", async () => {
    const t = makeBackend();
    const { authed, workspaceId } = await makeWorkspace(t, "filter");
    await insertCommunication(t, workspaceId, { createdAt: 1000 });
    const residents = await authed.query(api.email.queries.list, {
      filter: "residents",
    });
    const vendors = await authed.query(api.email.queries.list, {
      filter: "vendors",
    });
    expect(residents.communications).toEqual([]);
    expect(vendors.communications).toEqual([]);
  });

  test("user B cannot see user A's inbox", async () => {
    const t = makeBackend();
    const a = await makeWorkspace(t, "xa");
    const b = await makeWorkspace(t, "xb");
    await insertCommunication(t, a.workspaceId, { createdAt: 1000 });

    const result = await b.authed.query(api.email.queries.list, {
      filter: "all",
    });
    expect(result.communications).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  test("preview truncates long bodies to 120 chars", async () => {
    const t = makeBackend();
    const { authed, workspaceId } = await makeWorkspace(t, "preview");
    await insertCommunication(t, workspaceId, {
      createdAt: 1000,
      textBody: "x".repeat(200),
    });
    const result = await authed.query(api.email.queries.list, {
      filter: "all",
    });
    expect(result.communications).toHaveLength(1);
    expect(result.communications[0].preview).toBe("x".repeat(120));
  });

  test("linked case denormalizes caseNumber and caseTitle", async () => {
    const t = makeBackend();
    const { authed, workspaceId } = await makeWorkspace(t, "linked");
    const created: { caseId: Id<"cases">; caseNumber: number } =
      await authed.mutation(api.cases.mutations.createManual, {
        title: "Linked issue",
        description: "Tied to an inbox thread.",
        category: "plumbing",
        priority: "MEDIUM",
      });
    await insertCommunication(t, workspaceId, {
      createdAt: 1000,
      caseId: created.caseId,
    });
    const result = await authed.query(api.email.queries.list, {
      filter: "all",
    });
    expect(result.communications).toHaveLength(1);
    expect(result.communications[0].caseId).toBe(created.caseId);
    expect(result.communications[0].caseNumber).toBe(created.caseNumber);
    expect(result.communications[0].caseTitle).toBe("Linked issue");
  });
});
