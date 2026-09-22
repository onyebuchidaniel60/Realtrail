// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { __setSendMessageForTests } from "../lib/providers/agentmail";
import { __setDraftMessageForTests } from "../lib/providers/openai";

const modules = import.meta.glob("/convex/**/*.ts");

function makeBackend() {
  return convexTest(schema, modules);
}

type Backend = ReturnType<typeof makeBackend>;

const HOUR = 3600 * 1000;

function identityFor(tag: string) {
  return {
    subject: `user_remind_${tag}`,
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
  await t.run(async (ctx) =>
    ctx.db.patch("workspaces", created.workspaceId, {
      agentMailInboxId: `inbox_remind_${tag}`,
      agentMailInboxAddress: `estate-${tag}@agentmail.to`,
    }),
  );
  return { authed, ...created };
}

async function makeCase(
  t: Backend,
  tag: string,
  status: "AWAITING_CONFIRMATION" | "VENDOR_CONTACTED" | "RESOLVED",
): Promise<{ workspaceId: Id<"workspaces">; caseId: Id<"cases"> }> {
  const { workspaceId } = await makeWorkspace(t, tag);
  const owner = await t.run(async (ctx) =>
    ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) =>
        q.eq("clerkUserId", `user_remind_${tag}`),
      )
      .unique()
      .then((u) => u!._id),
  );
  const now = Date.now();
  const caseId = await t.run(async (ctx) => {
    const number = await ctx.db
      .query("caseCounters")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
      .unique()
      .then(async (c) => {
        if (c === null) {
          await ctx.db.insert("caseCounters", { workspaceId, nextNumber: 2 });
          return 1;
        }
        await ctx.db.patch("caseCounters", c._id, {
          nextNumber: c.nextNumber + 1,
        });
        return c.nextNumber;
      });
    return await ctx.db.insert("cases", {
      workspaceId,
      caseNumber: number,
      title: "Reminder case",
      description: "Reminder fixture.",
      status,
      priority: "MEDIUM",
      category: "plumbing",
      propertyId: undefined,
      buildingId: undefined,
      unitId: undefined,
      vendorId: undefined,
      reporterName: undefined,
      reporterEmail: "resident@example.com",
      assigneeId: undefined,
      aiTriageStatus: "not_started",
      aiTriageVersion: undefined,
      aiTriageOutput: undefined,
      triageReviewedAt: undefined,
      triageReviewedBy: undefined,
      nextActionType: undefined,
      nextActionLabel: undefined,
      lastInboundAt: undefined,
      lastOutboundAt: undefined,
      lastActivityAt: now,
      reopenCount: 0,
      locationUnknown: true,
      closedReason: undefined,
      resolutionSummary: undefined,
      resolutionCostMinor: undefined,
      resolutionCompletedAt: undefined,
      resolvedAt: undefined,
      resolvedBy: undefined,
      closedAt: undefined,
      closedBy: undefined,
      createdBy: owner,
      createdAt: now,
      updatedAt: now,
    });
  });
  return { workspaceId, caseId };
}

async function insertComm(
  t: Backend,
  workspaceId: Id<"workspaces">,
  caseId: Id<"cases">,
  overrides: {
    direction?: "inbound" | "outbound";
    participantType?: "resident" | "vendor" | "other";
    createdAt?: number;
  } = {},
): Promise<Id<"communications">> {
  const createdAt = overrides.createdAt ?? Date.now();
  return await t.run(async (ctx) =>
    ctx.db.insert("communications", {
      workspaceId,
      caseId,
      direction: overrides.direction ?? "outbound",
      participantType: overrides.participantType ?? "vendor",
      agentMailInboxId: "inbox_remind_x",
      agentMailThreadId: "thread_remind_x",
      agentMailMessageId: undefined,
      status: "sent",
      fromEmail: "estate@example.com",
      toEmails: ["vendor@example.com"],
      subject: "Quote request",
      textBody: "Please quote.",
      aiDraftSource: false,
      approvedBy: undefined,
      approvedAt: undefined,
      providerDraftId: undefined,
      providerMessageId: undefined,
      lastError: undefined,
      readAt: undefined,
      sendAttempts: 0,
      createdAt,
      updatedAt: createdAt,
    }),
  );
}

async function listNotifications(t: Backend) {
  return await t.run(async (ctx) => ctx.db.query("notifications").collect());
}

