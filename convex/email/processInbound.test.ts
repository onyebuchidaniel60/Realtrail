// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  __setFetchMessageForTests,
  type AgentMailMessage,
} from "../lib/providers/agentmail";

const modules = import.meta.glob("/convex/**/*.ts");

function makeBackend() {
  return convexTest(schema, modules);
}

type Backend = ReturnType<typeof makeBackend>;

const OWNER = {
  subject: "user_inbound_a",
  name: "Owner A",
  email: "owner-a@example.com",
};

const INBOX_ID = "inbox_pipeline_1";

async function makeWorkspace(t: Backend) {
  const authed = t.withIdentity(OWNER);
  await authed.mutation(api.users.syncUser, {});
  const created = await authed.mutation(api.workspace.create, {
    workspaceName: `Estate ${OWNER.subject}`,
    timezone: "Africa/Lagos",
    currency: "NGN",
    propertyName: "Main Property",
    propertyAddress: "1 Main Road, Lagos",
  });
  // Inbox provisioning is Phase 5-B; tests wire the routing field directly.
  await t.run(async (ctx) => {
    await ctx.db.patch("workspaces", created.workspaceId, {
      agentMailInboxId: INBOX_ID,
    });
  });
  return { authed, ...created };
}

function eventArgs(
  overrides: {
    providerEventId?: string;
    providerMessageId?: string;
    providerInboxId?: string;
  } = {},
) {
  return {
    providerEventId: "evt_1",
    providerMessageId: "msg_1",
    providerInboxId: INBOX_ID,
    eventType: "message.received",
    payloadHash: "hash_1",
    ...overrides,
  };
}

function mockMessage(overrides: Partial<AgentMailMessage> = {}) {
  return async (): Promise<AgentMailMessage> => ({
    messageId: "msg_1",
    threadId: "thread_1",
    inboxId: INBOX_ID,
    from: "resident@example.com",
    to: ["estate@example.com"],
    subject: "Leaking pipe",
    text: "The kitchen pipe is leaking badly.",
    timestamp: 1_757_772_000_000,
    ...overrides,
  });
}

async function readEvent(t: Backend, eventId: Id<"inboundEvents">) {
  return await t.run(async (ctx) => ctx.db.get("inboundEvents", eventId));
}

async function listCommunications(t: Backend) {
  return await t.run(async (ctx) =>
    ctx.db.query("communications").collect(),
  );
}

beforeEach(() => {
  process.env.AGENTMAIL_API_KEY = "test-api-key";
});

afterEach(() => {
  __setFetchMessageForTests(undefined);
  delete process.env.AGENTMAIL_API_KEY;
});

describe("recordInboundEvent", () => {
  test("inserts a new row and returns wasDuplicate false", async () => {
    const t = makeBackend();
    const { eventId, wasDuplicate } = await t.mutation(
      internal.email.processInbound.recordInboundEvent,
      eventArgs(),
    );
    expect(wasDuplicate).toBe(false);
    const event = await readEvent(t, eventId);
    expect(event).toMatchObject({
      provider: "agentmail",
      providerEventId: "evt_1",
      providerMessageId: "msg_1",
      providerInboxId: INBOX_ID,
      processingStatus: "received",
      attempts: 1,
    });
  });

  test("duplicate providerEventId returns wasDuplicate true with no new row", async () => {
    const t = makeBackend();
    const first = await t.mutation(
      internal.email.processInbound.recordInboundEvent,
      eventArgs(),
    );
    const second = await t.mutation(
      internal.email.processInbound.recordInboundEvent,
      eventArgs(),
    );
    expect(first.wasDuplicate).toBe(false);
    expect(second).toEqual({
      eventId: first.eventId,
      wasDuplicate: true,
    });
    const rows = await t.run(async (ctx) =>
      ctx.db.query("inboundEvents").collect(),
    );
    expect(rows).toHaveLength(1);
  });
});

