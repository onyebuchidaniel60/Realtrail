import { Fragment } from "react";
import { ChevronRight } from "lucide-react";

export interface OperationsBuckets {
  new: number;
  triaged: number;
  inProgress: number;
  vendorContacted: number;
  scheduled: number;
  workInProgress: number;
  awaitingConfirmation: number;
  resolved: number;
  closed: number;
}

// Spec §11.4 shows six stages; SCHEDULED, WORK_IN_PROGRESS, and CLOSED
// ride below as secondary counts. TODO(Phase 12): make stages filter
// the Cases screen.
const STAGES = [
  { key: "new", label: "New" },
  { key: "triaged", label: "Triaged" },
  { key: "inProgress", label: "In progress" },
  { key: "vendorContacted", label: "Vendor contacted" },
  { key: "awaitingConfirmation", label: "Awaiting confirmation" },
  { key: "resolved", label: "Resolved" },
] as const;

export function OperationsFlow({
  operations,
}: {
  operations: OperationsBuckets;
}) {
  return (
    <section className="rounded-xl border bg-card p-6">
      <h2 className="font-medium">Operations flow</h2>
      <div className="relative mt-4">
        <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
          {STAGES.map((stage, i) => (
            <Fragment key={stage.key}>
              <div className="flex min-w-28 flex-1 flex-col items-center rounded-lg bg-muted/50 px-2 py-3 text-center">
                <span className="text-xl font-semibold">
                  {operations[stage.key]}
                </span>
                <span className="mt-0.5 text-xs text-muted-foreground">
                  {stage.label}
                </span>
              </div>
              {i < STAGES.length - 1 && (
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 self-center text-muted-foreground"
                />
              )}
            </Fragment>
          ))}
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent"
        />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {operations.scheduled} scheduled · {operations.workInProgress} in
        progress · {operations.closed} closed
      </p>
    </section>
  );
}
