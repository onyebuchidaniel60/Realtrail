// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  __setTriageMessageForTests,
  type TriageSuggestion,
} from "../lib/providers/openai";

const modules = import.meta.glob("/convex/**/*.ts");

function makeBackend() {
  return convexTest(schema, modules);
}

type Backend = ReturnType<typeof makeBackend>;

const OWNER = {
  subject: "user_triage_a",
  name: "Owner A",
  email: "owner-a@example.com",
};

async function makeWorkspace(t: Backend) {
  const authed = t.withIdentity(OWNER);
  await authed.mutation(api.users.syncUser, {});
  const created = await authed.mutation(api.workspace.create, {
    workspaceName: "Triage Estate",
    timezone: "Africa/Lagos",
    currency: "NGN",
    propertyName: "Palm Grove",
    propertyAddress: "1 Main Road, Lagos",
  });
  return { authed, ...created };
}

async function insertCommunication(
  t: Backend,
  workspaceId: Id<"workspaces">,
): Promise<Id<"communications">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("communications", {
      workspaceId,
      caseId: undefined,
      direction: "inbound",
      participantType: "other",
      agentMailInboxId: "inbox_triage_1",
      agentMailThreadId: "thread_triage_1",
      agentMailMessageId: "msg_triage_1",
      status: "received",
      fromEmail: "resident@example.com",
      toEmails: ["estate@example.com"],
      subject: "Low water pressure",
      textBody: "Pressure has been low since yesterday.",
      aiDraftSource: false,
      approvedBy: undefined,
      approvedAt: undefined,
      providerDraftId: undefined,
      providerMessageId: "msg_triage_1",
      lastError: undefined,
      readAt: undefined,
      triagedAt: undefined,
      triageCaseId: undefined,
      triageAttempts: undefined,
      triageFailedAt: undefined,
      triageError: undefined,
      createdAt: 1_757_772_000_000,
      updatedAt: 1_757_772_000_000,
    }),
  );
}

function suggestionFor(
  propertyId: string | null,
  overrides: Partial<TriageSuggestion> = {},
): TriageSuggestion {
  return {
    title: "Low water pressure in Palm Grove",
    summary: "Residents report reduced water pressure.",
    category: "water",
    prioritySuggestion: "HIGH",
    propertyCandidateId: propertyId,
    buildingCandidateId: null,
    unitCandidateId: null,
    affectedArea: "Block C",
    missingInformation: [],
    suggestedNextAction: "Inspect the water pump.",
    possibleRelatedCaseIds: [],
    needsReview: true,
    ...overrides,
  };
}

async function readCommunication(t: Backend, id: Id<"communications">) {
  return await t.run(async (ctx) => ctx.db.get("communications", id));
}

async function listCases(t: Backend) {
  return await t.run(async (ctx) => ctx.db.query("cases").collect());
}

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_TRIAGE_MODEL = "test-model";
});

afterEach(() => {
  __setTriageMessageForTests(undefined);
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_TRIAGE_MODEL;
});

