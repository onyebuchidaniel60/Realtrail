"use node";

// AgentMail provider adapter (ARCHITECTURE.md §32).
//
// Third-party API shapes must not leak into business logic: this module is
// the only place that talks to AgentMail over HTTP, and it normalizes the
// provider response into AgentMailMessage. Callers (Convex actions) only
// ever see the normalized shape.
//
// NOTE (Phase 5-B): no live AgentMail account exists yet, so the exact REST
// path and response field names below are provisional. Phase 5-B reconciles
// them against the live API with a real-inbound smoke test. All tests in
// this phase inject mocks through __setFetchMessageForTests and never touch
// the network.

import { appError } from "../errors";

export type AgentMailMessage = {
  messageId: string;
  threadId: string;
  inboxId: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
  timestamp: number;
};

export type FetchMessageArgs = {
  apiKey: string;
  inboxId: string;
  messageId: string;
};

// Provisional base URL. Reconcile against the live AgentMail API in
// Phase 5-B before any production traffic.
const AGENTMAIL_BASE_URL = "https://api.agentmail.com";

const FETCH_TIMEOUT_MS = 15_000;

// Test seam: tests inject a mock fetch implementation without touching the
// network or production code paths. Gated so production can never install
// an override: any call in production throws immediately.
type FetchMessageFn = (args: FetchMessageArgs) => Promise<AgentMailMessage>;

let testOverride: FetchMessageFn | undefined;

export function __setFetchMessageForTests(
  fn: FetchMessageFn | undefined,
): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("__setFetchMessageForTests is test-only.");
  }
  testOverride = fn;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asTimestamp(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function normalizeMessage(
  inboxId: string,
  raw: unknown,
): AgentMailMessage {
  if (typeof raw !== "object" || raw === null) {
    appError("PROVIDER_ERROR", "AgentMail returned a malformed message.");
  }
  const record = raw as Record<string, unknown>;
  const messageId = asString(record.messageId ?? record.id);
  const threadId = asString(record.threadId ?? record.thread_id);
  const from = asString(record.from ?? record.fromEmail);
  const subject = asString(record.subject) ?? "";
  const text = asString(record.text ?? record.textBody ?? record.body) ?? "";
  const timestamp = asTimestamp(record.timestamp ?? record.createdAt);
  const toRaw = record.to ?? record.toEmails;
  const to = Array.isArray(toRaw)
    ? toRaw.filter((entry): entry is string => typeof entry === "string")
    : [];
  if (
    messageId === undefined ||
    threadId === undefined ||
    from === undefined ||
    timestamp === undefined
  ) {
    appError("PROVIDER_ERROR", "AgentMail returned a malformed message.");
  }
  return { messageId, threadId, inboxId, from, to, subject, text, timestamp };
}

export async function fetchMessage(
  args: FetchMessageArgs,
): Promise<AgentMailMessage> {
  if (testOverride !== undefined) {
    return testOverride(args);
  }
  const url =
    `${AGENTMAIL_BASE_URL}/v1/inboxes/${encodeURIComponent(args.inboxId)}` +
    `/messages/${encodeURIComponent(args.messageId)}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      // The API key travels in the Authorization header only. It is never
      // logged and never appears in error messages below.
      headers: { Authorization: `Bearer ${args.apiKey}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.name : "fetch failed";
    appError(
      "PROVIDER_ERROR",
      `AgentMail request failed (${detail}).`,
      undefined,
      true,
    );
  }
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    appError(
      "PROVIDER_ERROR",
      `AgentMail request failed with status ${response.status}.`,
      undefined,
      retryable,
    );
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    appError("PROVIDER_ERROR", "AgentMail returned a malformed message.");
  }
  return normalizeMessage(args.inboxId, raw);
}

// Declared, not implemented — each throws until its phase lands.
export async function sendMessage(): Promise<never> {
  throw new Error("NOT_IMPLEMENTED: sendMessage lands in Phase 8.");
}

export async function createDraft(): Promise<never> {
  throw new Error("NOT_IMPLEMENTED: createDraft lands in Phase 8.");
}

export async function createInbox(): Promise<never> {
  throw new Error("NOT_IMPLEMENTED: createInbox lands in Phase 5-B.");
}

export async function listThreads(): Promise<never> {
  throw new Error("NOT_IMPLEMENTED: listThreads lands in Phase 5-C.");
}
