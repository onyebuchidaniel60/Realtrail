// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";
import {
  __setScrapeForTests,
  __setSearchForTests,
} from "../lib/providers/firecrawl";

const modules = import.meta.glob("/convex/**/*.ts");

function makeBackend() {
  return convexTest(schema, modules);
}

type Backend = ReturnType<typeof makeBackend>;

const OWNER_A = {
  subject: "user_research_a",
  name: "Owner A",
  email: "owner-a@example.com",
};

const OWNER_B = {
  subject: "user_research_b",
  name: "Owner B",
  email: "owner-b@example.com",
};

async function makeWorkspace(t: Backend, identity = OWNER_A) {
  const authed = t.withIdentity(identity);
  await authed.mutation(api.users.syncUser, {});
  const created = await authed.mutation(api.workspace.create, {
    workspaceName: `Estate ${identity.subject}`,
    timezone: "Africa/Lagos",
    currency: "NGN",
    propertyName: "Main Property",
    propertyAddress: "1 Main Road, Lagos",
  });
  return { authed, ...created };
}

beforeEach(() => {
  process.env.FIRECRAWL_API_KEY = "test-key";
  __setSearchForTests(async () => [
    {
      url: "https://aqua.example.com/",
      title: "Aqua Plumbing Lagos",
      description: "Plumber in Lagos.",
    },
  ]);
  __setScrapeForTests(async (args) => ({
    url: args.url,
    markdown: "Call hello@aqua.example.com.",
    title: "Aqua",
    metadata: {},
  }));
});

afterEach(() => {
  __setSearchForTests(undefined);
  __setScrapeForTests(undefined);
  delete process.env.FIRECRAWL_API_KEY;
});

describe("vendors.research.getResearch", () => {
  test("returns research plus results for a member", async () => {
    const t = makeBackend();
    const { authed } = await makeWorkspace(t);
    const caseId = (
      await authed.mutation(api.cases.mutations.createManual, {
        title: "Leak",
        description: "Kitchen leak needs attention.",
        category: "plumbing",
        priority: "MEDIUM",
      })
    ).caseId;
    const { researchId } = await authed.action(api.vendors.discover.discover, {
      caseId,
    });
    const { research, results } = await authed.query(
      api.vendors.research.getResearch,
      { researchId },
    );
    expect(research._id).toBe(researchId);
    expect(research.status).toBe("completed");
    expect(results).toHaveLength(1);
    expect(results[0].researchId).toBe(researchId);
  });

  test("rejects a cross-workspace researchId", async () => {
    const t = makeBackend();
    const a = await makeWorkspace(t, OWNER_A);
    const b = await makeWorkspace(t, OWNER_B);
    const caseId = (
      await b.authed.mutation(api.cases.mutations.createManual, {
        title: "Leak",
        description: "Kitchen leak needs attention.",
        category: "plumbing",
        priority: "MEDIUM",
      })
    ).caseId;
    const { researchId } = await b.authed.action(
      api.vendors.discover.discover,
      { caseId },
    );
    await expect(
      a.authed.query(api.vendors.research.getResearch, { researchId }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });
});
