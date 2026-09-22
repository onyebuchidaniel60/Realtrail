import { afterEach, describe, expect, test, vi } from "vitest";
import { ConvexError } from "convex/values";
import {
  __setSendMessageForTests,
  isUncertainSendError,
  sendMessage,
  type SendMessageArgs,
} from "./agentmail";

function args(): SendMessageArgs {
  return {
    apiKey: "test-key",
    inboxId: "inbox_1",
    to: ["vendor@example.com"],
    subject: "Pump repair request",
    textBody: "Please quote for the pump repair.",
    clientId: "comm_123",
  };
}

function mockFetchJson(
  body: unknown,
  init: { ok?: boolean; status?: number } = {},
) {
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

function timeoutFailure() {
  const error = new Error("The operation timed out.");
  error.name = "TimeoutError";
  return vi.fn(async () => {
    throw error;
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  __setSendMessageForTests(undefined);
});

describe("sendMessage", () => {
  test("posts to the send endpoint with Bearer auth and snake_case body", async () => {
    const fetchMock = mockFetchJson({
      message_id: "msg_1",
      thread_id: "thread_1",
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendMessage(args());
    expect(result).toEqual({
      messageId: "msg_1",
      threadId: "thread_1",
      providerStatus: "sent",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://api.agentmail.to/v0/inboxes/inbox_1/messages/send",
    );
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-key");
    expect(headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      to: ["vendor@example.com"],
      subject: "Pump repair request",
      text: "Please quote for the pump repair.",
    });
    // The key travels in the header, never in the body.
    expect(JSON.stringify(body)).not.toContain("test-key");
  });

  test("passes clientId through as the Idempotency-Key header", async () => {
    const fetchMock = mockFetchJson({
      message_id: "msg_2",
      thread_id: "thread_2",
    });
    vi.stubGlobal("fetch", fetchMock);
    await sendMessage(args());
    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("comm_123");
  });

  test("wraps a 5xx in a retryable PROVIDER_ERROR", async () => {
    vi.stubGlobal("fetch", mockFetchJson({}, { ok: false, status: 502 }));
    const failure = await sendMessage(args()).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ConvexError);
    expect(failure).toMatchObject({
      data: { code: "PROVIDER_ERROR", retryable: true },
    });
    expect((failure as ConvexError<{ message: string }>).data.message).toMatch(
      /status 502/,
    );
  });

  test("wraps a 4xx in a non-retryable PROVIDER_ERROR", async () => {
    vi.stubGlobal("fetch", mockFetchJson({}, { ok: false, status: 400 }));
    const failure = await sendMessage(args()).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ConvexError);
    expect(failure).toMatchObject({
      data: { code: "PROVIDER_ERROR", retryable: false },
    });
  });

  test("maps a timeout to an uncertain send error, never a retry", async () => {
    vi.stubGlobal("fetch", timeoutFailure());
    const failure = await sendMessage(args()).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ConvexError);
    expect(isUncertainSendError(failure)).toBe(true);
    expect(failure).toMatchObject({
      data: { code: "PROVIDER_ERROR", retryable: false },
    });
  });

  test("maps a malformed 200 body to an uncertain send error", async () => {
    vi.stubGlobal("fetch", mockFetchJson({ unexpected: "shape" }));
    const failure = await sendMessage(args()).catch((error: unknown) => error);
    expect(isUncertainSendError(failure)).toBe(true);
  });

  test("isUncertainSendError rejects ordinary errors", () => {
    expect(isUncertainSendError(new Error("boom"))).toBe(false);
    expect(
      isUncertainSendError(
        new ConvexError({ code: "PROVIDER_ERROR", message: "plain failure" }),
      ),
    ).toBe(false);
  });
});
