// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { hashToken } from "../lib/confirmationToken";

const modules = import.meta.glob("/convex/**/*.ts");

function makeBackend() {
  return convexTest(schema, modules);
}

type Backend = ReturnType<typeof makeBackend>;
type Authed = ReturnType<Backend["withIdentity"]>;

function identityFor(tag: string) {
  return {
    subject: `user_confirm_${tag}`,
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
      agentMailInboxId: `inbox_confirm_${tag}`,
      agentMailInboxAddress: `estate-${tag}@agentmail.to`,
    }),
  );
  return { authed, ...created };
}

async function makeWipCase(
  t: Backend,
  tag: string,
  overrides: { reporterEmail?: string } = {},
): Promise<{ authed: Authed; workspaceId: Id<"workspaces">; caseId: Id<"cases"> }> {
  const { authed, workspaceId } = await makeWorkspace(t, tag);
  const created = await authed.mutation(api.cases.mutations.createManual, {
    title: "Pump fixed",
    description: "Vendor reports the pump is fixed.",
    category: "plumbing",
    priority: "MEDIUM",
    ...(overrides.reporterEmail !== undefined
      ? { reporterEmail: overrides.reporterEmail }
      : {}),
  });
  // Fixture setup, not a transition test: place the case directly.
  // Transition rules are covered by stateMachine tests.
  await t.run(async (ctx) =>
    ctx.db.patch("cases", created.caseId, { status: "WORK_IN_PROGRESS" }),
  );
  return { authed, workspaceId, caseId: created.caseId };
}

async function insertToken(
  t: Backend,
  workspaceId: Id<"workspaces">,
  caseId: Id<"cases">,
  rawToken: string,
  overrides: { expiresAt?: number; usedAt?: number } = {},
): Promise<Id<"confirmationTokens">> {
  const now = Date.now();
  return await t.run(async (ctx) =>
    ctx.db.insert("confirmationTokens", {
      workspaceId,
      caseId,
      tokenHash: hashToken(rawToken),
      decision: undefined,
      expiresAt: overrides.expiresAt ?? now + 72 * 3600 * 1000,
      usedAt: overrides.usedAt,
      createdAt: now,
    }),
  );
}

