import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PriorityBadge } from "./PriorityBadge";
import { caseStatusVariant, formatRelativeTime, formatStatus } from "./caseDisplay";

export function CaseTable({
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
    <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b text-xs tracking-wide text-muted-foreground uppercase">
            <th className="px-4 py-3 font-medium">Case</th>
            <th className="px-4 py-3 font-medium">Title</th>
            <th className="px-4 py-3 font-medium">Location</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Priority</th>
            <th className="hidden px-4 py-3 font-medium lg:table-cell">
              Next action
            </th>
            <th className="hidden px-4 py-3 font-medium lg:table-cell">
              Updated
            </th>
          </tr>
        </thead>
        <tbody>
          {cases.map((record) => (
            <tr
              key={record._id}
              onClick={() => onSelect(record._id)}
              className={`cursor-pointer border-b last:border-0 hover:bg-accent/50 ${
                record._id === selectedId ? "bg-accent" : ""
              }`}
            >
              <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                #{record.caseNumber}
              </td>
              <td className="max-w-xs px-4 py-3">
                <p className="font-medium">{record.title}</p>
                <p className="truncate text-muted-foreground">
                  {record.description}
                </p>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                {record.propertyId
                  ? (propertyNames.get(record.propertyId) ?? "Unknown property")
                  : "Location unknown"}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <StatusBadge variant={caseStatusVariant(record.status)}>
                  {formatStatus(record.status)}
                </StatusBadge>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <PriorityBadge priority={record.priority} />
              </td>
              <td className="hidden max-w-48 truncate px-4 py-3 text-muted-foreground lg:table-cell">
                {record.nextActionLabel ?? "—"}
              </td>
              <td className="hidden px-4 py-3 whitespace-nowrap text-muted-foreground lg:table-cell">
                {formatRelativeTime(record.lastActivityAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