describe("triageInbound", () => {
  test("successful triage creates a completed NEW case with mapped fields", async () => {
    const t = makeBackend();
    const { workspaceId, propertyId } = await makeWorkspace(t);
    const communicationId = await insertCommunication(t, workspaceId);
    __setTriageMessageForTests(async () =>
      suggestionFor(propertyId as string),
    );
    const result = await t.action(internal.email.triage.triageInbound, {
      communicationId,
    });
    expect(result).toEqual({ status: "triaged" });

    const cases = await listCases(t);
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({
      status: "NEW",
      title: "Low water pressure in Palm Grove",
      category: "water",
      priority: "HIGH",
      propertyId,
      locationUnknown: false,
      aiTriageStatus: "completed",
      aiTriageVersion: "v1",
      reporterEmail: "resident@example.com",
      nextActionLabel: "Inspect the water pump.",
    });
    expect(cases[0].aiTriageOutput).toMatchObject({
      propertyCandidateId: propertyId,
    });

    const activities = await t.run(async (ctx) =>
      ctx.db
        .query("caseActivities")
        .withIndex("by_caseId", (q) => q.eq("caseId", cases[0]._id))
        .collect(),
    );
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      type: "AI_TRIAGE_COMPLETED",
      actorType: "ai",
    });

    const comm = await readCommunication(t, communicationId);
    expect(comm?.triageCaseId).toBe(cases[0]._id);
    expect(comm?.triagedAt).toBeDefined();
  });

  test("unknown category maps to other and location stays unknown-safe", async () => {
    const t = makeBackend();
    const { workspaceId } = await makeWorkspace(t);
    const communicationId = await insertCommunication(t, workspaceId);
    __setTriageMessageForTests(async () =>
      suggestionFor(null, { category: "teleportation" }),
    );
    await t.action(internal.email.triage.triageInbound, { communicationId });
    const cases = await listCases(t);
    expect(cases).toHaveLength(1);
    expect(cases[0].category).toBe("other");
    expect(cases[0].propertyId).toBeUndefined();
    expect(cases[0].locationUnknown).toBe(true);
  });

  test("invalid property candidate ID is dropped", async () => {
    const t = makeBackend();
    const { workspaceId } = await makeWorkspace(t);
    const communicationId = await insertCommunication(t, workspaceId);
    __setTriageMessageForTests(async () =>
      suggestionFor("not-a-real-id"),
    );
    await t.action(internal.email.triage.triageInbound, { communicationId });
    const cases = await listCases(t);
    expect(cases).toHaveLength(1);
    expect(cases[0].propertyId).toBeUndefined();
    expect(cases[0].locationUnknown).toBe(true);
    expect(cases[0].aiTriageOutput).toMatchObject({
      propertyCandidateId: null,
    });
  });

  test("invalid related case IDs are dropped from the output", async () => {
    const t = makeBackend();
    const { workspaceId, propertyId } = await makeWorkspace(t);
    const communicationId = await insertCommunication(t, workspaceId);
    __setTriageMessageForTests(async () =>
      suggestionFor(propertyId as string, {
        possibleRelatedCaseIds: ["also-not-real", "bogus"],
      }),
    );
    await t.action(internal.email.triage.triageInbound, { communicationId });
    const cases = await listCases(t);
    expect(cases[0].aiTriageOutput).toMatchObject({
      possibleRelatedCaseIds: [],
    });
  });

  test("triage failure creates no case and records the failure", async () => {
    const t = makeBackend();
    const { workspaceId } = await makeWorkspace(t);
    const communicationId = await insertCommunication(t, workspaceId);
    __setTriageMessageForTests(async () => {
      throw new Error("model down");
    });
    const result = await t.action(internal.email.triage.triageInbound, {
      communicationId,
    });
    expect(result).toEqual({ status: "retry_scheduled" });
    expect(await listCases(t)).toHaveLength(0);
    const comm = await readCommunication(t, communicationId);
    expect(comm).toMatchObject({
      triageAttempts: 1,
      triageError: "Triage failed.",
    });
    expect(comm?.triageFailedAt).toBeDefined();
    expect(comm?.triageCaseId).toBeUndefined();
  });

  test("missing OpenAI env fails gracefully without a case", async () => {
    const t = makeBackend();
    delete process.env.OPENAI_API_KEY;
    const { workspaceId } = await makeWorkspace(t);
    const communicationId = await insertCommunication(t, workspaceId);
    const result = await t.action(internal.email.triage.triageInbound, {
      communicationId,
    });
    expect(result).toEqual({ status: "retry_scheduled" });
    expect(await listCases(t)).toHaveLength(0);
  });

  test("running twice on the same communication creates one case", async () => {
    const t = makeBackend();
    const { workspaceId, propertyId } = await makeWorkspace(t);
    const communicationId = await insertCommunication(t, workspaceId);
    __setTriageMessageForTests(async () =>
      suggestionFor(propertyId as string),
    );
    const first = await t.action(internal.email.triage.triageInbound, {
      communicationId,
    });
    const second = await t.action(internal.email.triage.triageInbound, {
      communicationId,
    });
    expect(first).toEqual({ status: "triaged" });
    expect(second).toEqual({ status: "skipped" });
    expect(await listCases(t)).toHaveLength(1);
  });

  test("workspace without members fails gracefully", async () => {
    const t = makeBackend();
    const { workspaceId } = await makeWorkspace(t);
    const communicationId = await insertCommunication(t, workspaceId);
    await t.run(async (ctx) => {
      const memberships = await ctx.db.query("workspaceMembers").collect();
      for (const membership of memberships) {
        await ctx.db.delete("workspaceMembers", membership._id);
      }
    });
    __setTriageMessageForTests(async () => suggestionFor(null));
    const result = await t.action(internal.email.triage.triageInbound, {
      communicationId,
    });
    expect(result).toEqual({ status: "retry_scheduled" });
    expect(await listCases(t)).toHaveLength(0);
  });

  test("exhausted retry budget stops without further work", async () => {
    const t = makeBackend();
    const { workspaceId } = await makeWorkspace(t);
    const communicationId = await insertCommunication(t, workspaceId);
    await t.run(async (ctx) => {
      await ctx.db.patch("communications", communicationId, {
        triageAttempts: 3,
      });
    });
    let calls = 0;
    __setTriageMessageForTests(async () => {
      calls += 1;
      return suggestionFor(null);
    });
    const result = await t.action(internal.email.triage.triageInbound, {
      communicationId,
    });
    expect(result).toEqual({ status: "exhausted" });
    expect(calls).toBe(0);
    expect(await listCases(t)).toHaveLength(0);
  });
});
