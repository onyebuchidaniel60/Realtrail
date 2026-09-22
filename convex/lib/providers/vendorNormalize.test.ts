import { describe, expect, test } from "vitest";
import {
  extractContactInfo,
  normalizeSearchResults,
  truncateEvidence,
} from "./vendorNormalize";
import type { FirecrawlSearchResult } from "./firecrawl";

function searchResult(overrides: Partial<FirecrawlSearchResult> = {}): FirecrawlSearchResult {
  return {
    url: "https://example-plumbing.example.com/",
    title: "Example Plumbing Co - Emergency Plumber Lagos",
    description: "24/7 plumber in Lagos. Call for water pressure repairs.",
    ...overrides,
  };
}

describe("normalizeSearchResults rank bands", () => {
  test("category + locality match is high_relevance", () => {
    const [entry] = normalizeSearchResults({
      results: [searchResult()],
      targetCategory: "plumbing",
      targetLocality: "Lagos",
    });
    expect(entry.rankBand).toBe("high_relevance");
    expect(entry.providerName).toBe("Example Plumbing Co");
    expect(entry.website).toBe("https://example-plumbing.example.com/");
  });

  test("category match alone is relevant", () => {
    const [entry] = normalizeSearchResults({
      results: [searchResult()],
      targetCategory: "plumbing",
      targetLocality: "Abuja",
    });
    expect(entry.rankBand).toBe("relevant");
  });

  test("locality match alone is relevant", () => {
    const [entry] = normalizeSearchResults({
      results: [
        searchResult({
          title: "General Services Ltd",
          description: "Office support in Lagos.",
        }),
      ],
      targetCategory: "electrical",
      targetLocality: "Lagos",
    });
    expect(entry.rankBand).toBe("relevant");
  });

  test("neither match is other", () => {
    const [entry] = normalizeSearchResults({
      results: [
        searchResult({
          title: "General Services Ltd",
          description: "Office support in Abuja.",
        }),
      ],
      targetCategory: "electrical",
      targetLocality: "Lagos",
    });
    expect(entry.rankBand).toBe("other");
  });

  test("missing locality never counts as a locality match", () => {
    const [entry] = normalizeSearchResults({
      results: [searchResult()],
      targetCategory: "plumbing",
      targetLocality: undefined,
    });
    expect(entry.rankBand).toBe("relevant");
  });

  test("output carries no numeric score", () => {
    const [entry] = normalizeSearchResults({
      results: [searchResult()],
      targetCategory: "plumbing",
      targetLocality: "Lagos",
    });
    expect(entry).toEqual({
      providerName: expect.any(String),
      website: expect.any(String),
      description: expect.any(String),
      rankBand: expect.any(String),
    });
    for (const value of Object.values(entry)) {
      expect(typeof value === "number").toBe(false);
    }
  });

  test("provider name falls back to hostname for empty titles", () => {
    const [entry] = normalizeSearchResults({
      results: [searchResult({ title: "" })],
      targetCategory: "plumbing",
      targetLocality: undefined,
    });
    expect(entry.providerName).toBe("example-plumbing.example.com");
  });
});

describe("extractContactInfo", () => {
  test("finds email and phone in realistic markdown", () => {
    const result = extractContactInfo({
      scraped: {
        url: "https://example.com/",
        markdown:
          "# Example Plumbing\nCall us now on +234 801 234 5678 or write to info@example-plumbing.example.com.\nServing Lagos mainland.",
        title: "Example",
        metadata: {},
      },
    });
    expect(result.email).toBe("info@example-plumbing.example.com");
    expect(result.phone).toBe("+234 801 234 5678");
    expect(result.location).toBe("Lagos mainland");
  });

  test("returns undefined when nothing matches", () => {
    const result = extractContactInfo({
      scraped: {
        url: "https://example.com/",
        markdown: "Welcome to our homepage. No contact details here.",
        title: undefined,
        metadata: {},
      },
    });
    expect(result).toEqual({
      email: undefined,
      phone: undefined,
      location: undefined,
    });
  });

  test("oversized matches are rejected, not truncated silently", () => {
    const longLocal = `${"a".repeat(250)}@example.com`;
    const result = extractContactInfo({
      scraped: {
        url: "https://example.com/",
        markdown: `Reach us at ${longLocal} today.`,
        title: undefined,
        metadata: {},
      },
    });
    expect(result.email).toBeUndefined();
  });
});

describe("truncateEvidence", () => {
  test("collapses whitespace and truncates with ellipsis", () => {
    expect(truncateEvidence("a\n\n  b\tc", 100)).toBe("a b c");
    const long = truncateEvidence("x".repeat(600));
    expect(long.length).toBeLessThanOrEqual(501);
    expect(long.endsWith("…")).toBe(true);
  });

  test("short text passes through untouched", () => {
    expect(truncateEvidence("  hello  ")).toBe("hello");
  });
});
