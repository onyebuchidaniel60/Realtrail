"use node";

// OpenAI-compatible provider adapter (ARCHITECTURE.md §15, §32).
//
// Provider modes (selected by OPENAI_BASE_URL at call time):
//   - OpenAI direct (default): base https://api.openai.com/v1. Plain
//     Responses API request, no extra headers or fields.
//   - OpenRouter: any base URL whose hostname contains "openrouter.ai"
//     (e.g. https://openrouter.ai/api/v1). Adds the HTTP-Referer and
//     X-OpenRouter-Title headers plus a provider object pinning routing
//     to Azure Sweden Central with require_parameters. Model IDs are
//     provider-scoped (e.g. "openai/gpt-4o-mini").
//
// Environment variables:
//   OPENAI_BASE_URL — provider endpoint (default: OpenAI direct)
//   OPENAI_API_KEY  — bearer token (works with either provider)
//   PUBLIC_APP_URL  — used for HTTP-Referer on OpenRouter (falls back to
//                     https://realtrail.local when unset)
//
// Exact request shape (verified against the Responses API reference):
//   POST {baseUrl}/responses
//   {
//     "model": "<model id>",
//     "instructions": "<system prompt>",   // top-level developer instructions
//     "input": "<user prompt>",            // plain-text input
//     "text": { "format": {
//         "type": "json_schema",
//         "name": "triage_suggestion",
//         "schema": { ... },                // mirrors TriageSuggestion below
//         "strict": true } },
//     "store": false                       // no server-side retention
//   }
// The model text is read from the first output item of type "message"
// (content part type "output_text"), falling back to the top-level
// "output_text" convenience field. Only "completed" responses are
// accepted; anything else is an AI_ERROR, never persisted.

import { appError } from "../errors";
import {
  buildDraftSystemPrompt,
  buildDraftUserPrompt,
  type DraftPromptInput,
} from "./draftPrompt";
import {
  buildTriageSystemPrompt,
  buildTriageUserPrompt,
  type TriagePromptInput,
} from "./triagePrompt";

export type TriageSuggestion = {
  title: string;
  summary: string;
  category: string;
  prioritySuggestion: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  propertyCandidateId: string | null;
  buildingCandidateId: string | null;
  unitCandidateId: string | null;
  affectedArea: string | null;
  missingInformation: string[];
  suggestedNextAction: string;
  possibleRelatedCaseIds: string[];
  needsReview: boolean;
};

export type TriageMessageArgs = {
  apiKey: string;
  model: string;
  input: TriagePromptInput;
};

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const TRIAGE_TIMEOUT_MS = 30_000;

function resolveBaseUrl(): string {
  const configured = process.env.OPENAI_BASE_URL?.trim();
  return configured !== undefined && configured !== "" ? configured : DEFAULT_BASE_URL;
}

function isOpenRouter(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.includes("openrouter.ai");
  } catch {
    return false;
  }
}

const TRIAGE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    category: { type: "string" },
    prioritySuggestion: {
      type: "string",
      enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
    },
    propertyCandidateId: { type: ["string", "null"] },
    buildingCandidateId: { type: ["string", "null"] },
    unitCandidateId: { type: ["string", "null"] },
    affectedArea: { type: ["string", "null"] },
    missingInformation: { type: "array", items: { type: "string" } },
    suggestedNextAction: { type: "string" },
    possibleRelatedCaseIds: { type: "array", items: { type: "string" } },
    needsReview: { type: "boolean" },
  },
  required: [
    "title",
    "summary",
    "category",
    "prioritySuggestion",
    "propertyCandidateId",
    "buildingCandidateId",
    "unitCandidateId",
    "affectedArea",
    "missingInformation",
    "suggestedNextAction",
    "possibleRelatedCaseIds",
    "needsReview",
  ],
} as const;

type TriageMessageFn = (args: TriageMessageArgs) => Promise<TriageSuggestion>;

let testOverride: TriageMessageFn | undefined;

export function __setTriageMessageForTests(
  fn: TriageMessageFn | undefined,
): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("__setTriageMessageForTests is test-only.");
  }
  testOverride = fn;
}

function asString(value: unknown): value is string {
  return typeof value === "string";
}

function asStringArray(value: unknown): value is Array<string> {
  return (
    Array.isArray(value) &&
    value.every((entry): entry is string => typeof entry === "string")
  );
}

function asNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

