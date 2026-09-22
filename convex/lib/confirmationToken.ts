// Resident confirmation tokens (Phase 9-A).
//
// Security model: the database stores ONLY the SHA-256 hash. The raw
// token lives exclusively in the outbound email body the resident
// receives. An attacker with read access to confirmationTokens learns
// nothing usable — hashes cannot be reversed into links.
//
// Pure module: no I/O, no timestamps, no randomness except the single
// crypto.getRandomValues call in generateToken. Safe to import from
// mutations (synchronous) — unlike crypto.subtle, nothing here awaits.

import { sha256HexSync } from "./sha256";

const TOKEN_BYTES = 32;

export function generateToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  // 32 bytes → 44 base64 chars with one "=" pad → 43 after stripping.
  // base64url alphabet only: safe in URLs, emails, and logs.
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function hashToken(rawToken: string): string {
  return sha256HexSync(rawToken);
}

export function buildConfirmationUrl(
  baseUrl: string,
  rawToken: string,
): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("Invalid base URL for confirmation link.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Confirmation links require an https base URL.");
  }
  // Origin only: a base URL with a path or query would produce a
  // misleading link target, so it is normalized away. The token goes in
  // the query; the decision is NOT embedded — the resident chooses
  // yes/no on the page (Phase 9-B).
  return `${parsed.origin}/confirm?token=${encodeURIComponent(rawToken)}`;
}
