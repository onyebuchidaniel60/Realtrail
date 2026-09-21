// Svix webhook signature verification (AgentMail's webhook provider).
//
// Pure function: no Convex ctx, no fetch, no db. Runs in the HTTP action's
// V8 isolate, so it uses Web Crypto (crypto.subtle) — never Node's crypto
// module — plus a small hand-rolled base64 decoder (no atob dependency).
//
// Svix scheme:
//   Headers: svix-id, svix-timestamp, svix-signature
//   Signed payload = "<svix-id>.<svix-timestamp>.<rawBody>"
//   Signature      = base64(HMAC-SHA256(signing-key, signed-payload))
//   signing-key    = base64-decode(secret after stripping "whsec_")
//   svix-signature may carry several space/comma-separated "v1,<sig>"
//   values; verification accepts if ANY of them matches.

const FRESHNESS_WINDOW_MS = 300_000; // 5 minutes
const HMAC_SHA256_BYTES = 32;

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64Decode(input: string): Uint8Array<ArrayBuffer> | undefined {
  const chars = input.replace(/\s/g, "");
  if (chars.length === 0 || chars.length % 4 !== 0) {
    return undefined;
  }
  const output = new Uint8Array((chars.length / 4) * 3);
  let out = 0;
  for (let i = 0; i < chars.length; i += 4) {
    const sextets: Array<number> = [];
    let padding = 0;
    for (let j = 0; j < 4; j += 1) {
      const char = chars[i + j];
      if (char === "=") {
        // Padding is only legal in the final quantum.
        if (i + 4 !== chars.length || j < 2) {
          return undefined;
        }
        padding += 1;
        sextets.push(0);
        continue;
      }
      if (padding > 0) {
        return undefined;
      }
      const sextet = BASE64_ALPHABET.indexOf(char);
      if (sextet < 0) {
        return undefined;
      }
      sextets.push(sextet);
    }
    const triple =
      (sextets[0] << 18) |
      (sextets[1] << 12) |
      (sextets[2] << 6) |
      sextets[3];
    output[out] = (triple >> 16) & 0xff;
    out += 1;
    if (padding < 2) {
      output[out] = (triple >> 8) & 0xff;
      out += 1;
    }
    if (padding === 0) {
      output[out] = triple & 0xff;
      out += 1;
    }
  }
  return output.slice(0, out);
}

export type SvixHeaders = {
  svixId: string | undefined | null;
  svixTimestamp: string | undefined | null;
  svixSignature: string | undefined | null;
};

export type SvixVerifyResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

function fail(message: string): SvixVerifyResult {
  return { ok: false, code: "WEBHOOK_INVALID", message };
}

// sha256 of text, hex-encoded. Used for the inboundEvents payloadHash so a
// future reconciliation job can match a stored event against provider logs.
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifySvixSignature(args: {
  secret: string;
  headers: SvixHeaders;
  rawBody: string;
  // Test seam: deterministic "now" for freshness tests. Defaults to the
  // wall clock. Passing time in (rather than reading it deep inside) keeps
  // the function pure and the tests deterministic.
  nowMs?: number;
}): Promise<SvixVerifyResult> {
  const { svixId, svixTimestamp, svixSignature } = args.headers;
  if (!svixId || !svixTimestamp || !svixSignature) {
    return fail("Missing Svix webhook headers.");
  }
  const timestampSeconds = Number(svixTimestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return fail("Invalid svix-timestamp header.");
  }
  const nowMs = args.nowMs ?? Date.now();
  if (Math.abs(nowMs - timestampSeconds * 1000) > FRESHNESS_WINDOW_MS) {
    return fail("Stale Svix webhook timestamp.");
  }
  if (!args.secret.startsWith("whsec_")) {
    return fail('Invalid webhook secret: expected a "whsec_" prefix.');
  }
  const keyBytes = base64Decode(args.secret.slice("whsec_".length));
  if (keyBytes === undefined || keyBytes.length === 0) {
    return fail("Malformed webhook secret: key material is not base64.");
  }
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    return fail("Malformed webhook secret: key import failed.");
  }
  const signedPayload = new TextEncoder().encode(
    `${svixId}.${svixTimestamp}.${args.rawBody}`,
  );
  const tokens = svixSignature
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  for (const token of tokens) {
    const encoded = token.startsWith("v1,") ? token.slice(3) : token;
    const candidate = base64Decode(encoded);
    if (candidate === undefined) {
      continue;
    }
    // Length pre-check before the constant-time compare: an HMAC-SHA256
    // signature is always 32 bytes, so anything else cannot match.
    if (candidate.byteLength !== HMAC_SHA256_BYTES) {
      continue;
    }
    // crypto.subtle.verify performs the comparison in constant time.
    try {
      const matches = await crypto.subtle.verify(
        "HMAC",
        key,
        candidate,
        signedPayload,
      );
      if (matches) {
        return { ok: true };
      }
    } catch {
      continue;
    }
  }
  return fail("Svix signature mismatch.");
}