// Local shape validation. The Responses API enforces the JSON Schema, but
// defense-in-depth demands a second check on our side: this function is
// the gate — triageMessage never returns raw unvalidated model JSON.
function validateTriageSuggestion(raw: unknown): TriageSuggestion {
  if (typeof raw !== "object" || raw === null) {
    appError("AI_ERROR", "Triage model returned a malformed suggestion.");
  }
  const record = raw as Record<string, unknown>;
  const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];
  if (
    !asString(record.title) ||
    !asString(record.summary) ||
    !asString(record.category) ||
    !asString(record.prioritySuggestion) ||
    !priorities.includes(record.prioritySuggestion) ||
    !asNullableString(record.propertyCandidateId) ||
    !asNullableString(record.buildingCandidateId) ||
    !asNullableString(record.unitCandidateId) ||
    !asNullableString(record.affectedArea) ||
    !asStringArray(record.missingInformation) ||
    !asString(record.suggestedNextAction) ||
    !asStringArray(record.possibleRelatedCaseIds) ||
    typeof record.needsReview !== "boolean"
  ) {
    appError("AI_ERROR", "Triage model returned a malformed suggestion.");
  }
  return {
    title: record.title as string,
    summary: record.summary as string,
    category: record.category as string,
    prioritySuggestion: record.prioritySuggestion as TriageSuggestion["prioritySuggestion"],
    propertyCandidateId: record.propertyCandidateId as string | null,
    buildingCandidateId: record.buildingCandidateId as string | null,
    unitCandidateId: record.unitCandidateId as string | null,
    affectedArea: record.affectedArea as string | null,
    missingInformation: record.missingInformation as Array<string>,
    suggestedNextAction: record.suggestedNextAction as string,
    possibleRelatedCaseIds: record.possibleRelatedCaseIds as Array<string>,
    needsReview: record.needsReview as boolean,
  };
}

function extractOutputText(response: unknown): string | undefined {
  if (typeof response !== "object" || response === null) {
    return undefined;
  }
  const record = response as Record<string, unknown>;
  if (typeof record.output_text === "string" && record.output_text !== "") {
    return record.output_text;
  }
  if (!Array.isArray(record.output)) {
    return undefined;
  }
  for (const item of record.output) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const message = item as Record<string, unknown>;
    if (message.type !== "message" || !Array.isArray(message.content)) {
      continue;
    }
    for (const part of message.content) {
      if (typeof part !== "object" || part === null) {
        continue;
      }
      const content = part as Record<string, unknown>;
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return undefined;
}

export async function triageMessage(
  args: TriageMessageArgs,
): Promise<TriageSuggestion> {
  if (testOverride !== undefined) {
    return testOverride(args);
  }
  const baseUrl = resolveBaseUrl();
  const viaOpenRouter = isOpenRouter(baseUrl);
  const headers: Record<string, string> = {
    // The API key travels in the Authorization header only. It is
    // never logged and never appears in error messages below.
    Authorization: `Bearer ${args.apiKey}`,
    "Content-Type": "application/json",
  };
  if (viaOpenRouter) {
    headers["HTTP-Referer"] =
      process.env.PUBLIC_APP_URL || "https://realtrail.local";
    headers["X-OpenRouter-Title"] = "Realtrail";
  }
  // OpenRouter routing (verified against OpenRouter's API shape —
  // require_parameters belongs inside provider, not at top level):
  //   order: ["azure/swedencentral"] pins routing to Azure's Sweden
  //     Central region (0.00% structured output failure rate; EU data
  //     processing matching the eu-west-1 Convex deployment).
  //   allow_fallbacks: false fails the request rather than silently
  //     routing elsewhere: deterministic provider identity over uptime.
  //   require_parameters: true skips endpoints that treat the strict
  //     json_schema as a hint.
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: args.model,
        instructions: buildTriageSystemPrompt(),
        input: buildTriageUserPrompt(args.input),
        text: {
          format: {
            type: "json_schema",
            name: "triage_suggestion",
            schema: TRIAGE_JSON_SCHEMA,
            strict: true,
          },
        },
        store: false,
        ...(viaOpenRouter
          ? {
              provider: {
                order: ["azure/swedencentral"],
                allow_fallbacks: false,
                require_parameters: true,
              },
            }
          : {}),
      }),
      signal: AbortSignal.timeout(TRIAGE_TIMEOUT_MS),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.name : "fetch failed";
    appError(
      "PROVIDER_ERROR",
      `Triage request failed (${detail}).`,
      undefined,
      true,
    );
  }
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    appError(
      "PROVIDER_ERROR",
      `Triage request failed with status ${response.status}.`,
      undefined,
      retryable,
    );
  }
  let envelope: unknown;
  try {
    envelope = await response.json();
  } catch {
    appError("AI_ERROR", "Triage model returned a malformed suggestion.");
  }
  const status =
    typeof envelope === "object" && envelope !== null
      ? (envelope as Record<string, unknown>).status
      : undefined;
  if (status !== "completed") {
    appError("AI_ERROR", "Triage model did not complete the request.");
  }
  const text = extractOutputText(envelope);
  if (text === undefined) {
    appError("AI_ERROR", "Triage model returned no usable output.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    appError("AI_ERROR", "Triage model returned a malformed suggestion.");
  }
  return validateTriageSuggestion(parsed);
}

