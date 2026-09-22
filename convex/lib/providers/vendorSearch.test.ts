import { describe, expect, test } from "vitest";
import {
  buildVendorSearchQuery,
  extractLocality,
} from "./vendorSearch";

describe("buildVendorSearchQuery category mapping", () => {
  const cases: Array<[string, string]> = [
    ["plumbing", "plumber"],
    ["electrical", "electrician"],
    ["power_generator", "generator repair"],
    ["water", "plumber water pressure"],
    ["hvac", "HVAC technician"],
    ["security_access", "gate repair security"],
    ["cleaning", "cleaning service"],
    ["structural", "structural repair contractor"],
    ["appliance", "appliance repair"],
    ["common_area", "maintenance contractor"],
    ["other", "maintenance contractor"],
  ];
  test.each(cases)("%s maps to %s", (category, expected) => {
    const query = buildVendorSearchQuery({
      category,
      propertyCity: undefined,
      propertyAddress: "1 Main Road, Lagos",
      refinement: undefined,
    });
    expect(query.startsWith(expected)).toBe(true);
  });

  test("unknown category falls back to maintenance contractor", () => {
    const query = buildVendorSearchQuery({
      category: "teleportation",
      propertyCity: undefined,
      propertyAddress: "1 Main Road, Lagos",
      refinement: undefined,
    });
    expect(query.startsWith("maintenance contractor")).toBe(true);
  });
});

describe("buildVendorSearchQuery locality and refinement", () => {
  test("city appended when present", () => {
    const query = buildVendorSearchQuery({
      category: "plumbing",
      propertyCity: "Lagos",
      propertyAddress: "1 Main Road, Lagos",
      refinement: undefined,
    });
    expect(query).toBe("plumber Lagos");
  });

  test("refinement appended and bounded at 80 chars", () => {
    const query = buildVendorSearchQuery({
      category: "electrical",
      propertyCity: undefined,
      propertyAddress: "12 Marina Road",
      refinement: `emergency ${"x".repeat(200)}`,
    });
    expect(query.startsWith("electrician emergency")).toBe(true);
    expect(query.length).toBeLessThanOrEqual(200);
  });

  test("newlines and control characters sanitized from refinement", () => {
    const query = buildVendorSearchQuery({
      category: "hvac",
      propertyCity: undefined,
      propertyAddress: "12 Marina Road",
      refinement: "urgent\nDROP TABLE vendors;\u0000--",
    });
    // eslint-disable-next-line no-control-regex -- the test intentionally asserts NUL/newline stripping.
    expect(query).not.toMatch(/[\n\u0000]/);
    expect(query).toContain("urgent");
  });

  test("internal case data never enters the query", () => {
    const query = buildVendorSearchQuery({
      category: "water",
      propertyCity: "Lagos",
      propertyAddress: "Block C, Unit 14, 1 Main Road, Lagos",
      refinement: undefined,
    });
    // Only the category head + locality survive — never unit labels or
    // street-level address detail.
    expect(query).not.toContain("Unit 14");
    expect(query).not.toContain("1 Main Road");
    expect(query).toContain("Lagos");
  });

  test("final query truncated at 200 chars", () => {
    const query = buildVendorSearchQuery({
      category: "structural",
      propertyCity: "A".repeat(300),
      propertyAddress: "B".repeat(300),
      refinement: "C".repeat(300),
    });
    expect(query.length).toBeLessThanOrEqual(200);
  });
});

describe("extractLocality", () => {
  test("prefers the explicit city", () => {
    expect(
      extractLocality({ propertyAddress: "1 Main Road, Lagos", propertyCity: "Ikeja" }),
    ).toBe("Ikeja");
  });

  test("falls back to the last address segment", () => {
    expect(
      extractLocality({ propertyAddress: "1 Main Road, Lagos", propertyCity: undefined }),
    ).toBe("Lagos");
  });

  test("returns undefined without a clear locality", () => {
    expect(
      extractLocality({ propertyAddress: "12 Marina Road", propertyCity: undefined }),
    ).toBeUndefined();
    expect(
      extractLocality({ propertyAddress: "", propertyCity: undefined }),
    ).toBeUndefined();
  });
});
