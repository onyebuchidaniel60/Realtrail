// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ConvexError } from "convex/values";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { __setDraftMessageForTests } from "../lib/providers/openai";

const modules = import.meta.glob("/convex/**/*.ts");

function makeBackend() {
  return convexTest(schema, modules);
}

type Backend = ReturnType<typeof makeBackend>;

function identityFor(tag: string) {
  return {
    subject: `user_email_draft_${tag}`,
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
  // The public create does not provision an inbox; stamp test inbox
  // identity directly (provisioning is covered by 5-B tests).
  await t.run(async (ctx) =>
    ctx.db.patch("workspaces", created.workspaceId, {
      agentMailInboxId: `inbox_draft_${tag}`,
      agentMailInboxAddress: `estate-${tag}@agentmail.to`,
    }),
  );
  return { authed, ...created };
}

async function makeCase(
  t: Backend,
  tag: string,
): Promise<{
  workspaceId: Id<"workspaces">;
  caseId: Id<"cases">;
}> {
  const { authed, workspaceId } = await makeWorkspace(t, tag);
  const created = await authed.mutation(api.cases.mutations.createManual, {
    title: "Leaking pipe",
    description: "Kitchen pipe needs attention.",
    category: "plumbing",
    priority: "MEDIUM",
  });
  return { workspaceId, caseId: created.caseId };
}

async function makeVendor(
  t: Backend,
  workspaceId: Id<"workspaces">,
  overrides: { email?: string; name?: string } = {},
): Promise<Id<"vendors">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("vendors", {
      workspaceId,
      name: overrides.name ?? "Aqua Fix Ltd",
      serviceCategories: ["plumbing"],
      email: overrides.email ?? "vendor@example.com",
      phone: undefined,
      website: undefined,
      location: undefined,
      source: "manual",
      sourceUrl: undefined,
      notes: undefined,
      createdAt: 1_757_772_000_000,
      updatedAt: 1_757_772_000_000,
    }),
  );
}

function validDraft() {
  return {
    subject: "Request for pump repair quote",
    textBody: "Hello, please provide a quote for the pump repair.",
  };
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

async function listCommunications(t: Backend) {
  return await t.run(async (ctx) => ctx.db.query("communications").collect());
}

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_DRAFT_MODEL = "test-model";
  __setDraftMessageForTests(async () => validDraft());
});

afterEach(() => {
  __setDraftMessageForTests(undefined);
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_DRAFT_MODEL;
});

