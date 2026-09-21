"use node";

// AgentMail provider adapter (ARCHITECTURE.md §32).
//
// Third-party API shapes must not leak into business logic: this module is
// the only place that talks to AgentMail over HTTP, and it normalizes the
// provider response into domain shapes. Callers (Convex actions) only ever
// see the normalized shapes.
//
// API surface verified against https://docs.agentmail.to (Phase 5-B):
// base URL https://api.agentmail.to, version prefix /v0, snake_case fields.
// Bearer auth on every request.

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

// Production server. Verified against the AgentMail docs in Phase 5-B
// (earlier provisional value api.agentmail.com was wrong).
const AGENTMAIL_BASE_URL = "https://api.agentmail.to";

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
  // Documented get-message fields are snake_case (message_id, thread_id,
  // from, to, subject, text, timestamp as an ISO datetime). Older camelCase
  // fallbacks are kept last for tolerance, never first.
  const record = raw as Record<string, unknown>;
  const messageId = asString(record.message_id ?? record.messageId);
  const threadId = asString(record.thread_id ?? record.threadId);
  const from = asString(record.from ?? record.fromEmail);
  const subject = asString(record.subject) ?? "";
  const text =
    asString(
      record.text ?? record.extracted_text ?? record.preview ?? record.textBody,
    ) ?? "";
  const timestamp = asTimestamp(record.timestamp ?? record.created_at);
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
    `${AGENTMAIL_BASE_URL}/v0/inboxes/${encodeURIComponent(args.inboxId)}` +
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

export type CreateInboxArgs = {
  apiKey: string;
  // Stable caller-side identifier. Sent as the provider's client_id, which
  // makes repeated creates idempotent provider-side: a retry returns the
  // ORIGINAL inbox instead of a duplicate. Must not contain "@".
  clientId: string;
  displayName: string;
};

export type CreatedInbox = {
  inboxId: string;
  address: string;
};

type CreateInboxFn = (args: CreateInboxArgs) => Promise<CreatedInbox>;

let testCreateInboxOverride: CreateInboxFn | undefined;

export function __setCreateInboxForTests(
  fn: CreateInboxFn | undefined,
): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("__setCreateInboxForTests is test-only.");
  }
  testCreateInboxOverride = fn;
}

export async function createInbox(
  args: CreateInboxArgs,
): Promise<CreatedInbox> {
  if (testCreateInboxOverride !== undefined) {
    return testCreateInboxOverride(args);
  }
  // username is deliberately omitted: the provider generates one, which
  // avoids collisions between same-named workspaces. Idempotency comes
  // from client_id (workspaceId), not from the username.
  let response: Response;
  try {
    response = await fetch(`${AGENTMAIL_BASE_URL}/v0/inboxes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        display_name: args.displayName,
        client_id: args.clientId,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.name : "fetch failed";
    appError(
      "PROVIDER_ERROR",
      `AgentMail inbox creation failed (${detail}).`,
      undefined,
      true,
    );
  }
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    appError(
      "PROVIDER_ERROR",
      `AgentMail inbox creation failed with status ${response.status}.`,
      undefined,
      retryable,
    );
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    appError("PROVIDER_ERROR", "AgentMail returned a malformed inbox.");
  }
  if (typeof raw !== "object" || raw === null) {
    appError("PROVIDER_ERROR", "AgentMail returned a malformed inbox.");
  }
  const record = raw as Record<string, unknown>;
  const inboxId = asString(record.inbox_id);
  const address = asString(record.email);
  if (inboxId === undefined || address === undefined) {
    appError("PROVIDER_ERROR", "AgentMail returned a malformed inbox.");
  }
  return { inboxId, address };
}

// Declared, not implemented — each throws until its phase lands.
export async function sendMessage(): Promise<never> {
  throw new Error("NOT_IMPLEMENTED: sendMessage lands in Phase 8.");
}

export async function createDraft(): Promise<never> {
  throw new Error("NOT_IMPLEMENTED: createDraft lands in Phase 8.");
}

export async function listThreads(): Promise<never> {
  throw new Error("NOT_IMPLEMENTED: listThreads lands in Phase 5-C.");
}
