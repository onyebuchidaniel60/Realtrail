// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  __setScrapeForTests,
  __setSearchForTests,
} from "../lib/providers/firecrawl";

const modules = import.meta.glob("/convex/**/*.ts");

function makeBackend() {
  return convexTest(schema, modules);
}

type Backend = ReturnType<typeof makeBackend>;
type Authed = ReturnType<Backend["withIdentity"]>;

const OWNER = {
  subject: "user_discover_a",
  name: "Owner A",
  email: "owner-a@example.com",
};

const OTHER = {
  subject: "user_discover_b",
  name: "Owner B",
  email: "owner-b@example.com",
};

async function makeWorkspace(t: Backend, identity = OWNER) {
  const authed = t.withIdentity(identity);
  await authed.mutation(api.users.syncUser, {});
  const created = await authed.mutation(api.workspace.create, {
    workspaceName: `Estate ${identity.subject}`,
    timezone: "Africa/Lagos",
    currency: "NGN",
    propertyName: "Palm Grove",
    propertyAddress: "1 Main Road, Lagos",
  });
  return { authed, ...created };
}

async function makeProperty(
  t: Backend,
  authed: Authed,
  overrides: { name?: string; address?: string; city?: string } = {},
) {
  const { propertyId } = await authed.mutation(api.properties.create, {
    name: overrides.name ?? "Palm Grove",
    address: overrides.address ?? "1 Main Road, Lagos",
    city: overrides.city ?? "Lagos",
  });
  return propertyId;
}

async function makeCase(
  t: Backend,
  authed: Authed,
  overrides: { category?: "plumbing" | "electrical"; propertyId?: Id<"properties"> } = {},
) {
  const created = await authed.mutation(api.cases.mutations.createManual, {
    title: "Leaking pipe",
    description: "Kitchen pipe needs attention.",
    category: overrides.category ?? "plumbing",
    priority: "MEDIUM",
    ...(overrides.propertyId !== undefined
      ? { propertyId: overrides.propertyId }
      : {}),
  });
  return created.caseId;
}

function searchResults() {
  return [
    {
      url: "https://aqua-plumbing.example.com/",
      title: "Aqua Plumbing Lagos - Emergency Plumber",
      description: "24/7 plumber in Lagos for water pressure repairs.",
    },
    {
      url: "https://aqua-plumbing-2.example.com/",
      title: "Aqua Plumbing - Emergency Plumber",
      description: "Plumber without a city mention.",
    },
    {
      url: "https://lagos-directory.example.com/",
      title: "Lagos Business Directory",
      description: "Listings of Lagos companies.",
    },
    {
      url: "https://random-blog.example.com/",
      title: "Random Blog",
      description: "Cooking recipes.",
    },
  ];
}

function mockSearch() {
  __setSearchForTests(async () => searchResults());
}

function mockScrapeMarkdown() {
  return "# Aqua\nCall +234 801 000 0001 or mail hello@aqua.example.com.\nServing Lagos.";
}

async function readResearch(t: Backend, researchId: Id<"vendorResearch">) {
  return await t.run(async (ctx) => ctx.db.get("vendorResearch", researchId));
}

async function listResults(t: Backend, researchId: Id<"vendorResearch">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("vendorResearchResults")
      .withIndex("by_researchId", (q) => q.eq("researchId", researchId))
      .collect(),
  );
}

beforeEach(() => {
  process.env.FIRECRAWL_API_KEY = "test-key";
  mockSearch();
  __setScrapeForTests(async (args) => ({
    url: args.url,
    markdown: mockScrapeMarkdown(),
    title: "Aqua",
    metadata: {},
  }));
});

afterEach(() => {
  __setSearchForTests(undefined);
  __setScrapeForTests(undefined);
  delete process.env.FIRECRAWL_API_KEY;
});

