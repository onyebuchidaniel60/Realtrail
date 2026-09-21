import { afterEach, describe, expect, test, vi } from "vitest";
import {
  __setTriageMessageForTests,
  triageMessage,
  type TriageMessageArgs,
  type TriageSuggestion,
} from "./openai";

function triageInput() {
  return {
    subject: "Low pressure",
    fromEmail: "resident@example.com",
    textBody: "Water pressure has been low since yesterday.",
    workspaceTimezone: "Africa/Lagos",
    propertyCandidates: [
      { id: "p1", name: "Palm Grove", address: "1 Main Road" },
    ],
    recentCaseTitles: [{ id: "c9", title: "Old leak" }],
  };
}

function validSuggestion(): TriageSuggestion {
  return {
    title: "Low water pressure in Block C",
    summary: "Residents report reduced water pressure.",
    category: "water",
    prioritySuggestion: "HIGH",
    propertyCandidateId: "p1",
    buildingCandidateId: null,
    unitCandidateId: null,
    affectedArea: "Block C",
    missingInformation: ["Which floors are affected?"],
    suggestedNextAction: "Inspect the water pump.",
    possibleRelatedCaseIds: ["c9"],
    needsReview: true,
  };
}

function mockFetchJson(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const ok = init.ok ?? true;
  const status = init.status ?? (ok ? 200 : 500);
  return vi.fn(async (_url: string, _init: RequestInit) => ({
    ok,
    status,
    json: async (): Promise<unknown> => body,
  }));
}

function responsesEnvelope(text: string) {
  return {
    id: "resp_1",
    status: "completed",
    output: [
      {
        id: "msg_1",
        type: "message",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
  };
}

function args(): TriageMessageArgs {
  return { apiKey: "test-key", model: "test-model", input: triageInput() };
}

afterEach(() => {
  vi.unstubAllGlobals();
  __setTriageMessageForTests(undefined);
  delete process.env.OPENAI_BASE_URL;
});

describe("triageMessage", () => {
  test("parses a valid Responses API reply", async () => {
    const fetchMock = mockFetchJson(
      responsesEnvelope(JSON.stringify(validSuggestion())),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await triageMessage(args());
    expect(result).toEqual(validSuggestion());
    // Request shape: Responses API with structured JSON output.
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.model).toBe("test-model");
    expect(body.store).toBe(false);
    expect(body).toHaveProperty("instructions");
    expect(body).toHaveProperty("input");
    const format = (body.text as Record<string, unknown>).format as Record<
      string,
      unknown
    >;
    expect(format.type).toBe("json_schema");
    expect(format.strict).toBe(true);
    // The key travels in the header, never in the body.
    expect(JSON.stringify(body)).not.toContain("test-key");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-key",
    );
  });

  test("rejects a malformed suggestion shape", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson(
        responsesEnvelope(JSON.stringify({ title: "Only a title" })),
      ),
    );
    await expect(triageMessage(args())).rejects.toMatchObject({
      data: { code: "AI_ERROR" },
    });
  });

  test("rejects an out-of-enum priority", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson(
        responsesEnvelope(
          JSON.stringify({ ...validSuggestion(), prioritySuggestion: "CRITICAL" }),
        ),
      ),
    );
    await expect(triageMessage(args())).rejects.toMatchObject({
      data: { code: "AI_ERROR" },
    });
  });

  test("wraps non-2xx responses in PROVIDER_ERROR without leaking the key", async () => {
    const fetchMock = mockFetchJson({ error: "busy" }, { ok: false, status: 429 });
    vi.stubGlobal("fetch", fetchMock);
    const error = await triageMessage(args()).catch((err) => err);
    expect(error).toMatchObject({
      data: { code: "PROVIDER_ERROR", retryable: true },
    });
    expect(JSON.stringify(error?.data ?? {})).not.toContain("test-key");
  });

  test("rejects incomplete responses", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson({ id: "resp_1", status: "incomplete", output: [] }),
    );
    await expect(triageMessage(args())).rejects.toMatchObject({
      data: { code: "AI_ERROR" },
    });
  });

  test("test seam overrides the network call", async () => {
    const fetchMock = mockFetchJson({});
    vi.stubGlobal("fetch", fetchMock);
    __setTriageMessageForTests(async () => validSuggestion());
    const result = await triageMessage(args());
    expect(result).toEqual(validSuggestion());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("OpenAI-direct request has no OpenRouter headers or fields", async () => {
    delete process.env.OPENAI_BASE_URL;
    const fetchMock = mockFetchJson(
      responsesEnvelope(JSON.stringify(validSuggestion())),
    );
    vi.stubGlobal("fetch", fetchMock);
    await triageMessage(args());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    const headers = init.headers as Record<string, string>;
    expect(headers).not.toHaveProperty("HTTP-Referer");
    expect(headers).not.toHaveProperty("X-OpenRouter-Title");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty("require_parameters");
    expect(body.model).toBe("test-model");
  });

  test("OpenRouter request adds routing headers and require_parameters", async () => {
    process.env.OPENAI_BASE_URL = "https://openrouter.ai/api/v1";
    try {
      const fetchMock = mockFetchJson(
        responsesEnvelope(JSON.stringify(validSuggestion())),
      );
      vi.stubGlobal("fetch", fetchMock);
      const result = await triageMessage({
        ...args(),
        model: "openai/gpt-4o-mini",
      });
      expect(result).toEqual(validSuggestion());
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://openrouter.ai/api/v1/responses");
      const headers = init.headers as Record<string, string>;
      expect(headers["HTTP-Referer"]).toBe("https://realtrail.local");
      expect(headers["X-OpenRouter-Title"]).toBe("Realtrail");
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.require_parameters).toBe(true);
      expect(body.model).toBe("openai/gpt-4o-mini");
      // Structured output shape is preserved on OpenRouter.
      const format = (body.text as Record<string, unknown>).format as Record<
        string,
        unknown
      >;
      expect(format.type).toBe("json_schema");
      expect(format.strict).toBe(true);
    } finally {
      delete process.env.OPENAI_BASE_URL;
    }
  });

  test("empty API key passes through to a server-side 401 (unchanged)", async () => {
    const fetchMock = mockFetchJson({ error: "bad key" }, { ok: false, status: 401 });
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      triageMessage({ ...args(), apiKey: "" }),
    ).rejects.toMatchObject({ data: { code: "PROVIDER_ERROR" } });
  });
});
