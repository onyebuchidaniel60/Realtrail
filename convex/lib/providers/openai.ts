"use node";

// OpenAI provider adapter (ARCHITECTURE.md §15, §32).
//
// Exact request shape (verified against the Responses API reference):
//   POST https://api.openai.com/v1/responses
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

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const TRIAGE_TIMEOUT_MS = 30_000;

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
  let response: Response;
  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        // The API key travels in the Authorization header only. It is
        // never logged and never appears in error messages below.
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
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
