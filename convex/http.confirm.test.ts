// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { hashToken } from "./lib/confirmationToken";

const modules = import.meta.glob("/convex/**/*.ts");

function makeBackend() {
  return convexTest(schema, modules);
}

type Backend = ReturnType<typeof makeBackend>;

// Fixed 43-char base64url token. Each test gets an isolated backend, so
// reuse across tests is safe.
const VALID_RAW = "v".repeat(43);
const OTHER_RAW = "w".repeat(43);

async function makeAwaitingCase(
  t: Backend,
  tag: string,
): Promise<{ workspaceId: Id<"workspaces">; caseId: Id<"cases"> }> {
  const authed = t.withIdentity({
    subject: `user_confirm_http_${tag}`,
    name: `Owner ${tag}`,
    email: `owner-${tag}@example.com`,
  });
  await authed.mutation(api.users.syncUser, {});
  const created = await authed.mutation(api.workspace.create, {
    workspaceName: `Estate ${tag}`,
    timezone: "Africa/Lagos",
    currency: "NGN",
    propertyName: "Palm Grove",
    propertyAddress: "1 Main Road, Lagos",
  });
  const made = await authed.mutation(api.cases.mutations.createManual, {
    title: "Distinctive broken pump title",
    description: "Distinctive pump description body.",
    category: "plumbing",
    priority: "MEDIUM",
    reporterEmail: "resident@example.com",
  });
  await t.run(async (ctx) =>
    ctx.db.patch("cases", made.caseId, { status: "AWAITING_CONFIRMATION" }),
  );
  return { workspaceId: created.workspaceId, caseId: made.caseId };
}

async function insertToken(
  t: Backend,
  workspaceId: Id<"workspaces">,
  caseId: Id<"cases">,
  rawToken: string,
  expiresAt?: number,
): Promise<void> {
  const now = Date.now();
  await t.run(async (ctx) =>
    ctx.db.insert("confirmationTokens", {
      workspaceId,
      caseId,
      tokenHash: hashToken(rawToken),
      decision: undefined,
      expiresAt: expiresAt ?? now + 72 * 3600 * 1000,
      usedAt: undefined,
      createdAt: now,
    }),
  );
}

async function caseStatus(
  t: Backend,
  caseId: Id<"cases">,
): Promise<string | undefined> {
  const record = await t.run(async (ctx) => ctx.db.get("cases", caseId));
  return record?.status;
}

async function confirmActivities(t: Backend, caseId: Id<"cases">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("caseActivities")
      .withIndex("by_caseId", (q) => q.eq("caseId", caseId))
      .collect(),
  );
}

function getConfirm(t: Backend, query: string) {
  return t.fetch(`/confirm${query}`, { method: "GET" });
}

