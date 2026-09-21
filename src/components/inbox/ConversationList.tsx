import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/components/cases/caseDisplay";
import { senderLabel, type InboxRow } from "./inboxDisplay";

function ConversationListItem({
  row,
  selected,
  onSelect,
}: {
  row: InboxRow;
  selected: boolean;
  onSelect: (threadId: string) => void;
}) {
  const unread = row.readAt === undefined;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(row.threadId)}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex w-full flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-accent/50",
          selected ? "border-primary bg-accent" : "bg-card",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "flex min-w-0 items-center gap-1.5 text-sm",
              unread ? "font-semibold" : "font-medium",
            )}
          >
            {unread && (
              <span
                aria-label="Unread"
                title="Unread"
                className="size-2 shrink-0 rounded-full bg-primary"
              />
            )}
            <span className="truncate">{senderLabel(row)}</span>
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatRelativeTime(row.createdAt)}
          </span>
        </div>
        <p className="truncate text-sm text-foreground">{row.subject}</p>
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {row.preview}
          </p>
          {row.caseNumber !== undefined && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              #{row.caseNumber}
            </span>
          )}
        </div>
      </button>
    </li>
  );
}

export function ConversationList({
  rows,
  selectedThreadId,
  onSelect,
}: {
  rows: InboxRow[];
  selectedThreadId: string | null;
  onSelect: (threadId: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-2 overflow-y-auto">
      {rows.map((row) => (
        <ConversationListItem
          key={row._id}
          row={row}
          selected={row.threadId === selectedThreadId}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}
