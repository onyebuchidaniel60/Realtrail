import { afterEach, describe, expect, test, vi } from "vitest";
import {
  __setScrapeForTests,
  __setSearchForTests,
  scrape,
  search,
} from "./firecrawl";

function mockFetchJson(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const ok = init.ok ?? true;
  const status = init.status ?? (ok ? 200 : 500);
  // Params mirror the fetch signature so mock.calls stays typed; they are
  // intentionally unread — assertions inspect mock.calls instead.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return vi.fn(async (_url: string, _init: RequestInit) => ({
    ok,
    status,
    json: async (): Promise<unknown> => body,
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  __setSearchForTests(undefined);
  __setScrapeForTests(undefined);
});

describe("firecrawl search", () => {
  test("posts to /v2/search with Bearer auth", async () => {
    const fetchMock = mockFetchJson({
      success: true,
      data: {
        web: [
          {
            url: "https://a.example.com/",
            title: "A Plumber",
            description: "Best plumber.",
            markdown: "SHOULD NOT LEAK",
            extra: "SHOULD NOT LEAK",
          },
        ],
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const results = await search({ apiKey: "k", query: "plumber", limit: 5 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.firecrawl.dev/v2/search");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer k",
    );
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ query: "plumber", limit: 5 });
    // Sanitized to the typed shape only.
    expect(results).toEqual([
      {
        url: "https://a.example.com/",
        title: "A Plumber",
        description: "Best plumber.",
      },
    ]);
  });

  test("wraps non-2xx in PROVIDER_ERROR without leaking the key", async () => {
    vi.stubGlobal("fetch", mockFetchJson({ error: "busy" }, { ok: false, status: 429 }));
    const error = await search({ apiKey: "secret-key", query: "x", limit: 1 }).catch(
      (err) => err,
    );
    expect(error).toMatchObject({
      data: { code: "PROVIDER_ERROR", retryable: true },
    });
    expect(JSON.stringify(error?.data ?? {})).not.toContain("secret-key");
  });

  test("skips malformed entries instead of failing", async () => {
    const fetchMock = mockFetchJson({
      success: true,
      data: {
        web: [
          { url: "https://ok.example.com/", title: "Ok", description: "Fine." },
          { url: "https://bad.example.com/" },
        ],
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const results = await search({ apiKey: "k", query: "x", limit: 5 });
    expect(results).toHaveLength(1);
  });

  test("missing key produces a clear error", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson({ error: "unauthorized" }, { ok: false, status: 401 }),
    );
    await expect(
      search({ apiKey: "", query: "x", limit: 1 }),
    ).rejects.toMatchObject({ data: { code: "PROVIDER_ERROR" } });
  });
});

describe("firecrawl scrape", () => {
  test("posts to /v2/scrape with Bearer auth and markdown format", async () => {
    const fetchMock = mockFetchJson({
      success: true,
      data: {
        markdown: "# Hello",
        metadata: { title: "Hello page", extra: "SHOULD NOT LEAK" },
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await scrape({ apiKey: "k", url: "https://a.example.com/" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.firecrawl.dev/v2/scrape");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer k",
    );
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      url: "https://a.example.com/",
      formats: ["markdown"],
    });
    expect(result).toMatchObject({
      url: "https://a.example.com/",
      markdown: "# Hello",
      title: "Hello page",
    });
    expect(result.metadata).toEqual({ title: "Hello page", extra: "SHOULD NOT LEAK" });
  });

  test("wraps non-2xx in PROVIDER_ERROR", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson({ error: "gone" }, { ok: false, status: 500 }),
    );
    await expect(
      scrape({ apiKey: "k", url: "https://a.example.com/" }),
    ).rejects.toMatchObject({
      data: { code: "PROVIDER_ERROR", retryable: true },
    });
  });

  test("test seams override the network", async () => {
    const fetchMock = mockFetchJson({});
    vi.stubGlobal("fetch", fetchMock);
    __setSearchForTests(async () => [
      { url: "u", title: "t", description: "d" },
    ]);
    __setScrapeForTests(async (args) => ({
      url: args.url,
      markdown: "m",
      title: undefined,
      metadata: {},
    }));
    await expect(search({ apiKey: "k", query: "x", limit: 1 })).resolves.toEqual([
      { url: "u", title: "t", description: "d" },
    ]);
    await expect(
      scrape({ apiKey: "k", url: "https://a.example.com/" }),
    ).resolves.toMatchObject({ markdown: "m" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
