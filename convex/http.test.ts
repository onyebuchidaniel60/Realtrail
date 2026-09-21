// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import schema from "./schema";

const modules = import.meta.glob("/convex/**/*.ts");

function makeBackend() {
  return convexTest(schema, modules);
}

type Backend = ReturnType<typeof makeBackend>;

// Clearly fake test-only webhook secret (32 bytes 1..32, base64).
const SECRET =
  "whsec_" + btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i + 1)));

async function sign(
  svixId: string,
  svixTimestamp: string,
  rawBody: string,
): Promise<string> {
  const bytes = Uint8Array.from(atob(SECRET.slice("whsec_".length)), (char) =>
    char.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${svixId}.${svixTimestamp}.${rawBody}`),
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

function bodyFor(eventId: string): string {
  return JSON.stringify({
    providerEventId: eventId,
    providerMessageId: `msg_${eventId}`,
    providerInboxId: "inbox_http_1",
    eventType: "message.received",
  });
}

async function postWebhook(
  t: Backend,
  rawBody: string,
  overrides: { svixId?: string; signature?: string; omit?: string } = {},
) {
  const svixId = overrides.svixId ?? "msg_hook_1";
  const svixTimestamp = String(Math.floor(Date.now() / 1000));
  const signature = overrides.signature ?? (await sign(svixId, svixTimestamp, rawBody));
  const headers: Record<string, string> = {
    "svix-id": svixId,
    "svix-timestamp": svixTimestamp,
    "svix-signature": `v1,${signature}`,
    "Content-Type": "application/json",
  };
  if (overrides.omit !== undefined) {
    delete headers[overrides.omit];
  }
  return t.fetch("/webhooks/agentmail", {
    method: "POST",
    headers,
    body: rawBody,
  });
}

async function countEvents(t: Backend): Promise<number> {
  const rows = await t.run(async (ctx) =>
    ctx.db.query("inboundEvents").collect(),
  );
  return rows.length;
}

beforeEach(() => {
  process.env.AGENTMAIL_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.AGENTMAIL_WEBHOOK_SECRET;
});

describe("POST /webhooks/agentmail", () => {
  test("valid signature returns 200 and records one event", async () => {
    const t = makeBackend();
    const res = await postWebhook(t, bodyFor("evt_http_1"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
    expect(await countEvents(t)).toBe(1);
  });

  test("invalid signature returns 401 and records nothing", async () => {
    const t = makeBackend();
    const res = await postWebhook(t, bodyFor("evt_http_2"), {
      signature: "A".repeat(44),
    });
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      code: "WEBHOOK_INVALID",
    });
    expect(await countEvents(t)).toBe(0);
  });

  test("each missing header returns 400", async () => {
    for (const omit of ["svix-id", "svix-timestamp", "svix-signature"]) {
      const t = makeBackend();
      const res = await postWebhook(t, bodyFor("evt_http_3"), { omit });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({
        code: "WEBHOOK_INVALID",
      });
      expect(await countEvents(t)).toBe(0);
    }
  });

  test("duplicate provider event returns 200 with no new rows", async () => {
    const t = makeBackend();
    const first = await postWebhook(t, bodyFor("evt_http_4"));
    expect(first.status).toBe(200);
    const second = await postWebhook(t, bodyFor("evt_http_4"), {
      svixId: "msg_hook_2",
    });
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual({ received: true });
    expect(await countEvents(t)).toBe(1);
  });
});