// Email drafting (Phase 8-A). Same Responses API transport as triage, but
// a minimal two-field schema: the draft is advisory text the manager
// reviews, so the only hard gates are shape, non-emptiness, and length
// bounds. Overlong fields are truncated (the manager edits anyway); empty
// fields are an AI_ERROR because a draft without a subject or body cannot
// be approved for sending.

export type EmailDraft = {
  subject: string;
  textBody: string;
};

export type DraftMessageArgs = {
  apiKey: string;
  model: string;
  input: DraftPromptInput;
};

const DRAFT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    subject: { type: "string" },
    textBody: { type: "string" },
  },
  required: ["subject", "textBody"],
} as const;

const MAX_SUBJECT_CHARS = 200;
const MAX_BODY_CHARS = 10000;
const DRAFT_TIMEOUT_MS = 30_000;

type DraftMessageFn = (args: DraftMessageArgs) => Promise<EmailDraft>;

let draftTestOverride: DraftMessageFn | undefined;

export function __setDraftMessageForTests(
  fn: DraftMessageFn | undefined,
): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("__setDraftMessageForTests is test-only.");
  }
  draftTestOverride = fn;
}

function validateEmailDraft(raw: unknown): EmailDraft {
  if (typeof raw !== "object" || raw === null) {
    appError("AI_ERROR", "Draft model returned a malformed draft.");
  }
  const record = raw as Record<string, unknown>;
  if (!asString(record.subject) || !asString(record.textBody)) {
    appError("AI_ERROR", "Draft model returned a malformed draft.");
  }
  const subject = (record.subject as string).trim().slice(0, MAX_SUBJECT_CHARS);
  const textBody = (record.textBody as string).trim().slice(0, MAX_BODY_CHARS);
  if (subject === "" || textBody === "") {
    appError("AI_ERROR", "Draft model returned an empty draft.");
  }
  return { subject, textBody };
}

export async function draftMessage(
  args: DraftMessageArgs,
): Promise<EmailDraft> {
  if (draftTestOverride !== undefined) {
    return draftTestOverride(args);
  }
  const baseUrl = resolveBaseUrl();
  const viaOpenRouter = isOpenRouter(baseUrl);
  const headers: Record<string, string> = {
    // The API key travels in the Authorization header only. It is
    // never logged and never appears in error messages below.
    Authorization: `Bearer ${args.apiKey}`,
    "Content-Type": "application/json",
  };
  if (viaOpenRouter) {
    headers["HTTP-Referer"] =
      process.env.PUBLIC_APP_URL || "https://realtrail.local";
    headers["X-OpenRouter-Title"] = "Realtrail";
  }
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: args.model,
        instructions: buildDraftSystemPrompt(),
        input: buildDraftUserPrompt(args.input),
        text: {
          format: {
            type: "json_schema",
            name: "email_draft",
            schema: DRAFT_JSON_SCHEMA,
            strict: true,
          },
        },
        store: false,
        ...(viaOpenRouter
          ? {
              provider: {
                order: ["azure/swedencentral"],
                allow_fallbacks: false,
                require_parameters: true,
              },
            }
          : {}),
      }),
      signal: AbortSignal.timeout(DRAFT_TIMEOUT_MS),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.name : "fetch failed";
    appError(
      "PROVIDER_ERROR",
      `Draft request failed (${detail}).`,
      undefined,
      true,
    );
  }
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    appError(
      "PROVIDER_ERROR",
      `Draft request failed with status ${response.status}.`,
      undefined,
      retryable,
    );
  }
  let envelope: unknown;
  try {
    envelope = await response.json();
  } catch {
    appError("AI_ERROR", "Draft model returned a malformed draft.");
  }
  const status =
    typeof envelope === "object" && envelope !== null
      ? (envelope as Record<string, unknown>).status
      : undefined;
  if (status !== "completed") {
    appError("AI_ERROR", "Draft model did not complete the request.");
  }
  const text = extractOutputText(envelope);
  if (text === undefined) {
    appError("AI_ERROR", "Draft model returned no usable output.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    appError("AI_ERROR", "Draft model returned a malformed draft.");
  }
  return validateEmailDraft(parsed);
}
