// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ConvexError } from "convex/values";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { __setSendMessageForTests } from "../lib/providers/agentmail";

const modules = import.meta.glob("/convex/**/*.ts");

function makeBackend() {
  return convexTest(schema, modules);
}

type Backend = ReturnType<typeof makeBackend>;

function identityFor(tag: string) {
  return {
    subject: `user_email_send_${tag}`,
    name: `Owner ${tag}`,
    email: `owner-${tag}@example.com`,
  };
}

async function makeCase(t: Backend, tag: string) {
  const authed = t.withIdentity(identityFor(tag));
  await authed.mutation(api.users.syncUser, {});
  const created = await authed.mutation(api.workspace.create, {
    workspaceName: `Estate ${tag}`,
    timezone: "Africa/Lagos",
    currency: "NGN",
    propertyName: "Main Property",
    propertyAddress: "1 Main Road, Lagos",
  });
  const made = await authed.mutation(api.cases.mutations.createManual, {
    title: "Leaking pipe",
    description: "Kitchen pipe needs attention.",
    category: "plumbing",
    priority: "MEDIUM",
  });
  return { workspaceId: created.workspaceId, caseId: made.caseId };
}

async function insertPending(
  t: Backend,
  workspaceId: Id<"workspaces">,
  caseId: Id<"cases">,
  overrides: {
    status?: "draft" | "pending_send" | "sending" | "sent";
    sendAttempts?: number;
  } = {},
): Promise<Id<"communications">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("communications", {
      workspaceId,
      caseId,
      direction: "outbound",
      participantType: "vendor",
      agentMailInboxId: "inbox_send_1",
      agentMailThreadId: "",
      agentMailMessageId: undefined,
      status: overrides.status ?? "pending_send",
      fromEmail: "estate@example.com",
      toEmails: ["vendor@example.com"],
      subject: "Quote request",
      textBody: "Please quote.",
      aiDraftSource: true,
      approvedBy: undefined,
      approvedAt: 1_757_772_000_000,
      providerDraftId: undefined,
      providerMessageId: undefined,
      lastError: undefined,
      readAt: undefined,
      sendAttempts: overrides.sendAttempts ?? 0,
      createdAt: 1_757_772_000_000,
      updatedAt: 1_757_772_000_000,
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

function sendAction(t: Backend, communicationId: Id<"communications">) {
  return t.action(
    internal.email.sendPendingCommunication.sendPendingCommunication,
    { communicationId },
  );
}

function timeoutError() {
  return new ConvexError({
    code: "PROVIDER_ERROR",
    message: "AgentMail send outcome unknown: send timed out.",
  });
}

beforeEach(() => {
  process.env.AGENTMAIL_API_KEY = "test-key";
  __setSendMessageForTests(async () => ({
    messageId: "msg_live_1",
    threadId: "thread_live_1",
    providerStatus: "sent",
  }));
});

afterEach(() => {
  __setSendMessageForTests(undefined);
  delete process.env.AGENTMAIL_API_KEY;
  vi.useRealTimers();
});

describe("sendPendingCommunication", () => {
  test("successful send marks sent with provider ids and activity", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await makeCase(t, "ok");
    const communicationId = await insertPending(t, workspaceId, caseId);
    const result = await sendAction(t, communicationId);
    expect(result).toEqual({ status: "sent" });
    const comm = await readCommunication(t, communicationId);
    expect(comm).toMatchObject({
      status: "sent",
      providerMessageId: "msg_live_1",
      agentMailMessageId: "msg_live_1",
      agentMailThreadId: "thread_live_1",
    });
    expect(comm?.lastError).toBeUndefined();
    const activities = await activitiesForCase(t, caseId);
    const sent = activities.filter((a) => a.type === "EMAIL_SENT");
    expect(sent).toHaveLength(1);
    expect(sent[0].summary).toMatch(/vendor@example.com/);
    const record = await t.run(async (ctx) => ctx.db.get("cases", caseId));
    expect(record?.lastOutboundAt).toBeDefined();
  });

  test("duplicate call after sent is a no-op", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await makeCase(t, "dupe");
    const communicationId = await insertPending(t, workspaceId, caseId);
    await sendAction(t, communicationId);
    const second = await sendAction(t, communicationId);
    expect(second).toEqual({ status: "skipped" });
    const activities = await activitiesForCase(t, caseId);
    expect(activities.filter((a) => a.type === "EMAIL_SENT")).toHaveLength(1);
  });

  test("non-pending rows are skipped", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await makeCase(t, "skip");
    const communicationId = await insertPending(t, workspaceId, caseId, {
      status: "draft",
    });
    const result = await sendAction(t, communicationId);
    expect(result).toEqual({ status: "skipped" });
    expect((await readCommunication(t, communicationId))?.status).toBe(
      "draft",
    );
  });

  test("provider 5xx schedules a retry that succeeds", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await makeCase(t, "retry");
    let calls = 0;
    __setSendMessageForTests(async () => {
      calls += 1;
      if (calls === 1) {
        throw new ConvexError({
          code: "PROVIDER_ERROR",
          message: "AgentMail send failed with status 502.",
          retryable: true,
        });
      }
      return {
        messageId: "msg_retry_1",
        threadId: "thread_retry_1",
        providerStatus: "sent",
      };
    });
    const communicationId = await insertPending(t, workspaceId, caseId);
    // Fake timers BEFORE the action so the scheduled retry lands on the
    // fake clock that finishAll advances.
    vi.useFakeTimers();
    try {
      const first = await sendAction(t, communicationId);
      expect(first).toEqual({ status: "retry_scheduled" });
      expect((await readCommunication(t, communicationId))?.status).toBe(
        "pending_send",
      );
      await t.finishAllScheduledFunctions(() =>
        vi.advanceTimersByTime(60_000),
      );
    } finally {
      vi.useRealTimers();
    }
    expect(calls).toBe(2);
    const comm = await readCommunication(t, communicationId);
    expect(comm?.status).toBe("sent");
    expect(comm?.sendAttempts).toBe(1);
  });

  test("third failure marks failed with a redacted error", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await makeCase(t, "exhaust");
    __setSendMessageForTests(async () => {
      throw new ConvexError({
        code: "PROVIDER_ERROR",
        message: "AgentMail send failed with status 503.",
        retryable: true,
      });
    });
    const communicationId = await insertPending(t, workspaceId, caseId, {
      sendAttempts: 2,
    });
    const result = await sendAction(t, communicationId);
    expect(result).toEqual({ status: "failed" });
    const comm = await readCommunication(t, communicationId);
    expect(comm).toMatchObject({
      status: "failed",
      sendAttempts: 3,
      lastError: "Email send failed.",
    });
    // Redaction: the provider's raw message never lands in the row.
    expect(comm?.lastError).not.toContain("503");
    const activities = await activitiesForCase(t, caseId);
    expect(
      activities.filter((a) => a.type === "EMAIL_SEND_FAILED"),
    ).toHaveLength(1);
    // No retry follows exhaustion: advancing time changes nothing.
    vi.useFakeTimers();
    try {
      await t.finishAllScheduledFunctions(() =>
        vi.advanceTimersByTime(5 * 60_000),
      );
    } finally {
      vi.useRealTimers();
    }
    expect((await readCommunication(t, communicationId))?.status).toBe(
      "failed",
    );
  });

  test("non-retryable provider rejection fails immediately without retry", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await makeCase(t, "final");
    let calls = 0;
    __setSendMessageForTests(async () => {
      calls += 1;
      throw new ConvexError({
        code: "PROVIDER_ERROR",
        message: "AgentMail send failed with status 400.",
        retryable: false,
      });
    });
    const communicationId = await insertPending(t, workspaceId, caseId);
    const result = await sendAction(t, communicationId);
    expect(result).toEqual({ status: "failed" });
    vi.useFakeTimers();
    try {
      await t.finishAllScheduledFunctions(() =>
        vi.advanceTimersByTime(5 * 60_000),
      );
    } finally {
      vi.useRealTimers();
    }
    expect(calls).toBe(1);
    expect((await readCommunication(t, communicationId))?.status).toBe(
      "failed",
    );
  });

  test("ambiguous timeout marks send_uncertain with no auto-retry", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await makeCase(t, "uncertain");
    let calls = 0;
    __setSendMessageForTests(async () => {
      calls += 1;
      throw timeoutError();
    });
    const communicationId = await insertPending(t, workspaceId, caseId);
    const result = await sendAction(t, communicationId);
    expect(result).toEqual({ status: "send_uncertain" });
    const comm = await readCommunication(t, communicationId);
    expect(comm?.status).toBe("send_uncertain");
    expect(comm?.lastError).toMatch(/manager review required/);
    const activities = await activitiesForCase(t, caseId);
    expect(
      activities.filter((a) => a.type === "EMAIL_SEND_UNCERTAIN"),
    ).toHaveLength(1);
    // Uncertainty never auto-retries: advancing time sends nothing more.
    vi.useFakeTimers();
    try {
      await t.finishAllScheduledFunctions(() =>
        vi.advanceTimersByTime(5 * 60_000),
      );
    } finally {
      vi.useRealTimers();
    }
    expect(calls).toBe(1);
    expect((await readCommunication(t, communicationId))?.status).toBe(
      "send_uncertain",
    );
  });

  test("missing provider key fails closed without a network call", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await makeCase(t, "nokey");
    let calls = 0;
    __setSendMessageForTests(async () => {
      calls += 1;
      return {
        messageId: "msg_never",
        threadId: "thread_never",
        providerStatus: "sent",
      };
    });
    delete process.env.AGENTMAIL_API_KEY;
    const communicationId = await insertPending(t, workspaceId, caseId);
    const result = await sendAction(t, communicationId);
    expect(result).toEqual({ status: "failed" });
    expect(calls).toBe(0);
    expect((await readCommunication(t, communicationId))?.status).toBe(
      "failed",
    );
  });

  test("missing communication reads as missing", async () => {
    const t = makeBackend();
    const { caseId } = await makeCase(t, "gone");
    const communicationId = await insertPending(
      t,
      (await t.run(async (ctx) => ctx.db.query("workspaces").first()))!._id,
      caseId,
    );
    await t.run(async (ctx) => ctx.db.delete("communications", communicationId));
    const result = await sendAction(t, communicationId);
    expect(result).toEqual({ status: "missing" });
  });
});