describe("vendors.discover", () => {
  test("successful discovery stores one research row and top-3 results", async () => {
    const t = makeBackend();
    const { authed } = await makeWorkspace(t);
    const propertyId = await makeProperty(t, authed);
    const caseId = await makeCase(t, authed, { propertyId });
    const { researchId } = await authed.action(api.vendors.discover.discover, {
      caseId,
    });
    const research = await readResearch(t, researchId);
    expect(research).toMatchObject({ status: "completed" });
    expect(research?.completedAt).toBeDefined();
    expect(research?.query).toContain("plumber");
    const rows = await listResults(t, researchId);
    expect(rows).toHaveLength(3);
    // Rank order first, original order within bands.
    expect(rows.map((r) => r.rankBand)).toEqual([
      "high_relevance",
      "relevant",
      "relevant",
    ]);
    expect(rows[0]).toMatchObject({
      providerName: "Aqua Plumbing Lagos",
      sourceUrl: "https://aqua-plumbing.example.com/",
    });
    expect(rows[0].evidence).toContain("Aqua");
    expect(rows[0].email).toBe("hello@aqua.example.com");
  });

  test("case without property still works with a locality-free query", async () => {
    const t = makeBackend();
    const { authed } = await makeWorkspace(t);
    const caseId = await makeCase(t, authed);
    const { researchId } = await authed.action(api.vendors.discover.discover, {
      caseId,
    });
    const research = await readResearch(t, researchId);
    expect(research?.status).toBe("completed");
    expect(research?.query).toBe("plumber");
    expect(research?.locationContext).toBeUndefined();
  });

  test("zero search results completes with no result rows", async () => {
    const t = makeBackend();
    const { authed } = await makeWorkspace(t);
    const caseId = await makeCase(t, authed);
    __setSearchForTests(async () => []);
    const { researchId } = await authed.action(api.vendors.discover.discover, {
      caseId,
    });
    const research = await readResearch(t, researchId);
    expect(research?.status).toBe("completed");
    expect(await listResults(t, researchId)).toHaveLength(0);
  });

  test("search failure marks research failed and throws", async () => {
    const t = makeBackend();
    const { authed } = await makeWorkspace(t);
    const caseId = await makeCase(t, authed);
    __setSearchForTests(async () => {
      throw new Error("provider down");
    });
    await expect(
      authed.action(api.vendors.discover.discover, { caseId }),
    ).rejects.toMatchObject({ data: { code: "PROVIDER_ERROR" } });
    const rows = await t.run(async (ctx) =>
      ctx.db.query("vendorResearch").collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "failed" });
    expect(rows[0].errorMessage).toBe("Vendor discovery failed.");
  });

  test("one failing scrape does not block the other results", async () => {
    const t = makeBackend();
    const { authed } = await makeWorkspace(t);
    const caseId = await makeCase(t, authed);
    __setScrapeForTests(async (args) => {
      if (args.url.includes("aqua-plumbing-2")) {
        throw new Error("scrape exploded");
      }
      return {
        url: args.url,
        markdown: mockScrapeMarkdown(),
        title: "Aqua",
        metadata: {},
      };
    });
    const { researchId } = await authed.action(api.vendors.discover.discover, {
      caseId,
    });
    const research = await readResearch(t, researchId);
    expect(research?.status).toBe("completed");
    const rows = await listResults(t, researchId);
    expect(rows).toHaveLength(2);
    expect(
      rows.some((r) => r.sourceUrl.includes("aqua-plumbing-2")),
    ).toBe(false);
  });

  test("missing API key throws a clear error", async () => {
    const t = makeBackend();
    delete process.env.FIRECRAWL_API_KEY;
    const { authed } = await makeWorkspace(t);
    const caseId = await makeCase(t, authed);
    await expect(
      authed.action(api.vendors.discover.discover, { caseId }),
    ).rejects.toMatchObject({ data: { code: "PROVIDER_ERROR" } });
  });

  test("second discover within 60s is rate limited", async () => {
    const t = makeBackend();
    const { authed, workspaceId } = await makeWorkspace(t);
    const caseId = await makeCase(t, authed);
    await t.run(async (ctx) =>
      ctx.db.insert("vendorResearch", {
        workspaceId,
        caseId,
        query: "plumber",
        locationContext: undefined,
        status: "pending",
        errorMessage: undefined,
        createdAt: Date.now(),
        completedAt: undefined,
      }),
    );
    await expect(
      authed.action(api.vendors.discover.discover, { caseId }),
    ).rejects.toMatchObject({ data: { code: "RATE_LIMITED" } });
  });

  test("cross-workspace caseId is rejected", async () => {
    const t = makeBackend();
    const { authed } = await makeWorkspace(t, OWNER);
    const other = await makeWorkspace(t, OTHER);
    const caseId = await makeCase(t, other.authed);
    await expect(
      authed.action(api.vendors.discover.discover, { caseId }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });
});