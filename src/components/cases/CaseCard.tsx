import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PriorityBadge } from "./PriorityBadge";
import { caseStatusVariant, formatRelativeTime, formatStatus } from "./caseDisplay";

export function CaseCardList({
  cases,
  propertyNames,
  selectedId,
  onSelect,
}: {
  cases: Doc<"cases">[];
  propertyNames: Map<string, string>;
  selectedId: Id<"cases"> | null;
  onSelect: (caseId: Id<"cases">) => void;
}) {
  return (
    <div data-testid="case-cards" className="flex flex-col gap-3 md:hidden">
      {cases.map((record) => (
        <button
          key={record._id}
          type="button"
          onClick={() => onSelect(record._id)}
          className={`rounded-xl border bg-card p-4 text-left ${
            record._id === selectedId ? "border-primary" : ""
          }`}
        >
          <p className="flex items-center justify-between text-xs">
            <span className="font-mono">#{record.caseNumber}</span>
            <PriorityBadge priority={record.priority} />
          </p>
          <p className="mt-1 font-medium">{record.title}</p>
          <p className="text-sm text-muted-foreground">
            {record.propertyId
              ? (propertyNames.get(record.propertyId) ?? "Unknown property")
              : "Location unknown"}
          </p>
          <p className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <StatusBadge variant={caseStatusVariant(record.status)}>
              {formatStatus(record.status)}
            </StatusBadge>
            <span>{formatRelativeTime(record.lastActivityAt)}</span>
          </p>
          {record.nextActionLabel && (
            <p className="mt-1 text-xs text-muted-foreground">
              Next: {record.nextActionLabel}
            </p>
          )}
        </button>
      ))}
    </div>
  );
}
