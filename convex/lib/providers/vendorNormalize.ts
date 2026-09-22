import type { FirecrawlScrapeResult, FirecrawlSearchResult } from "./firecrawl";

// Deterministic result normalization and ranking (ARCHITECTURE.md §17).
//
// Pure module: no Convex ctx, no fetch, no randomness, no model calls.
// Rank bands are rule-based only — numeric vendor scoring is out of
// scope and must never be introduced here.
//
// Scraped site content is UNTRUSTED. It is truncated before storage
// (truncateEvidence) and must render as plain text in the UI.

export type RankBand = "high_relevance" | "relevant" | "other";

export type NormalizedVendor = {
  providerName: string;
  website: string;
  description: string;
  rankBand: RankBand;
};

const CATEGORY_KEYWORDS: Record<string, Array<string>> = {
  plumbing: ["plumb"],
  electrical: ["electric"],
  power_generator: ["generator"],
  water: ["plumb", "water"],
  hvac: ["hvac", "air conditioning", "cooling", "heating"],
  security_access: ["security", "gate", "access"],
  cleaning: ["clean"],
  structural: ["structural", "contractor", "construction"],
  appliance: ["appliance"],
  common_area: ["maintenance", "contractor", "facility"],
  other: ["maintenance", "contractor", "repair", "service"],
};

function categoryMatches(
  text: string,
  targetCategory: string,
): boolean {
  const haystack = text.toLowerCase();
  const keywords =
    CATEGORY_KEYWORDS[targetCategory] ?? CATEGORY_KEYWORDS.other;
  return keywords.some((keyword) => haystack.includes(keyword));
}

function localityMatches(
  text: string,
  targetLocality: string | undefined,
): boolean {
  if (targetLocality === undefined || targetLocality.trim() === "") {
    return false;
  }
  return text.toLowerCase().includes(targetLocality.toLowerCase().trim());
}

function providerNameFrom(result: FirecrawlSearchResult): string {
  const title = result.title.trim();
  if (title !== "") {
    // Titles often read "Name - Tagline"; the head is the provider name.
    const head = title.split(" - ")[0]?.split(" | ")[0]?.trim();
    if (head !== undefined && head !== "") {
      return head.slice(0, 120);
    }
  }
  try {
    const hostname = new URL(result.url).hostname.replace(/^www\./, "");
    return hostname.slice(0, 120);
  } catch {
    return result.url.slice(0, 120);
  }
}

export function normalizeSearchResults(args: {
  results: FirecrawlSearchResult[];
  targetCategory: string;
  targetLocality: string | undefined;
}): Array<NormalizedVendor> {
  return args.results.map((result) => {
    const haystack = `${result.title} ${result.description}`;
    const categoryHit = categoryMatches(haystack, args.targetCategory);
    const localityHit = localityMatches(haystack, args.targetLocality);
    const rankBand: RankBand =
      categoryHit && localityHit
        ? "high_relevance"
        : categoryHit || localityHit
          ? "relevant"
          : "other";
    return {
      providerName: providerNameFrom(result),
      website: result.url,
      description: result.description,
      rankBand,
    };
  });
}

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const MAX_EMAIL_CHARS = 254;
// Loose phone pattern: optional country code, then digit groups joined by
// spaces, dashes, dots, or parens. Deliberately conservative.
const PHONE_PATTERN = /(\+?\d[\d\s\-().]{6,}\d)/;
const MAX_PHONE_CHARS = 30;

export function extractContactInfo(args: {
  scraped: FirecrawlScrapeResult;
}): {
  email: string | undefined;
  phone: string | undefined;
  location: string | undefined;
} {
  const text = args.scraped.markdown;
  const emailMatch = text.match(EMAIL_PATTERN);
  const email =
    emailMatch !== null && emailMatch[0].length <= MAX_EMAIL_CHARS
      ? emailMatch[0]
      : undefined;
  const phoneMatch = text.match(PHONE_PATTERN);
  const phone =
    phoneMatch !== null && phoneMatch[1].length <= MAX_PHONE_CHARS
      ? phoneMatch[1].trim()
      : undefined;
  // Best-effort service-area phrasing. Never fabricated: no match means
  // undefined. Case-insensitive keyword with capitalized-name capture;
  // trailing sentence punctuation stripped.
  const locationMatch = text.match(
    /\b(?:in|serving|based in|located in)\s+([A-Z][A-Za-z.'-]*(?:\s+[A-Za-z.'-]*){0,3})/i,
  );
  const rawLocation =
    locationMatch !== null ? locationMatch[1].trim().replace(/[.,;:!?]+$/, "") : "";
  const location =
    rawLocation !== ""
      ? rawLocation.slice(0, 120)
      : undefined;
  return { email, phone, location };
}

export function truncateEvidence(text: string, maxChars = 500): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxChars) {
    return collapsed;
  }
  return collapsed.slice(0, maxChars).trimEnd() + "…";
}
