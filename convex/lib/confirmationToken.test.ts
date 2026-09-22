import { describe, expect, test } from "vitest";
import { sha256HexSync } from "./sha256";
import {
  buildConfirmationUrl,
  generateToken,
  hashToken,
} from "./confirmationToken";

function subtleHex(input: string): Promise<string> {
  return crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(input))
    .then(
      (digest) =>
        Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(""),
    );
}

describe("sha256HexSync", () => {
  test("matches the known vector for 'abc'", () => {
    expect(sha256HexSync("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  test("matches the known vector for the empty string", () => {
    expect(sha256HexSync("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  test("agrees with crypto.subtle across padding boundaries", async () => {
    // 55/56/64-byte inputs straddle SHA-256 padding block edges — the
    // classic place for hand-rolled implementations to break.
    const inputs = [
      "x".repeat(55),
      "x".repeat(56),
      "x".repeat(57),
      "x".repeat(64),
      "x".repeat(1000),
      "Ünïcodé ✓ esplanade",
      "a".repeat(100000),
    ];
    for (const input of inputs) {
      await expect(sha256HexSync(input)).toBe(await subtleHex(input));
    }
  });
});

describe("hashToken", () => {
  test("matches the known SHA-256 vector for 'abc'", () => {
    expect(hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  test("matches the known empty-string vector", () => {
    expect(hashToken("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  test("is deterministic across calls", () => {
    expect(hashToken("some-token-value")).toBe(
      hashToken("some-token-value"),
    );
  });
});

describe("generateToken", () => {
  test("returns a 43-char base64url-safe string", () => {
    const token = generateToken();
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  test("produces distinct outputs across 1000 calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      seen.add(generateToken());
    }
    expect(seen.size).toBe(1000);
  });
});

describe("buildConfirmationUrl", () => {
  test("embeds the token as a query param", () => {
    expect(
      buildConfirmationUrl("https://app.example.com", "raw-token-123"),
    ).toBe("https://app.example.com/confirm?token=raw-token-123");
  });

  test("rejects http:// and non-URL strings", () => {
    expect(() =>
      buildConfirmationUrl("http://app.example.com", "tok"),
    ).toThrow(/https/);
    expect(() => buildConfirmationUrl("not a url", "tok")).toThrow(
      /Invalid base URL/,
    );
    expect(() => buildConfirmationUrl("", "tok")).toThrow(
      /Invalid base URL/,
    );
  });
});