describe("generateDraft", () => {
  test("creates a draft communication for a vendor recipient", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await makeCase(t, "vendor");
    const vendorId = await makeVendor(t, workspaceId);
    const { communicationId } = await t.action(
      internal.email.draft.generateDraft,
      { caseId, recipientType: "vendor", recipientId: vendorId },
    );
    const comm = await readCommunication(t, communicationId);
    expect(comm).toMatchObject({
      workspaceId,
      caseId,
      direction: "outbound",
      participantType: "vendor",
      status: "draft",
      fromEmail: "estate-vendor@agentmail.to",
      toEmails: ["vendor@example.com"],
      subject: "Request for pump repair quote",
      aiDraftSource: true,
    });
    expect(comm?.approvedBy).toBeUndefined();
  });

  test("creates a draft for a resident recipient with a validated email", async () => {
    const t = makeBackend();
    const { caseId } = await makeCase(t, "resident");
    const { communicationId } = await t.action(
      internal.email.draft.generateDraft,
      {
        caseId,
        recipientType: "resident",
        recipientEmail: "resident@example.com",
      },
    );
    const comm = await readCommunication(t, communicationId);
    expect(comm).toMatchObject({
      participantType: "resident",
      status: "draft",
      toEmails: ["resident@example.com"],
      aiDraftSource: true,
    });
  });

  test("records a DRAFT_GENERATED activity with the recipient", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await makeCase(t, "activity");
    const vendorId = await makeVendor(t, workspaceId, {
      name: "Aqua Fix Ltd",
    });
    await t.action(internal.email.draft.generateDraft, {
      caseId,
      recipientType: "vendor",
      recipientId: vendorId,
    });
    const activities = await activitiesForCase(t, caseId);
    const generated = activities.filter((a) => a.type === "DRAFT_GENERATED");
    expect(generated).toHaveLength(1);
    expect(generated[0]).toMatchObject({
      actorType: "ai",
      summary: "AI draft created for Aqua Fix Ltd",
    });
  });

  test("malformed model output persists nothing", async () => {
    const t = makeBackend();
    const { caseId } = await makeCase(t, "malformed");
    __setDraftMessageForTests(async () => {
      throw new ConvexError({ code: "AI_ERROR", message: "bad shape" });
    });
    await expect(
      t.action(internal.email.draft.generateDraft, {
        caseId,
        recipientType: "resident",
        recipientEmail: "resident@example.com",
      }),
    ).rejects.toMatchObject({ data: { code: "AI_ERROR" } });
    expect(await listCommunications(t)).toHaveLength(0);
  });

  test("rejects a cross-workspace vendor with NOT_FOUND", async () => {
    const t = makeBackend();
    const { caseId } = await makeCase(t, "casews");
    const { workspaceId: otherWorkspace } = await makeWorkspace(t, "otherws");
    const foreignVendor = await makeVendor(t, otherWorkspace);
    await expect(
      t.action(internal.email.draft.generateDraft, {
        caseId,
        recipientType: "vendor",
        recipientId: foreignVendor,
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
    expect(await listCommunications(t)).toHaveLength(0);
  });

  test("rejects a missing case with NOT_FOUND", async () => {
    const t = makeBackend();
    const { caseId } = await makeCase(t, "gone");
    await t.run(async (ctx) => ctx.db.delete("cases", caseId));
    await expect(
      t.action(internal.email.draft.generateDraft, {
        caseId,
        recipientType: "resident",
        recipientEmail: "resident@example.com",
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
    expect(await listCommunications(t)).toHaveLength(0);
  });

  test("rejects drafting for a closed case", async () => {
    const t = makeBackend();
    const { caseId } = await makeCase(t, "closed");
    await t.run(async (ctx) =>
      ctx.db.patch("cases", caseId, { status: "CLOSED" }),
    );
    await expect(
      t.action(internal.email.draft.generateDraft, {
        caseId,
        recipientType: "resident",
        recipientEmail: "resident@example.com",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    expect(await listCommunications(t)).toHaveLength(0);
  });

  test("rejects a vendor without a usable email", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await makeCase(t, "noemail");
    const vendorId = await makeVendor(t, workspaceId, { email: undefined });
    // Patch email to an invalid value: undefined emails are allowed by
    // the schema, but the draft path requires a usable address.
    await t.run(async (ctx) =>
      ctx.db.patch("vendors", vendorId, { email: "not-an-email" }),
    );
    await expect(
      t.action(internal.email.draft.generateDraft, {
        caseId,
        recipientType: "vendor",
        recipientId: vendorId,
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  test("rejects an invalid resident email", async () => {
    const t = makeBackend();
    const { caseId } = await makeCase(t, "bademail");
    await expect(
      t.action(internal.email.draft.generateDraft, {
        caseId,
        recipientType: "resident",
        recipientEmail: "not-an-email",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  test("rejects overlong manager instructions", async () => {
    const t = makeBackend();
    const { caseId } = await makeCase(t, "longinstr");
    await expect(
      t.action(internal.email.draft.generateDraft, {
        caseId,
        recipientType: "resident",
        recipientEmail: "resident@example.com",
        instructions: "x".repeat(501),
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  test("fails closed without env configuration and persists nothing", async () => {
    const t = makeBackend();
    const { caseId } = await makeCase(t, "noenv");
    delete process.env.OPENAI_DRAFT_MODEL;
    await expect(
      t.action(internal.email.draft.generateDraft, {
        caseId,
        recipientType: "resident",
        recipientEmail: "resident@example.com",
      }),
    ).rejects.toMatchObject({ data: { code: "PROVIDER_ERROR" } });
    expect(await listCommunications(t)).toHaveLength(0);
  });
});
