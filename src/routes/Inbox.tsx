import { useQuery } from "convex/react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { useSyncStatus } from "@/hooks/useSyncUser";
import { cn } from "@/lib/utils";
import { ConversationList } from "@/components/inbox/ConversationList";
import { ConversationView } from "@/components/inbox/ConversationView";

type InboxFilter = "all" | "residents" | "vendors";

const TABS: Array<{ value: InboxFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "residents", label: "Residents" },
  { value: "vendors", label: "Vendors" },
];

export function InboxPage() {
  const { synced } = useSyncStatus();
  const [searchParams, setSearchParams] = useSearchParams();
  const threadId = searchParams.get("threadId");
  const [filter, setFilter] = useState<InboxFilter>("all");

  const listResult = useQuery(
    api.email.queries.list,
    synced ? { filter, pageSize: 25 } : "skip",
  );
  const current = useQuery(api.workspace.getCurrent, synced ? {} : "skip");
  const inboxAddress = current?.workspace?.agentMailInboxAddress;

  function selectThread(id: string) {
    setSearchParams({ threadId: id });
  }

  function clearThread() {
    setSearchParams({});
  }

  const rows = listResult?.communications ?? [];
  const unreadCount = listResult?.unreadCount ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inbox</h1>
      </header>

      {/* Segmented filter control. The unread badge renders only for the
          currently-selected tab: the backend returns one workspace-wide
          count per query, and pre-fetching all three filters would triple
          the read cost for a badge. Documented limitation. */}
      <div
        role="tablist"
        aria-label="Filter conversations"
        className="flex w-fit items-center gap-1 rounded-lg border bg-muted p-1"
      >
        {TABS.map((tab) => {
          const active = filter === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(tab.value)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {active && unreadCount > 0 && (
                <span
                  aria-label={`${unreadCount} unread`}
                  className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground"
                >
                  {unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {listResult === undefined ? (
        <LoadingSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No messages yet"
          description={
            inboxAddress
              ? `Send a test email to ${inboxAddress} to see it here.`
              : "New inbound emails will appear here once the workspace inbox is provisioned."
          }
        />
      ) : (
        <div className="flex min-h-0 items-start gap-6">
          <section
            aria-label="Conversations"
            className={cn(
              "min-h-0 flex-col",
              threadId !== null
                ? "hidden md:flex md:w-[280px] md:shrink-0 xl:w-[360px]"
                : "flex flex-1 md:w-[280px] md:shrink-0 xl:w-[360px]",
            )}
          >
            <ConversationList
              rows={rows}
              selectedThreadId={threadId}
              onSelect={selectThread}
            />
          </section>

          <section
            aria-label="Conversation"
            className={cn(
              "min-h-0 min-w-0 flex-col",
              threadId !== null ? "flex flex-1" : "hidden flex-1 md:flex",
            )}
          >
            {threadId !== null ? (
              <ConversationView threadId={threadId} onBack={clearThread} />
            ) : (
              <div className="hidden flex-1 items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center md:flex">
                <p className="text-sm text-muted-foreground">
                  Select a conversation to view it
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
