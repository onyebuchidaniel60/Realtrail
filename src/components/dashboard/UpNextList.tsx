import { useNavigate } from "react-router-dom";
import type { Doc } from "../../../convex/_generated/dataModel";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  caseStatusVariant,
  formatRelativeTime,
  formatStatus,
} from "@/components/cases/caseDisplay";

export function UpNextList({
  items,
  propertyNames,
}: {
  items: Doc<"cases">[];
  propertyNames: Map<string, string>;
}) {
  const navigate = useNavigate();

  return (
    <section className="rounded-xl border bg-card p-6">
      <h2 className="font-medium">Up next</h2>
      {items.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="Nothing in the queue right now." />
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-1">
          {items.map((record) => (
            <li key={record._id}>
              <button
                type="button"
                onClick={() =>
                  navigate(`/cases?caseId=${record._id as string}`)
                }
                className="flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left hover:bg-accent/50"
              >
                <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">#{record.caseNumber}</span>
                  <span>{formatRelativeTime(record.lastActivityAt)}</span>
                </span>
                <span className="text-sm font-medium">{record.title}</span>
                <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {record.propertyId
                      ? (propertyNames.get(record.propertyId) ??
                        "Unknown property")
                      : "Location unknown"}
                  </span>
                  <StatusBadge variant={caseStatusVariant(record.status)}>
                    {formatStatus(record.status)}
                  </StatusBadge>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
