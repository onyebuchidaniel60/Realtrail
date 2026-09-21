import { FileText } from "lucide-react";
import { Link } from "react-router-dom";
import type { Id } from "../../../convex/_generated/dataModel";
import { EmptyState } from "@/components/common/EmptyState";
import { ACTIVITY_ICONS } from "@/components/cases/activityIcons";
import { formatRelativeTime } from "@/components/cases/caseDisplay";

export interface RecentActivityEntry {
  _id: Id<"caseActivities">;
  caseId: Id<"cases">;
  caseNumber: number;
  caseTitle: string;
  type: string;
  summary: string;
  actorType: "user" | "system" | "ai" | "resident" | "vendor";
  createdAt: number;
}

export function RecentActivityList({
  items,
}: {
  items: RecentActivityEntry[];
}) {
  return (
    <section className="rounded-xl border bg-card p-6">
      <h2 className="font-medium">Recent activity</h2>
      {items.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No recent activity." />
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {items.map((entry) => {
            const Icon = ACTIVITY_ICONS[entry.type] ?? FileText;
            return (
              <li key={entry._id} className="flex gap-3">
                <span className="mt-0.5 rounded-full bg-muted p-1.5">
                  <Icon className="size-4 text-muted-foreground" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{entry.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    <Link
                      to={`/cases?caseId=${entry.caseId as string}`}
                      className="font-medium hover:underline"
                    >
                      #{entry.caseNumber} {entry.caseTitle}
                    </Link>{" "}
                    · {formatRelativeTime(entry.createdAt)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
