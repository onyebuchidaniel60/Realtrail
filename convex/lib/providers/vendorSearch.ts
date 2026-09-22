// Server-side vendor search query construction (ARCHITECTURE.md §17).
//
// Pure module: no Convex ctx, no fetch. Queries are built ONLY from the
// issue category, the property locality, and an optional manager-typed
// refinement. Internal case data (titles, descriptions, notes, reporter
// or resident contact details, unit labels, full addresses) must never
// reach this input — and this module never accepts it.

const CATEGORY_QUERIES: Record<string, string> = {
  plumbing: "plumber",
  electrical: "electrician",
  power_generator: "generator repair",
  water: "plumber water pressure",
  hvac: "HVAC technician",
  security_access: "gate repair security",
  cleaning: "cleaning service",
  structural: "structural repair contractor",
  appliance: "appliance repair",
  common_area: "maintenance contractor",
  other: "maintenance contractor",
};

const MAX_REFINEMENT_CHARS = 80;
const MAX_QUERY_CHARS = 200;

export function extractLocality(args: {
  propertyAddress: string;
  propertyCity: string | undefined;
}): string | undefined {
  if (args.propertyCity !== undefined && args.propertyCity.trim() !== "") {
    return args.propertyCity.trim();
  }
  const parts = args.propertyAddress
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  if (parts.length >= 2) {
    return parts[parts.length - 1];
  }
  return undefined;
}

function sanitizeRefinement(refinement: string): string {
  // Strip control characters (including newlines) and collapse
  // whitespace so a manager-typed refinement cannot smuggle extra query
  // operators or exfiltrate anything line-oriented.
  // eslint-disable-next-line no-control-regex
  return refinement.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_REFINEMENT_CHARS);
}

export function buildVendorSearchQuery(args: {
  category: string;
  propertyCity: string | undefined;
  propertyAddress: string;
  refinement: string | undefined;
}): string {
  const base = CATEGORY_QUERIES[args.category] ?? CATEGORY_QUERIES.other;
  const segments = [base];
  const locality = extractLocality({
    propertyAddress: args.propertyAddress,
    propertyCity: args.propertyCity,
  });
  if (locality !== undefined) {
    segments.push(locality);
  }
  if (args.refinement !== undefined && args.refinement.trim() !== "") {
    const clean = sanitizeRefinement(args.refinement);
    if (clean !== "") {
      segments.push(clean);
    }
  }
  const query = segments.join(" ");
  return query.length > MAX_QUERY_CHARS
    ? query.slice(0, MAX_QUERY_CHARS)
    : query;
}
