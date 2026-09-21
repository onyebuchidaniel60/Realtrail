import { afterEach, describe, expect, test, vi } from "vitest";
import {
  __setTriageMessageForTests,
  triageMessage,
  type TriageMessageArgs,
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

function validSuggestion() {
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
  return vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
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
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
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
});