async function reminderActivities(t: Backend, caseId: Id<"cases">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("caseActivities")
      .withIndex("by_caseId", (q) => q.eq("caseId", caseId))
      .collect()
      .then((rows) => rows.filter((r) => r.type === "REMINDER_SENT")),
  );
}

function remind(t: Backend, caseId: Id<"cases">, cycle: 1 | 2 | 3) {
  return t.action(internal.notifications.reminders.sendResidentReminder, {
    caseId,
    cycle,
  });
}

function followUp(t: Backend, caseId: Id<"cases">) {
  return t.action(internal.notifications.reminders.sendVendorFollowUp, {
    caseId,
  });
}

beforeEach(() => {
  process.env.PUBLIC_APP_URL = "https://app.example.com";
  process.env.AGENTMAIL_API_KEY = "test-key";
  __setSendMessageForTests(async () => ({
    messageId: "msg_remind_1",
    threadId: "thread_remind_1",
    providerStatus: "sent",
  }));
  __setDraftMessageForTests(async () => ({
    subject: "Draft",
    textBody: "Body.",
  }));
});

afterEach(() => {
  __setSendMessageForTests(undefined);
  __setDraftMessageForTests(undefined);
  delete process.env.PUBLIC_APP_URL;
  delete process.env.AGENTMAIL_API_KEY;
  delete process.env.REALTRAIL_VENDOR_FOLLOWUP_HOURS;
  delete process.env.REALTRAIL_RESIDENT_REMINDER_HOURS;
  delete process.env.REALTRAIL_ESCALATION_HOURS;
  vi.useRealTimers();
});

describe("sendResidentReminder", () => {
  test("cycle 1 notifies owner+manager with activity", async () => {
    const t = makeBackend();
    const { caseId } = await makeCase(t, "r1", "AWAITING_CONFIRMATION");
    await t.run(async (ctx) =>
      ctx.db.patch("cases", caseId, {
        residentReminderScheduledAt: Date.now() - 25 * HOUR,
      }),
    );
    const result = await remind(t, caseId, 1);
    expect(result).toEqual({ created: 1 });
    const rows = await listNotifications(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "resident_confirmation" });
    expect((await reminderActivities(t, caseId))).toHaveLength(1);
  });

  test("skips resolved cases without writing", async () => {
    const t = makeBackend();
    const { caseId } = await makeCase(t, "r2", "RESOLVED");
    const result = await remind(t, caseId, 1);
    expect(result).toEqual({ created: 0, skipped: "state_changed" });
    expect(await listNotifications(t)).toHaveLength(0);
  });

  test("skips when the cycle is not yet due", async () => {
    const t = makeBackend();
    const { caseId } = await makeCase(t, "r3", "AWAITING_CONFIRMATION");
    await t.run(async (ctx) =>
      ctx.db.patch("cases", caseId, {
        residentReminderScheduledAt: Date.now(),
      }),
    );
    const result = await remind(t, caseId, 1);
    expect(result).toEqual({ created: 0, skipped: "not_due" });
    expect(await listNotifications(t)).toHaveLength(0);
  });

  test("cycle 3 escalates as urgent_case", async () => {
    const t = makeBackend();
    const { caseId } = await makeCase(t, "r4", "AWAITING_CONFIRMATION");
    await t.run(async (ctx) =>
      ctx.db.patch("cases", caseId, {
        residentReminderScheduledAt: Date.now() - 73 * HOUR,
      }),
    );
    const result = await remind(t, caseId, 3);
    expect(result).toEqual({ created: 1 });
    const rows = await listNotifications(t);
    expect(rows[0]).toMatchObject({ type: "urgent_case" });
    const activities = await reminderActivities(t, caseId);
    expect(activities[0].summary).toMatch(/Escalated/);
  });

  test("double-fire is idempotent by dedupeKey", async () => {
    const t = makeBackend();
    const { caseId } = await makeCase(t, "r5", "AWAITING_CONFIRMATION");
    await t.run(async (ctx) =>
      ctx.db.patch("cases", caseId, {
        residentReminderScheduledAt: Date.now() - 25 * HOUR,
      }),
    );
    await remind(t, caseId, 1);
    const second = await remind(t, caseId, 1);
    expect(second).toEqual({ created: 0 });
    expect(await listNotifications(t)).toHaveLength(1);
    expect(await reminderActivities(t, caseId)).toHaveLength(1);
  });
});