async function readToken(t: Backend, tokenId: Id<"confirmationTokens">) {
  return await t.run(async (ctx) => ctx.db.get("confirmationTokens", tokenId));
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

beforeEach(() => {
  process.env.PUBLIC_APP_URL = "https://app.example.com";
  delete process.env.REALTRAIL_CONFIRMATION_TOKEN_TTL_HOURS;
});

afterEach(() => {
  delete process.env.PUBLIC_APP_URL;
  delete process.env.REALTRAIL_CONFIRMATION_TOKEN_TTL_HOURS;
});

describe("cases.requestConfirmation", () => {
  test("happy path creates token, email row, transition, and activity", async () => {
    const t = makeBackend();
    const { authed, caseId } = await makeWipCase(t, "happy", {
      reporterEmail: "resident@example.com",
    });
    const { tokenId, communicationId } = await authed.mutation(
      api.cases.confirmation.requestConfirmation,
      { caseId },
    );
    const token = await readToken(t, tokenId);
    // Unset optionals read back as absent, not undefined-valued.
    expect(token?.decision).toBeUndefined();
    expect(token?.usedAt).toBeUndefined();
    expect(token?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(token!.expiresAt - token!.createdAt).toBe(72 * 3600 * 1000);
    const comm = await readCommunication(t, communicationId);
    expect(comm).toMatchObject({
      direction: "outbound",
      participantType: "resident",
      status: "pending_send",
      toEmails: ["resident@example.com"],
      aiDraftSource: false,
      sendAttempts: 0,
    });
    expect(comm?.subject).toContain("Confirmation requested for case #");
    expect(comm?.textBody).toContain("/confirm?token=");
    expect(comm?.textBody).toContain("72 hours");
    const record = await t.run(async (ctx) => ctx.db.get("cases", caseId));
    expect(record?.status).toBe("AWAITING_CONFIRMATION");
    const activities = await activitiesForCase(t, caseId);
    expect(
      activities.filter((a) => a.type === "CONFIRMATION_REQUESTED"),
    ).toHaveLength(1);
  });

  test("uses an explicit recipientEmail override", async () => {
    const t = makeBackend();
    const { authed, caseId } = await makeWipCase(t, "override", {
      reporterEmail: "resident@example.com",
    });
    const { communicationId } = await authed.mutation(
      api.cases.confirmation.requestConfirmation,
      { caseId, recipientEmail: "other@example.com" },
    );
    const comm = await readCommunication(t, communicationId);
    expect(comm?.toEmails).toEqual(["other@example.com"]);
  });

  test("rejects when the case is not WORK_IN_PROGRESS", async () => {
    const t = makeBackend();
    const { authed } = await makeWorkspace(t, "notwip");
    const created = await authed.mutation(api.cases.mutations.createManual, {
      title: "Fresh",
      description: "Brand new case.",
      category: "plumbing",
      priority: "MEDIUM",
      reporterEmail: "resident@example.com",
    });
    await expect(
      authed.mutation(api.cases.confirmation.requestConfirmation, {
        caseId: created.caseId,
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });

  test("rejects when no recipient email exists anywhere", async () => {
    const t = makeBackend();
    const { authed, caseId } = await makeWipCase(t, "noemail");
    await expect(
      authed.mutation(api.cases.confirmation.requestConfirmation, {
        caseId,
      }),
    ).rejects.toMatchObject({
      data: { code: "VALIDATION_ERROR", field: "recipientEmail" },
    });
  });

  test("rejects an invalid recipientEmail format", async () => {
    const t = makeBackend();
    const { authed, caseId } = await makeWipCase(t, "bademail");
    await expect(
      authed.mutation(api.cases.confirmation.requestConfirmation, {
        caseId,
        recipientEmail: "not-an-email",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  test("rejects a cross-workspace caseId with NOT_FOUND", async () => {
    const t = makeBackend();
    const a = await makeWipCase(t, "conf-a");
    const b = await makeWipCase(t, "conf-b", {
      reporterEmail: "resident@example.com",
    });
    await expect(
      a.authed.mutation(api.cases.confirmation.requestConfirmation, {
        caseId: b.caseId,
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });

  test("re-request invalidates the prior unused token", async () => {
    const t = makeBackend();
    const { authed, caseId } = await makeWipCase(t, "rereq", {
      reporterEmail: "resident@example.com",
    });
    const first = await authed.mutation(
      api.cases.confirmation.requestConfirmation,
      { caseId },
    );
    // Back to work (simulates a decline + reopen cycle managed outside
    // the token flow) so a second request is legal.
    await t.run(async (ctx) =>
      ctx.db.patch("cases", caseId, { status: "WORK_IN_PROGRESS" }),
    );
    const second = await authed.mutation(
      api.cases.confirmation.requestConfirmation,
      { caseId },
    );
    expect(second.tokenId).not.toBe(first.tokenId);
    expect((await readToken(t, first.tokenId))?.usedAt).toBeDefined();
    expect((await readToken(t, second.tokenId))?.usedAt).toBeUndefined();
  });

  test("honors the TTL env var and falls back to 72h", async () => {
    const t = makeBackend();
    process.env.REALTRAIL_CONFIRMATION_TOKEN_TTL_HOURS = "1";
    const { authed, caseId } = await makeWipCase(t, "ttl", {
      reporterEmail: "resident@example.com",
    });
    const one = await authed.mutation(
      api.cases.confirmation.requestConfirmation,
      { caseId },
    );
    const oneToken = await readToken(t, one.tokenId);
    expect(oneToken!.expiresAt - oneToken!.createdAt).toBe(3600 * 1000);
    delete process.env.REALTRAIL_CONFIRMATION_TOKEN_TTL_HOURS;
    await t.run(async (ctx) =>
      ctx.db.patch("cases", caseId, { status: "WORK_IN_PROGRESS" }),
    );
    const two = await authed.mutation(
      api.cases.confirmation.requestConfirmation,
      { caseId },
    );
    const twoToken = await readToken(t, two.tokenId);
    expect(twoToken!.expiresAt - twoToken!.createdAt).toBe(72 * 3600 * 1000);
  });

  test("fails closed without PUBLIC_APP_URL", async () => {
    const t = makeBackend();
    delete process.env.PUBLIC_APP_URL;
    const { authed, caseId } = await makeWipCase(t, "nourl", {
      reporterEmail: "resident@example.com",
    });
    await expect(
      authed.mutation(api.cases.confirmation.requestConfirmation, {
        caseId,
      }),
    ).rejects.toMatchObject({ data: { code: "INTERNAL_ERROR" } });
  });
});

describe("cases.consumeConfirmation", () => {
  async function awaitingCase(
    t: Backend,
    tag: string,
  ): Promise<{
    workspaceId: Id<"workspaces">;
    caseId: Id<"cases">;
  }> {
    const { workspaceId, caseId } = await makeWipCase(t, tag);
    await t.run(async (ctx) =>
      ctx.db.patch("cases", caseId, { status: "AWAITING_CONFIRMATION" }),
    );
    return { workspaceId, caseId };
  }

  test('"yes" resolves the case as resident-confirmed', async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await awaitingCase(t, "yes");
    await insertToken(t, workspaceId, caseId, "raw-yes-token");
    const result = await t.mutation(
      internal.cases.confirmation.consumeConfirmation,
      { rawToken: "raw-yes-token", decision: "yes" },
    );
    expect(result).toEqual({ caseId, status: "RESOLVED" });
    const record = await t.run(async (ctx) => ctx.db.get("cases", caseId));
    expect(record).toMatchObject({
      status: "RESOLVED",
      resolvedBy: "resident",
    });
    expect(record?.resolvedAt).toBeDefined();
    const activities = await activitiesForCase(t, caseId);
    const confirmed = activities.filter(
      (a) => a.type === "CONFIRMATION_CONFIRMED",
    );
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]).toMatchObject({ actorType: "resident" });
  });

  test('"no" returns the case to WORK_IN_PROGRESS', async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await awaitingCase(t, "no");
    const tokenId = await insertToken(t, workspaceId, caseId, "raw-no-token");
    const result = await t.mutation(
      internal.cases.confirmation.consumeConfirmation,
      { rawToken: "raw-no-token", decision: "no" },
    );
    expect(result).toEqual({ caseId, status: "WORK_IN_PROGRESS" });
    const record = await t.run(async (ctx) => ctx.db.get("cases", caseId));
    expect(record?.status).toBe("WORK_IN_PROGRESS");
    expect(record?.resolvedAt).toBeUndefined();
    const token = await readToken(t, tokenId);
    expect(token).toMatchObject({ decision: "no" });
    expect(token?.usedAt).toBeDefined();
    const activities = await activitiesForCase(t, caseId);
    expect(
      activities.filter((a) => a.type === "CONFIRMATION_DENIED"),
    ).toHaveLength(1);
  });

  test("rejects an already-used token without state change", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await awaitingCase(t, "used");
    await insertToken(t, workspaceId, caseId, "raw-used-token");
    await t.mutation(internal.cases.confirmation.consumeConfirmation, {
      rawToken: "raw-used-token",
      decision: "yes",
    });
    await expect(
      t.mutation(internal.cases.confirmation.consumeConfirmation, {
        rawToken: "raw-used-token",
        decision: "yes",
      }),
    ).rejects.toMatchObject({ data: { code: "TOKEN_USED" } });
    // Second consume changed nothing: still exactly one activity.
    const activities = await activitiesForCase(t, caseId);
    expect(
      activities.filter((a) => a.type === "CONFIRMATION_CONFIRMED"),
    ).toHaveLength(1);
  });

  test("rejects an expired token without state change", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await awaitingCase(t, "expired");
    await insertToken(t, workspaceId, caseId, "raw-expired-token", {
      expiresAt: Date.now() - 1000,
    });
    await expect(
      t.mutation(internal.cases.confirmation.consumeConfirmation, {
        rawToken: "raw-expired-token",
        decision: "yes",
      }),
    ).rejects.toMatchObject({ data: { code: "TOKEN_EXPIRED" } });
    const record = await t.run(async (ctx) => ctx.db.get("cases", caseId));
    expect(record?.status).toBe("AWAITING_CONFIRMATION");
  });

  test("rejects an unknown token as expired (no leakage)", async () => {
    const t = makeBackend();
    const { caseId } = await awaitingCase(t, "unknown");
    await expect(
      t.mutation(internal.cases.confirmation.consumeConfirmation, {
        rawToken: "never-issued-token",
        decision: "yes",
      }),
    ).rejects.toMatchObject({ data: { code: "TOKEN_EXPIRED" } });
    const record = await t.run(async (ctx) => ctx.db.get("cases", caseId));
    expect(record?.status).toBe("AWAITING_CONFIRMATION");
  });

  test("rejects when the case already moved on", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await awaitingCase(t, "movedon");
    await insertToken(t, workspaceId, caseId, "raw-moved-token");
    await t.run(async (ctx) =>
      ctx.db.patch("cases", caseId, { status: "RESOLVED" }),
    );
    await expect(
      t.mutation(internal.cases.confirmation.consumeConfirmation, {
        rawToken: "raw-moved-token",
        decision: "yes",
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    // Rejected consume leaves the token usable for audit, not consumed.
    const tokens = await t.run(async (ctx) =>
      ctx.db
        .query("confirmationTokens")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );
    expect(tokens).toHaveLength(1);
    expect(tokens[0].usedAt).toBeUndefined();
  });

  test("a 'no' token cannot later confirm with 'yes'", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await awaitingCase(t, "flip");
    await insertToken(t, workspaceId, caseId, "raw-flip-token");
    await t.mutation(internal.cases.confirmation.consumeConfirmation, {
      rawToken: "raw-flip-token",
      decision: "no",
    });
    await expect(
      t.mutation(internal.cases.confirmation.consumeConfirmation, {
        rawToken: "raw-flip-token",
        decision: "yes",
      }),
    ).rejects.toMatchObject({ data: { code: "TOKEN_USED" } });
    const record = await t.run(async (ctx) => ctx.db.get("cases", caseId));
    expect(record?.status).toBe("WORK_IN_PROGRESS");
  });
});

describe("cases.getConfirmationState", () => {
  async function insertTokenRow(
    t: Backend,
    workspaceId: Id<"workspaces">,
    caseId: Id<"cases">,
    tag: string,
    overrides: {
      usedAt?: number;
      decision?: "yes" | "no";
      expiresAt?: number;
      createdAt?: number;
    } = {},
  ) {
    const now = Date.now();
    return await t.run(async (ctx) =>
      ctx.db.insert("confirmationTokens", {
        workspaceId,
        caseId,
        tokenHash: hashToken(`raw-${tag}`),
        decision: overrides.decision,
        expiresAt: overrides.expiresAt ?? now + 72 * 3600 * 1000,
        usedAt: overrides.usedAt,
        createdAt: overrides.createdAt ?? now,
      }),
    );
  }

  test("requested is false when no tokens exist", async () => {
    const t = makeBackend();
    const { authed, caseId } = await makeWipCase(t, "nostate");
    const state = await authed.query(api.cases.confirmation.getConfirmationState, {
      caseId,
    });
    expect(state).toEqual({ requested: false });
  });

  test("requested is true with timestamps for a pending token", async () => {
    const t = makeBackend();
    const { authed, workspaceId, caseId } = await makeWipCase(t, "pending");
    await insertTokenRow(t, workspaceId, caseId, "pending-1");
    const state = await authed.query(api.cases.confirmation.getConfirmationState, {
      caseId,
    });
    expect(state.requested).toBe(true);
    expect(state.requestedAt).toBeDefined();
    expect(state.expiresAt).toBeGreaterThan(Date.now());
    expect(state.lastDecision).toBeUndefined();
  });

  test('lastDecision is "yes" after a yes consume', async () => {
    const t = makeBackend();
    const { authed, workspaceId, caseId } = await makeWipCase(t, "decyes");
    await insertTokenRow(t, workspaceId, caseId, "dec-yes-1", {
      usedAt: Date.now(),
      decision: "yes",
    });
    const state = await authed.query(api.cases.confirmation.getConfirmationState, {
      caseId,
    });
    expect(state.lastDecision).toBe("yes");
    expect(state.lastDecisionAt).toBeDefined();
  });

  test('lastDecision is "no" after a no consume', async () => {
    const t = makeBackend();
    const { authed, workspaceId, caseId } = await makeWipCase(t, "decno");
    await insertTokenRow(t, workspaceId, caseId, "dec-no-1", {
      usedAt: Date.now(),
      decision: "no",
    });
    const state = await authed.query(api.cases.confirmation.getConfirmationState, {
      caseId,
    });
    expect(state.lastDecision).toBe("no");
  });

  test("rejects a cross-workspace caseId with NOT_FOUND", async () => {
    const t = makeBackend();
    const a = await makeWipCase(t, "state-a");
    const b = await makeWipCase(t, "state-b");
    await expect(
      a.authed.query(api.cases.confirmation.getConfirmationState, {
        caseId: b.caseId,
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });

  test("expired-but-unused token does not count as pending", async () => {
    const t = makeBackend();
    const { authed, workspaceId, caseId } = await makeWipCase(t, "stale");
    await insertTokenRow(t, workspaceId, caseId, "stale-1", {
      expiresAt: Date.now() - 1000,
    });
    const state = await authed.query(api.cases.confirmation.getConfirmationState, {
      caseId,
    });
    expect(state).toEqual({ requested: false });
  });
});