function postConfirm(
  t: Backend,
  body: string,
  contentType = "application/x-www-form-urlencoded",
) {
  return t.fetch("/confirm", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
}

function formBody(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /confirm", () => {
  test("valid-format token renders the Yes/No form with the token", async () => {
    const t = makeBackend();
    const res = await getConfirm(t, `?token=${VALID_RAW}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('name="token"');
    expect(html).toContain(`value="${VALID_RAW}"`);
    expect(html).toContain('value="yes"');
    expect(html).toContain('value="no"');
    expect(html).toContain("Yes, it");
    expect(html).toContain("No, still an issue");
  });

  test("malformed token renders the invalid-link page with no form", async () => {
    const t = makeBackend();
    const res = await getConfirm(t, "?token=!!not-a-token!!");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("not valid");
    expect(html).not.toContain("<form");
  });

  test("missing token renders the invalid-link page", async () => {
    const t = makeBackend();
    const res = await getConfirm(t, "");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("not valid");
  });

  test("sets anti-leak response headers", async () => {
    const t = makeBackend();
    const res = await getConfirm(t, `?token=${VALID_RAW}`);
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("page body contains no case data", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await makeAwaitingCase(t, "nodata");
    await insertToken(t, workspaceId, caseId, VALID_RAW);
    const html = await (
      await getConfirm(t, `?token=${VALID_RAW}`)
    ).text();
    for (const secret of [
      "Distinctive broken pump title",
      "Distinctive pump description body",
      "Palm Grove",
      "resident@example.com",
      "k57",
    ]) {
      expect(html).not.toContain(secret);
    }
  });
});

describe("POST /confirm", () => {
  test("yes resolves the case and renders success", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await makeAwaitingCase(t, "yes");
    await insertToken(t, workspaceId, caseId, VALID_RAW);
    const res = await postConfirm(
      t,
      formBody({ token: VALID_RAW, decision: "yes" }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Your response has been recorded.");
    expect(await caseStatus(t, caseId)).toBe("RESOLVED");
  });

  test("no returns the case to work and renders success", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await makeAwaitingCase(t, "no");
    await insertToken(t, workspaceId, caseId, VALID_RAW);
    const res = await postConfirm(
      t,
      formBody({ token: VALID_RAW, decision: "no" }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Your response has been recorded.");
    expect(await caseStatus(t, caseId)).toBe("WORK_IN_PROGRESS");
  });

  test("reused token renders the generic error with case unchanged", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await makeAwaitingCase(t, "reuse");
    await insertToken(t, workspaceId, caseId, VALID_RAW);
    await postConfirm(t, formBody({ token: VALID_RAW, decision: "yes" }));
    const res = await postConfirm(
      t,
      formBody({ token: VALID_RAW, decision: "yes" }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("couldn");
    expect(await caseStatus(t, caseId)).toBe("RESOLVED");
  });

  test("expired token renders the generic error with case unchanged", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await makeAwaitingCase(t, "expired");
    await insertToken(t, workspaceId, caseId, VALID_RAW, Date.now() - 1000);
    const res = await postConfirm(
      t,
      formBody({ token: VALID_RAW, decision: "yes" }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("couldn");
    expect(await caseStatus(t, caseId)).toBe("AWAITING_CONFIRMATION");
  });

  test("unknown token renders the generic error with case unchanged", async () => {
    const t = makeBackend();
    const { caseId } = await makeAwaitingCase(t, "unknown");
    const res = await postConfirm(
      t,
      formBody({ token: OTHER_RAW, decision: "yes" }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("couldn");
    expect(await caseStatus(t, caseId)).toBe("AWAITING_CONFIRMATION");
  });

  test("malformed token never touches token state", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await makeAwaitingCase(t, "malformed");
    await insertToken(t, workspaceId, caseId, VALID_RAW);
    const res = await postConfirm(
      t,
      formBody({ token: "!!!", decision: "yes" }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("couldn");
    // The seeded valid token is untouched and the case unmoved — the
    // malformed request short-circuited before any database read.
    const tokens = await t.run(async (ctx) =>
      ctx.db
        .query("confirmationTokens")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );
    expect(tokens).toHaveLength(1);
    expect(tokens[0].usedAt).toBeUndefined();
    expect(await caseStatus(t, caseId)).toBe("AWAITING_CONFIRMATION");
    // Case creation logs CASE_CREATED; what matters is no confirmation
    // activity was recorded.
    const acts = await confirmActivities(t, caseId);
    expect(
      acts.filter((a) => a.type.startsWith("CONFIRMATION")),
    ).toHaveLength(0);
  });

  test("missing decision renders the generic error", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await makeAwaitingCase(t, "nodecision");
    await insertToken(t, workspaceId, caseId, VALID_RAW);
    const res = await postConfirm(t, formBody({ token: VALID_RAW }));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("couldn");
    expect(await caseStatus(t, caseId)).toBe("AWAITING_CONFIRMATION");
  });

  test('decision="maybe" renders the generic error', async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await makeAwaitingCase(t, "maybe");
    await insertToken(t, workspaceId, caseId, VALID_RAW);
    const res = await postConfirm(
      t,
      formBody({ token: VALID_RAW, decision: "maybe" }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("couldn");
    expect(await caseStatus(t, caseId)).toBe("AWAITING_CONFIRMATION");
  });

  test("missing token renders the generic error", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await makeAwaitingCase(t, "notoken");
    await insertToken(t, workspaceId, caseId, VALID_RAW);
    const res = await postConfirm(t, formBody({ decision: "yes" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("couldn");
    expect(await caseStatus(t, caseId)).toBe("AWAITING_CONFIRMATION");
  });

  test("wrong content-type renders the generic error", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await makeAwaitingCase(t, "ct");
    await insertToken(t, workspaceId, caseId, VALID_RAW);
    const res = await postConfirm(
      t,
      JSON.stringify({ token: VALID_RAW, decision: "yes" }),
      "application/json",
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("couldn");
    expect(await caseStatus(t, caseId)).toBe("AWAITING_CONFIRMATION");
  });

  test("success page contains no case data", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await makeAwaitingCase(t, "succdata");
    await insertToken(t, workspaceId, caseId, VALID_RAW);
    const html = await (
      await postConfirm(t, formBody({ token: VALID_RAW, decision: "yes" }))
    ).text();
    for (const secret of [
      "Distinctive broken pump title",
      "Distinctive pump description body",
      "Palm Grove",
      "resident@example.com",
      VALID_RAW,
    ]) {
      expect(html).not.toContain(secret);
    }
  });

  test("all error paths render byte-identical bodies", async () => {
    // Each failure mode gets a fresh backend with identical fixture data
    // so the only variable is the failure itself.
    const bodies: string[] = [];
    {
      const t = makeBackend();
      const { workspaceId, caseId } = await makeAwaitingCase(t, "eq1");
      await insertToken(t, workspaceId, caseId, VALID_RAW);
      bodies.push(
        await (
          await postConfirm(t, formBody({ token: OTHER_RAW, decision: "yes" }))
        ).text(),
      );
    }
    {
      const t = makeBackend();
      const { workspaceId, caseId } = await makeAwaitingCase(t, "eq2");
      await insertToken(t, workspaceId, caseId, VALID_RAW, Date.now() - 1000);
      bodies.push(
        await (
          await postConfirm(t, formBody({ token: VALID_RAW, decision: "yes" }))
        ).text(),
      );
    }
    {
      const t = makeBackend();
      const { workspaceId, caseId } = await makeAwaitingCase(t, "eq3");
      await insertToken(t, workspaceId, caseId, VALID_RAW);
      await postConfirm(t, formBody({ token: VALID_RAW, decision: "no" }));
      bodies.push(
        await (
          await postConfirm(t, formBody({ token: VALID_RAW, decision: "no" }))
        ).text(),
      );
    }
    {
      const t = makeBackend();
      await makeAwaitingCase(t, "eq4");
      bodies.push(
        await (await postConfirm(t, formBody({ token: "!!!", decision: "yes" }))).text(),
      );
    }
    for (const body of bodies.slice(1)) {
      expect(body).toBe(bodies[0]);
    }
  });

  test("raw token never appears in console output", async () => {
    const logged: string[] = [];
    for (const method of ["log", "warn", "error", "info"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(" "));
      });
    }
    const t = makeBackend();
    const { workspaceId, caseId } = await makeAwaitingCase(t, "nolog");
    await insertToken(t, workspaceId, caseId, VALID_RAW);
    await postConfirm(t, formBody({ token: VALID_RAW, decision: "yes" }));
    await postConfirm(t, formBody({ token: VALID_RAW, decision: "yes" }));
    await postConfirm(t, formBody({ token: OTHER_RAW, decision: "no" }));
    for (const line of logged) {
      expect(line).not.toContain(VALID_RAW);
      expect(line).not.toContain(OTHER_RAW);
    }
  });

  test("POST success sets no-store cache headers", async () => {
    const t = makeBackend();
    const { workspaceId, caseId } = await makeAwaitingCase(t, "cache");
    await insertToken(t, workspaceId, caseId, VALID_RAW);
    const res = await postConfirm(
      t,
      formBody({ token: VALID_RAW, decision: "yes" }),
    );
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });
});