describe("sendVendorFollowUp", () => {
  test("notifies when outbound is stale with no reply", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await makeCase(t, "v1", "VENDOR_CONTACTED");
    await insertComm(t, workspaceId, caseId, {
      createdAt: Date.now() - 5 * HOUR,
    });
    const result = await followUp(t, caseId);
    expect(result).toEqual({ created: 1 });
    const rows = await listNotifications(t);
    expect(rows[0]).toMatchObject({ type: "vendor_followup" });
    expect((await reminderActivities(t, caseId))).toHaveLength(1);
  });

  test("skips when a newer inbound reply exists", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await makeCase(t, "v2", "VENDOR_CONTACTED");
    const now = Date.now();
    await insertComm(t, workspaceId, caseId, { createdAt: now - 5 * HOUR });
    await insertComm(t, workspaceId, caseId, {
      direction: "inbound",
      participantType: "vendor",
      createdAt: now - 1 * HOUR,
    });
    const result = await followUp(t, caseId);
    expect(result).toEqual({ created: 0, skipped: "not_due" });
    expect(await listNotifications(t)).toHaveLength(0);
  });

  test("skips when the case moved past VENDOR_CONTACTED", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await makeCase(t, "v3", "VENDOR_CONTACTED");
    await insertComm(t, workspaceId, caseId, {
      createdAt: Date.now() - 9 * HOUR,
    });
    await t.run(async (ctx) =>
      ctx.db.patch("cases", caseId, { status: "SCHEDULED" }),
    );
    const result = await followUp(t, caseId);
    expect(result).toEqual({ created: 0, skipped: "state_changed" });
    expect(await listNotifications(t)).toHaveLength(0);
  });
});

describe("reminder scheduling hooks", () => {
  test("requestConfirmation arms all three cycles", async () => {
    const t = makeBackend();
    const { authed } = await makeWorkspace(t, "hook");
    const made = await authed.mutation(api.cases.mutations.createManual, {
      title: "Hook case",
      description: "Scheduling hook fixture.",
      category: "plumbing",
      priority: "MEDIUM",
      reporterEmail: "resident@example.com",
    });
    await t.run(async (ctx) =>
      ctx.db.patch("cases", made.caseId, { status: "WORK_IN_PROGRESS" }),
    );
    // Fake timers BEFORE the mutation so all three runAfters land on
    // the fake clock that finishAll advances.
    vi.useFakeTimers();
    try {
      await authed.mutation(api.cases.confirmation.requestConfirmation, {
        caseId: made.caseId,
      });
      await t.finishAllScheduledFunctions(() =>
        vi.advanceTimersByTime(73 * HOUR),
      );
    } finally {
      vi.useRealTimers();
    }
    const rows = await listNotifications(t);
    // Owner-only workspace: 2 resident_confirmation cycles + 1 escalation.
    expect(rows).toHaveLength(3);
    expect(
      rows.filter((r) => r.type === "resident_confirmation"),
    ).toHaveLength(2);
    expect(rows.filter((r) => r.type === "urgent_case")).toHaveLength(1);
  });

  test("vendor send arms the follow-up", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await makeCase(t, "hookv", "VENDOR_CONTACTED");
    const pendingId = await t.run(async (ctx) =>
      ctx.db.insert("communications", {
        workspaceId,
        caseId,
        direction: "outbound",
        participantType: "vendor",
        agentMailInboxId: "inbox_hookv",
        agentMailThreadId: "",
        agentMailMessageId: undefined,
        status: "pending_send",
        fromEmail: "estate@example.com",
        toEmails: ["vendor@example.com"],
        subject: "Quote",
        textBody: "Please quote.",
        aiDraftSource: false,
        approvedBy: undefined,
        approvedAt: Date.now(),
        providerDraftId: undefined,
        providerMessageId: undefined,
        lastError: undefined,
        readAt: undefined,
        sendAttempts: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    vi.useFakeTimers();
    try {
      await t.action(
        internal.email.sendPendingCommunication.sendPendingCommunication,
        { communicationId: pendingId },
      );
      await t.finishAllScheduledFunctions(() =>
        vi.advanceTimersByTime(5 * HOUR),
      );
    } finally {
      vi.useRealTimers();
    }
    const rows = await listNotifications(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "vendor_followup" });
  });
});
