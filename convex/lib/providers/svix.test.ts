import { describe, expect, test } from "vitest";
import { sha256Hex, verifySvixSignature } from "./svix";

// Test-only HMAC helper. Production verification lives in svix.ts; this
// helper only *creates* signatures so tests can prove the verifier accepts
// and rejects the right things.
async function sign(
  secretBase64: string,
  svixId: string,
  svixTimestamp: string,
  rawBody: string,
): Promise<string> {
  const bytes = Uint8Array.from(atob(secretBase64), (char) =>
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

// Deterministic 32-byte key, base64-encoded, with the Svix prefix.
const SECRET_KEY_BYTES = Array.from({ length: 32 }, (_, i) => i + 1);
const SECRET =
  "whsec_" +
  btoa(String.fromCharCode(...SECRET_KEY_BYTES));

const SVIX_ID = "msg_test_123";
const BODY = JSON.stringify({ providerEventId: "evt_1" });
const TIMESTAMP_SECONDS = 1_757_772_000;
const NOW_MS = TIMESTAMP_SECONDS * 1000;

async function validSignature(): Promise<string> {
  return sign(
    SECRET.slice("whsec_".length),
    SVIX_ID,
    String(TIMESTAMP_SECONDS),
    BODY,
  );
}

describe("verifySvixSignature", () => {
  test("valid signature with fresh timestamp verifies", async () => {
    const signature = await validSignature();
    const result = await verifySvixSignature({
      secret: SECRET,
      headers: {
        svixId: SVIX_ID,
        svixTimestamp: String(TIMESTAMP_SECONDS),
        svixSignature: `v1,${signature}`,
      },
      rawBody: BODY,
      nowMs: NOW_MS,
    });
    expect(result).toEqual({ ok: true });
  });

  test("wrong signature fails", async () => {
    const result = await verifySvixSignature({
      secret: SECRET,
      headers: {
        svixId: SVIX_ID,
        svixTimestamp: String(TIMESTAMP_SECONDS),
        svixSignature: `v1,${"A".repeat(44)}`,
      },
      rawBody: BODY,
      nowMs: NOW_MS,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("WEBHOOK_INVALID");
    }
  });

  test("tampered body fails", async () => {
    const signature = await validSignature();
    const result = await verifySvixSignature({
      secret: SECRET,
      headers: {
        svixId: SVIX_ID,
        svixTimestamp: String(TIMESTAMP_SECONDS),
        svixSignature: `v1,${signature}`,
      },
      rawBody: JSON.stringify({ providerEventId: "evt_TAMPERED" }),
      nowMs: NOW_MS,
    });
    expect(result.ok).toBe(false);
  });

  test("timestamp older than 5 minutes fails", async () => {
    const oldSeconds = TIMESTAMP_SECONDS - 301;
    const key = SECRET.slice("whsec_".length);
    const signature = await sign(key, SVIX_ID, String(oldSeconds), BODY);
    const result = await verifySvixSignature({
      secret: SECRET,
      headers: {
        svixId: SVIX_ID,
        svixTimestamp: String(oldSeconds),
        svixSignature: `v1,${signature}`,
      },
      rawBody: BODY,
      nowMs: NOW_MS,
    });
    expect(result).toMatchObject({ ok: false, code: "WEBHOOK_INVALID" });
  });

  test("timestamp newer than 5 minutes in the future fails", async () => {
    const futureSeconds = TIMESTAMP_SECONDS + 301;
    const key = SECRET.slice("whsec_".length);
    const signature = await sign(key, SVIX_ID, String(futureSeconds), BODY);
    const result = await verifySvixSignature({
      secret: SECRET,
      headers: {
        svixId: SVIX_ID,
        svixTimestamp: String(futureSeconds),
        svixSignature: `v1,${signature}`,
      },
      rawBody: BODY,
      nowMs: NOW_MS,
    });
    expect(result).toMatchObject({ ok: false, code: "WEBHOOK_INVALID" });
  });

  test("missing svix-id fails", async () => {
    const signature = await validSignature();
    const result = await verifySvixSignature({
      secret: SECRET,
      headers: {
        svixId: undefined,
        svixTimestamp: String(TIMESTAMP_SECONDS),
        svixSignature: `v1,${signature}`,
      },
      rawBody: BODY,
      nowMs: NOW_MS,
    });
    expect(result).toMatchObject({ ok: false, code: "WEBHOOK_INVALID" });
  });

  test("missing svix-timestamp fails", async () => {
    const signature = await validSignature();
    const result = await verifySvixSignature({
      secret: SECRET,
      headers: {
        svixId: SVIX_ID,
        svixTimestamp: undefined,
        svixSignature: `v1,${signature}`,
      },
      rawBody: BODY,
      nowMs: NOW_MS,
    });
    expect(result).toMatchObject({ ok: false, code: "WEBHOOK_INVALID" });
  });

  test("missing svix-signature fails", async () => {
    const result = await verifySvixSignature({
      secret: SECRET,
      headers: {
        svixId: SVIX_ID,
        svixTimestamp: String(TIMESTAMP_SECONDS),
        svixSignature: undefined,
      },
      rawBody: BODY,
      nowMs: NOW_MS,
    });
    expect(result).toMatchObject({ ok: false, code: "WEBHOOK_INVALID" });
  });

  test("space-separated signatures verify when one matches", async () => {
    const good = await validSignature();
    const result = await verifySvixSignature({
      secret: SECRET,
      headers: {
        svixId: SVIX_ID,
        svixTimestamp: String(TIMESTAMP_SECONDS),
        svixSignature: `v1,${"A".repeat(44)} v1,${good}`,
      },
      rawBody: BODY,
      nowMs: NOW_MS,
    });
    expect(result).toEqual({ ok: true });
  });

  test("comma-separated signatures verify when one matches", async () => {
    const good = await validSignature();
    const result = await verifySvixSignature({
      secret: SECRET,
      headers: {
        svixId: SVIX_ID,
        svixTimestamp: String(TIMESTAMP_SECONDS),
        svixSignature: `v1,${"A".repeat(44)},v1,${good}`,
      },
      rawBody: BODY,
      nowMs: NOW_MS,
    });
    expect(result).toEqual({ ok: true });
  });

  test("secret without whsec_ prefix fails with a clear error", async () => {
    const signature = await validSignature();
    const result = await verifySvixSignature({
      secret: SECRET.slice("whsec_".length),
      headers: {
        svixId: SVIX_ID,
        svixTimestamp: String(TIMESTAMP_SECONDS),
        svixSignature: `v1,${signature}`,
      },
      rawBody: BODY,
      nowMs: NOW_MS,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/whsec_/);
    }
  });

  test("truncated signature fails the length pre-check", async () => {
    const full = await validSignature();
    const truncated = full.slice(0, 20);
    const result = await verifySvixSignature({
      secret: SECRET,
      headers: {
        svixId: SVIX_ID,
        svixTimestamp: String(TIMESTAMP_SECONDS),
        svixSignature: `v1,${truncated}`,
      },
      rawBody: BODY,
      nowMs: NOW_MS,
    });
    expect(result).toMatchObject({ ok: false, code: "WEBHOOK_INVALID" });
  });
});

describe("sha256Hex", () => {
  test("matches the known SHA-256 vector for 'abc'", async () => {
    await expect(sha256Hex("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
