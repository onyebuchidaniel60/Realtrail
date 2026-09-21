import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { StatusBadge } from "@/components/common/StatusBadge";
import { QueryErrorBoundary } from "@/components/common/ErrorBoundary";
import { formatRelativeTime } from "@/components/cases/caseDisplay";
import { cn } from "@/lib/utils";
import { LinkToCaseDialog } from "./LinkToCaseDialog";

// Delay before an opened thread is auto-marked as read: long enough to
// ignore accidental clicks, short enough to feel automatic.
const AUTO_READ_DELAY_MS = 1000;

function MessageBlock({
  message,
}: {
  message: {
    _id: Id<"communications">;
    direction: "inbound" | "outbound";
    fromEmail: string;
    toEmails: string[];
    textBody: string;
    createdAt: number;
    readAt?: number;
  };
}) {
  const inbound = message.direction === "inbound";
  return (
    <article
      className={cn(
        "flex max-w-full flex-col gap-1 rounded-lg border px-3 py-2.5",
        inbound ? "self-start bg-card" : "self-end bg-accent",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="text-xs font-medium">
          {message.fromEmail}
          <span className="font-normal text-muted-foreground">
            {" → "}
            {message.toEmails.join(", ")}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          {formatRelativeTime(message.createdAt)}
        </p>
      </div>
      {/* Plain text only: React escapes by default; never use
          dangerouslySetInnerHTML here (ARCHITECTURE.md §14 XSS). */}
      <p className="text-sm break-words whitespace-pre-wrap">
        {message.textBody}
      </p>
    </article>
  );
}

function ConversationBody({ threadId }: { threadId: string }) {
  const thread = useQuery(api.email.queries.getThread, { threadId });
  const markThreadRead = useMutation(api.email.mutations.markThreadRead);
  const [linkOpen, setLinkOpen] = useState(false);
  const markedRef = useRef<string | null>(null);

  // Auto-mark once per opened thread, after a short delay. The ref guard
  // keys on threadId so rapid thread switching never double-marks and a
  // timer for a previous thread cannot mark the newly opened one: the
  // effect cleanup clears the pending timer on thread change.
  useEffect(() => {
    markedRef.current = null;
    const timer = setTimeout(() => {
      if (markedRef.current === threadId) {
        return;
      }
      markedRef.current = threadId;
      markThreadRead({ threadId }).catch(() => {
        // Read state is best-effort; a failure here must not break the
        // conversation view. The manual button remains available.
      });
    }, AUTO_READ_DELAY_MS);
    return () => clearTimeout(timer);
  }, [threadId, markThreadRead]);

  if (thread === undefined) {
    return <LoadingSkeleton rows={4} />;
  }

  const messages = thread.communications;
  const first = messages[0];
  const anyUnread = messages.some((m) => m.readAt === undefined);
  const canLink =
    thread.linkedCase === null &&
    first !== undefined &&
    first.direction === "inbound";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-4 py-3">
        <h2 className="truncate text-base font-semibold">
          {first?.subject ?? "Conversation"}
        </h2>
        {first && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {first.fromEmail} → {first.toEmails.join(", ")}
          </p>
        )}
        {thread.linkedCase && (
          <p className="mt-1.5">
            <StatusBadge>
              #{thread.linkedCase.caseNumber} {thread.linkedCase.title}
            </StatusBadge>
          </p>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {messages.map((message) => (
          <MessageBlock key={message._id} message={message} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
        {canLink && first && (
          <button
            type="button"
            onClick={() => setLinkOpen(true)}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            Link to case
          </button>
        )}
        {anyUnread ? (
          <button
            type="button"
            onClick={() => markThreadRead({ threadId })}
            className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            Mark as read
          </button>
        ) : null}
        {/* TODO(Phase 8): Reply composes an outbound message on this thread. */}
        <button
          type="button"
          disabled
          title="Reply arrives in a later phase"
          className="rounded-md border px-3 py-2 text-sm font-medium opacity-50"
        >
          Reply
        </button>
        {/* TODO(Phase 9): Mark resolved drives the confirmation flow. */}
        <button
          type="button"
          disabled
          title="Resolution arrives in a later phase"
          className="rounded-md border px-3 py-2 text-sm font-medium opacity-50"
        >
          Mark resolved
        </button>
      </div>

      {linkOpen && first && (
        <LinkToCaseDialog
          open
          onClose={() => setLinkOpen(false)}
          communicationId={first._id}
        />
      )}
    </div>
  );
}

export function ConversationView({
  threadId,
  onBack,
}: {
  threadId: string;
  onBack: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border bg-background">
      <div className="flex items-center gap-2 border-b px-2 py-2 md:hidden">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to inbox"
          className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
        >
          ← Back
        </button>
      </div>
      <QueryErrorBoundary
        key={threadId}
        fallback={(_error, reset) => (
          <ErrorState message="Could not load this conversation." onRetry={reset} />
        )}
      >
        <ConversationBody threadId={threadId} />
      </QueryErrorBoundary>
    </div>
  );
}