describe("processInboundEvent", () => {
  test("mocked fetch stores one communications row and marks processed", async () => {
    const t = makeBackend();
    await makeWorkspace(t);
    const seen: Array<{ inboxId: string; messageId: string; apiKey: string }> =
      [];
    __setFetchMessageForTests(async (args) => {
      seen.push(args);
      return mockMessage()();
    });
    const { eventId } = await t.mutation(
      internal.email.processInbound.recordInboundEvent,
      eventArgs(),
    );
    const result = await t.action(
      internal.email.processInbound.processInboundEvent,
      { eventId },
    );
    expect(result).toEqual({ status: "processed" });
    expect(seen).toEqual([
      { inboxId: INBOX_ID, messageId: "msg_1", apiKey: "test-api-key" },
    ]);
    const rows = await listCommunications(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      direction: "inbound",
      participantType: "other",
      agentMailInboxId: INBOX_ID,
      agentMailThreadId: "thread_1",
      agentMailMessageId: "msg_1",
      status: "received",
      fromEmail: "resident@example.com",
      toEmails: ["estate@example.com"],
      subject: "Leaking pipe",
      textBody: "The kitchen pipe is leaking badly.",
      aiDraftSource: false,
    });
    expect(rows[0].caseId).toBeUndefined();
    const event = await readEvent(t, eventId);
    expect(event?.processingStatus).toBe("processed");
    expect(event?.processedAt).toBeDefined();
  });

  test("already-processed event returns early with no new row", async () => {
    const t = makeBackend();
    await makeWorkspace(t);
    __setFetchMessageForTests(mockMessage());
    const { eventId } = await t.mutation(
      internal.email.processInbound.recordInboundEvent,
      eventArgs(),
    );
    await t.action(internal.email.processInbound.processInboundEvent, {
      eventId,
    });
    const second = await t.action(
      internal.email.processInbound.processInboundEvent,
      { eventId },
    );
    expect(second).toEqual({ status: "skipped" });
    expect(await listCommunications(t)).toHaveLength(1);
  });

  test("unknown inbox marks the event failed", async () => {
    const t = makeBackend();
    await makeWorkspace(t);
    __setFetchMessageForTests(mockMessage());
    const { eventId } = await t.mutation(
      internal.email.processInbound.recordInboundEvent,
      eventArgs({ providerInboxId: "inbox_unknown" }),
    );
    const result = await t.action(
      internal.email.processInbound.processInboundEvent,
      { eventId },
    );
    expect(result).toEqual({ status: "unknown_inbox" });
    const event = await readEvent(t, eventId);
    expect(event).toMatchObject({
      processingStatus: "failed",
      lastError: "Unknown AgentMail inbox.",
    });
    expect(await listCommunications(t)).toHaveLength(0);
  });

  test("fetch failure below max attempts reschedules as received", async () => {
    const t = makeBackend();
    await makeWorkspace(t);
    __setFetchMessageForTests(async () => {
      throw new Error("provider down");
    });
    const { eventId } = await t.mutation(
      internal.email.processInbound.recordInboundEvent,
      eventArgs(),
    );
    const result = await t.action(
      internal.email.processInbound.processInboundEvent,
      { eventId },
    );
    expect(result).toEqual({ status: "retry_scheduled" });
    const event = await readEvent(t, eventId);
    expect(event).toMatchObject({
      processingStatus: "received",
      attempts: 2,
      lastError: "AgentMail message fetch failed.",
    });
  });

  test("retry succeeds after a transient fetch failure", async () => {
    const t = makeBackend();
    await makeWorkspace(t);
    let calls = 0;
    __setFetchMessageForTests(async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("transient outage");
      }
      return mockMessage()();
    });
    const { eventId } = await t.mutation(
      internal.email.processInbound.recordInboundEvent,
      eventArgs(),
    );
    // Fake timers must be active BEFORE the action schedules the retry so
    // the scheduled runAt uses the fake clock that finishAll advances.
    vi.useFakeTimers();
    try {
      await t.action(internal.email.processInbound.processInboundEvent, {
        eventId,
      });
      await t.finishAllScheduledFunctions(() =>
        vi.advanceTimersByTime(60_000),
      );
    } finally {
      vi.useRealTimers();
    }
    expect(calls).toBe(2);
    const event = await readEvent(t, eventId);
    expect(event?.processingStatus).toBe("processed");
    expect(await listCommunications(t)).toHaveLength(1);
  });

  test("fetch failure at max attempts fails permanently", async () => {
    const t = makeBackend();
    await makeWorkspace(t);
    __setFetchMessageForTests(async () => {
      throw new Error("provider down");
    });
    const { eventId } = await t.mutation(
      internal.email.processInbound.recordInboundEvent,
      eventArgs(),
    );
    await t.run(async (ctx) => {
      await ctx.db.patch("inboundEvents", eventId, { attempts: 3 });
    });
    // Fake timers active before the action runs: if a retry were wrongly
    // scheduled, advancing 5 minutes would execute it and fail the asserts.
    vi.useFakeTimers();
    const result = await t.action(
      internal.email.processInbound.processInboundEvent,
      { eventId },
    );
    expect(result).toEqual({ status: "failed" });
    const event = await readEvent(t, eventId);
    expect(event).toMatchObject({
      processingStatus: "failed",
      attempts: 4,
      lastError: "AgentMail message fetch failed.",
    });
    try {
      await t.finishAllScheduledFunctions(() =>
        vi.advanceTimersByTime(5 * 60_000),
      );
    } finally {
      vi.useRealTimers();
    }
    // No retry was scheduled: still failed, still no communication row.
    const after = await readEvent(t, eventId);
    expect(after?.processingStatus).toBe("failed");
    expect(await listCommunications(t)).toHaveLength(0);
  });

  test("same provider message id twice stores one communications row", async () => {
    const t = makeBackend();
    await makeWorkspace(t);
    __setFetchMessageForTests(mockMessage());
    const first = await t.mutation(
      internal.email.processInbound.recordInboundEvent,
      eventArgs({ providerEventId: "evt_a" }),
    );
    const second = await t.mutation(
      internal.email.processInbound.recordInboundEvent,
      eventArgs({
        providerEventId: "evt_b",
        providerMessageId: "msg_1",
      }),
    );
    await t.action(internal.email.processInbound.processInboundEvent, {
      eventId: first.eventId,
    });
    const result = await t.action(
      internal.email.processInbound.processInboundEvent,
      { eventId: second.eventId },
    );
    expect(result).toEqual({ status: "processed" });
    const rows = await listCommunications(t);
    expect(rows).toHaveLength(1);
    const secondEvent = await readEvent(t, second.eventId);
    expect(secondEvent?.processingStatus).toBe("processed");
  });
});
