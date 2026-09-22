"use node";

// Firecrawl provider adapter (ARCHITECTURE.md §17, §32).
//
// API difference note: the task brief pinned base URL
// https://api.firecrawl.dev/v1, but the current Firecrawl API is v2
// (verified against https://docs.firecrawl.dev/api-reference). This
// module implements v2:
//   POST {base}/v2/search  { query, limit }                       -> { success, data: { web: [{ url, title, description }] } }
//   POST {base}/v2/scrape  { url, formats: ["markdown"], onlyMainContent: true }
//                                                                -> { success, data: { markdown, metadata: { title } } }
// Auth is Bearer on both. Only the fields in the exported shapes below
// are returned; raw provider JSON never leaves this module.
//
// Privacy: callers must only pass server-constructed queries (category +
// locality). Never pass case titles, descriptions, notes, or contact
// details here — see vendorSearch.ts.

import { appError } from "../errors";

export type FirecrawlSearchResult = {
  url: string;
  title: string;
  description: string;
};

export type FirecrawlScrapeResult = {
  url: string;
  markdown: string;
  title: string | undefined;
  metadata: Record<string, unknown>;
};

const FIRECRAWL_BASE_URL = "https://api.firecrawl.dev/v2";
const SEARCH_TIMEOUT_MS = 20_000;
const SCRAPE_TIMEOUT_MS = 15_000;

type SearchFn = (args: {
  apiKey: string;
  query: string;
  limit: number;
}) => Promise<FirecrawlSearchResult[]>;

type ScrapeFn = (args: {
  apiKey: string;
  url: string;
}) => Promise<FirecrawlScrapeResult>;

let testSearchOverride: SearchFn | undefined;
let testScrapeOverride: ScrapeFn | undefined;

// Test seams: tests inject mocks without touching the network or
// production paths. Gated so production can never install an override.
export function __setSearchForTests(fn: SearchFn | undefined): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("__setSearchForTests is test-only.");
  }
  testSearchOverride = fn;
}

export function __setScrapeForTests(fn: ScrapeFn | undefined): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("__setScrapeForTests is test-only.");
  }
  testScrapeOverride = fn;
}

function providerError(
  operation: string,
  status: number,
): never {
  const retryable = status === 429 || status >= 500;
  appError(
    "PROVIDER_ERROR",
    `Firecrawl ${operation} failed with status ${status}.`,
    undefined,
    retryable,
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

export async function search(args: {
  apiKey: string;
  query: string;
  limit: number;
}): Promise<FirecrawlSearchResult[]> {
  if (testSearchOverride !== undefined) {
    return testSearchOverride(args);
  }
  const limit = Math.min(10, Math.max(1, Math.floor(args.limit)));
  let response: Response;
  try {
    response = await fetch(`${FIRECRAWL_BASE_URL}/search`, {
      method: "POST",
      headers: {
        // Bearer only. Never logged, never in error messages.
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: args.query, limit }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.name : "fetch failed";
    appError("PROVIDER_ERROR", `Firecrawl search failed (${detail}).`, undefined, true);
  }
  if (!response.ok) {
    providerError("search", response.status);
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    appError("PROVIDER_ERROR", "Firecrawl search returned malformed JSON.");
  }
  const envelope = asRecord(raw);
  const data = envelope !== undefined ? asRecord(envelope.data) : undefined;
  const web = data !== undefined ? data.web : undefined;
  if (!Array.isArray(web)) {
    appError("PROVIDER_ERROR", "Firecrawl search returned malformed results.");
  }
  const results: Array<FirecrawlSearchResult> = [];
  for (const entry of web) {
    const record = asRecord(entry);
    if (
      record === undefined ||
      typeof record.url !== "string" ||
      typeof record.title !== "string" ||
      typeof record.description !== "string"
    ) {
      continue;
    }
    results.push({
      url: record.url,
      title: record.title,
      description: record.description,
    });
  }
  return results;
}

export async function scrape(args: {
  apiKey: string;
  url: string;
}): Promise<FirecrawlScrapeResult> {
  if (testScrapeOverride !== undefined) {
    return testScrapeOverride(args);
  }
  let response: Response;
  try {
    response = await fetch(`${FIRECRAWL_BASE_URL}/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: args.url,
        formats: ["markdown"],
        onlyMainContent: true,
      }),
      signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.name : "fetch failed";
    appError("PROVIDER_ERROR", `Firecrawl scrape failed (${detail}).`, undefined, true);
  }
  if (!response.ok) {
    providerError("scrape", response.status);
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    appError("PROVIDER_ERROR", "Firecrawl scrape returned malformed JSON.");
  }
  const envelope = asRecord(raw);
  const data = envelope !== undefined ? asRecord(envelope.data) : undefined;
  if (data === undefined || typeof data.markdown !== "string") {
    appError("PROVIDER_ERROR", "Firecrawl scrape returned malformed results.");
  }
  const metadata = asRecord(data.metadata) ?? {};
  const title =
    typeof metadata.title === "string" ? metadata.title : undefined;
  return { url: args.url, markdown: data.markdown, title, metadata };
}
