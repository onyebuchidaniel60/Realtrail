import { Sparkles } from "lucide-react";
import type { Doc } from "../../../convex/_generated/dataModel";
import { formatRelativeTime } from "./caseDisplay";

type TriageOutput = {
  summary?: unknown;
  suggestedNextAction?: unknown;
};

function readOutput(record: Doc<"cases">): TriageOutput | null {
  const output = record.aiTriageOutput as TriageOutput | null | undefined;
  if (typeof output !== "object" || output === null) {
    return null;
  }
  return output;
}

export function AISummaryCard({
  record,
  onReview,
}: {
  record: Doc<"cases">;
  onReview: () => void;
}) {
  const status = record.aiTriageStatus;
  if (status === "not_started") {
    return null;
  }
  if (status === "pending") {
    return (
      <section
        aria-label="AI triage status"
        className="rounded-xl border bg-card p-6"
      >
        <p className="text-sm text-muted-foreground">
          AI is analyzing this report…
        </p>
      </section>
    );
  }
  if (status === "failed") {
    return (
      <section
        aria-label="AI triage status"
        className="rounded-xl border bg-card p-6"
      >
        <p className="text-sm text-muted-foreground">
          AI triage failed. You can still triage this case manually.
        </p>
      </section>
    );
  }
  const output = readOutput(record);
  if (output === null) {
    return null;
  }
  const summary = typeof output.summary === "string" ? output.summary : "";
  const nextAction =
    typeof output.suggestedNextAction === "string"
      ? output.suggestedNextAction
      : "";
  return (
    // TODO(Phase 12): map the AI accent to brand tokens (lavender primary).
    <section
      aria-label="AI summary"
      className="rounded-xl border border-primary/30 bg-primary/5 p-6"
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
        <Sparkles className="size-3.5" aria-hidden="true" />
        Realtrail AI
      </p>
      {/* Plain text only: React escapes by default; AI content must never
          render as HTML (ARCHITECTURE.md §16 XSS). */}
      {summary !== "" && (
        <p className="mt-2 text-sm whitespace-pre-wrap">{summary}</p>
      )}
      {nextAction !== "" && (
        <p className="mt-3 rounded-lg border border-primary/20 bg-background px-3 py-2 text-sm whitespace-pre-wrap">
          <span className="font-medium">Suggested next action: </span>
          {nextAction}
        </p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        AI suggestion from {formatRelativeTime(record.createdAt)}
      </p>
      <button
        type="button"
        onClick={onReview}
        className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Review triage
      </button>
    </section>
  );
}
