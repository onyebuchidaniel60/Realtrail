import type { Doc } from "../../../convex/_generated/dataModel";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import {
  getPrimaryAction,
  type AllowedActions,
  type PanelAction,
} from "./caseActions";

const secondaryButtonClass =
  "flex w-full items-center justify-between rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-50";

export function CaseActionPanel({
  record,
  allowed,
  onAction,
}: {
  record: Doc<"cases"> | undefined;
  allowed: AllowedActions | undefined;
  onAction: (action: PanelAction) => void;
}) {
  if (!record || !allowed) {
    return <LoadingSkeleton rows={4} />;
  }

  const primary = getPrimaryAction(record, allowed);
  const closed = record.status === "CLOSED";
  const primaryIsStatusDialog =
    primary.action !== null && primary.action.kind === "status";
  const primaryIsClose =
    primary.action !== null && primary.action.kind === "close";

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border bg-card p-6">
        <h2 className="font-medium">What happens next?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {record.nextActionLabel ?? primary.label}
        </p>
        {primary.action && (
          <button
            type="button"
            disabled={primary.disabled}
            onClick={() => primary.action && onAction(primary.action)}
            className="mt-4 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {primary.label}
          </button>
        )}
      </section>

      {!closed && (
        <section className="rounded-xl border bg-card p-3">
          <button
            type="button"
            onClick={() => onAction({ kind: "note" })}
            className={secondaryButtonClass}
          >
            Add note <span aria-hidden="true">→</span>
          </button>
          <button
            type="button"
            disabled={!allowed.canEdit}
            onClick={() => onAction({ kind: "edit" })}
            className={secondaryButtonClass}
          >
            Edit details <span aria-hidden="true">→</span>
          </button>
          <button
            type="button"
            disabled={!allowed.canAssign}
            onClick={() => onAction({ kind: "assign" })}
            className={secondaryButtonClass}
          >
            Assign / Reassign <span aria-hidden="true">→</span>
          </button>
          {!primaryIsStatusDialog && (
            <button
              type="button"
              disabled={allowed.canTransitionTo.length === 0}
              onClick={() => onAction({ kind: "status" })}
              className={secondaryButtonClass}
            >
              Change status <span aria-hidden="true">→</span>
            </button>
          )}
        </section>
      )}

      {!closed && !primaryIsClose && (
        <section className="rounded-xl border bg-card p-3">
          <button
            type="button"
            disabled={
              !(
                allowed.canClose.resolved ||
                allowed.canClose.duplicate ||
                allowed.canClose.invalid ||
                allowed.canClose.cancelled
              )
            }
            onClick={() => onAction({ kind: "close" })}
            className="flex w-full items-center justify-between rounded-lg border border-destructive/40 px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            Close case <span aria-hidden="true">→</span>
          </button>
        </section>
      )}
    </div>
  );
}
