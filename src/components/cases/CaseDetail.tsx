import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, FileText } from "lucide-react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { LoadingSkeleton as PageSkeleton } from "@/components/layout/ProtectedRoute";
import { toast } from "@/components/common/toast";
import { CaseActionPanel } from "./CaseActionPanel";
import { getPrimaryAction, type PanelAction } from "./caseActions";
import { AISummaryCard } from "./AISummaryCard";
import { ReviewTriageSheet } from "./ReviewTriageSheet";
import { PriorityBadge } from "./PriorityBadge";
import { caseStatusVariant, formatRelativeTime, formatStatus } from "./caseDisplay";
import { AssignDialog } from "./dialogs/AssignDialog";
import { CloseCaseDialog } from "./dialogs/CloseCaseDialog";
import { EditCaseDialog } from "./dialogs/EditCaseDialog";
import { NoteDialog } from "./dialogs/NoteDialog";
import { ReopenDialog } from "./dialogs/ReopenDialog";
import { StatusChangeDialog } from "./dialogs/StatusChangeDialog";
import { errorMessage } from "./dialogs/dialogUtils";
import { useSyncStatus } from "@/hooks/useSyncUser";
import { ACTIVITY_ICONS } from "./activityIcons";

function ActivityItem({ activity }: { activity: Doc<"caseActivities"> }) {
  const Icon = ACTIVITY_ICONS[activity.type] ?? FileText;
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 rounded-full bg-muted p-1.5">
        <Icon className="size-4 text-muted-foreground" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm">{activity.summary}</p>
        <p className="text-xs text-muted-foreground">
          {activity.actorType} · {formatRelativeTime(activity.createdAt)}
        </p>
      </div>
    </li>
  );
}

export function CaseDetailNotFound({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="flex w-fit items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
      >
        <ArrowLeft className="size-4" /> Back to cases
      </button>
      <EmptyState
        title="Case not found"
        description="It may have been moved, or you may not have access to it."
        action={
          <button
            type="button"
            onClick={onBack}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Back to cases
          </button>
        }
      />
    </div>
  );
}

export function CaseDetail({
  caseId,
  onClose,
}: {
  caseId: Id<"cases">;
  onClose: () => void;
}) {
  const { userId } = useSyncStatus();
  const data = useQuery(api.cases.queries.get, { caseId });
  const transitionStatus = useMutation(api.cases.mutations.transitionStatus);
  const [dialog, setDialog] = useState<
    null | "note" | "edit" | "assign" | "status" | "close" | "reopen"
  >(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const propertyId = data?.case.propertyId;
  const buildingId = data?.case.buildingId;
  const buildings = useQuery(
    api.buildings.listByProperty,
    propertyId ? { propertyId } : "skip",
  );
  const units = useQuery(
    api.units.listByBuilding,
    buildingId ? { buildingId } : "skip",
  );
  const properties = useQuery(api.properties.list, {});

  if (data === undefined) {
    return <PageSkeleton />;
  }
  if (data === null) {
    return <CaseDetailNotFound onBack={onClose} />;
  }

  const { case: record, activities, allowedActions } = data;
  const property = properties?.find((p) => p._id === record.propertyId);
  const building = buildings?.find((b) => b._id === record.buildingId);
  const unit = units?.find((u) => u._id === record.unitId);
  const locationLabel = property
    ? [property.name, building?.name, unit?.label]
        .filter(Boolean)
        .join(" / ")
    : "Location unknown";

  const primary = getPrimaryAction(record, allowedActions);

  async function handleAction(action: PanelAction) {
    if (action.kind === "review") {
      setReviewOpen(true);
      return;
    }
    if (action.kind === "transition") {
      try {
        await transitionStatus({
          caseId: record._id,
          nextStatus: action.to,
        });
        toast.success(`Case moved to ${formatStatus(action.to)}`);
      } catch (err) {
        toast.error(errorMessage(err));
      }
      return;
    }
    setDialog(action.kind);
  }

  function closeDialog() {
    setDialog(null);
  }

  return (
    <>
      <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <header className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent xl:hidden"
              >
                <ArrowLeft className="size-4" /> Back
              </button>
            </div>
        <p className="font-mono text-xs text-muted-foreground">
          #{record.caseNumber}
        </p>
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-xl font-semibold">{record.title}</h1>
        </div>
        <p className="text-sm text-muted-foreground">{locationLabel}</p>
        <p className="flex flex-wrap items-center gap-2">
          <StatusBadge variant={caseStatusVariant(record.status)}>
            {formatStatus(record.status)}
          </StatusBadge>
          <PriorityBadge priority={record.priority} />
        </p>
        <p className="text-sm text-muted-foreground">
          {record.assigneeId
            ? record.assigneeId === userId
              ? "Assigned to you"
              : "Assigned"
            : "Unassigned"}
        </p>
      </header>

      <AISummaryCard record={record} onReview={() => setReviewOpen(true)} />

      <section className="rounded-xl border bg-card p-6">
        <h2 className="font-medium">Issue</h2>        <p className="mt-2 text-sm whitespace-pre-wrap">{record.description}</p>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Category</dt>
          <dd>{record.category}</dd>
          <dt className="text-muted-foreground">Reporter</dt>
          <dd>
            {record.reporterName ?? "—"}
            {record.reporterEmail ? ` (${record.reporterEmail})` : ""}
          </dd>
          <dt className="text-muted-foreground">Created</dt>
          <dd>{new Date(record.createdAt).toLocaleString()}</dd>
        </dl>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="font-medium">Timeline</h2>
        {activities.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No activity yet" />
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {activities.map((activity) => (
              <ActivityItem key={activity._id} activity={activity} />
            ))}
          </ul>
        )}
      </section>

      {/*
        Later phases insert sections here — do not add them in 3-B-2:
        - Phase 5: Communications section (email threads, reply composer)
        - Phase 7: Vendor section (selected vendor, discovery entry point)
        - Phase 9: Resolution section (vendor completion, confirmation state)
      */}
        </div>
        <div className="xl:sticky xl:top-6">
          <CaseActionPanel
            record={record}
            allowed={allowedActions}
            onAction={handleAction}
          />
        </div>
      </div>
      {primary.action && (
        <div className="sticky bottom-0 -mx-1 mt-2 border-t bg-background/95 p-3 backdrop-blur xl:hidden">
          <button
            type="button"
            disabled={primary.disabled}
            onClick={() => primary.action && handleAction(primary.action)}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {primary.label}
          </button>
        </div>
      )}
      {dialog === "note" && (
        <NoteDialog open onClose={closeDialog} record={record} />
      )}
      {dialog === "edit" && (
        <EditCaseDialog open onClose={closeDialog} record={record} />
      )}
      {dialog === "assign" && (
        <AssignDialog open onClose={closeDialog} record={record} />
      )}
      {dialog === "status" && (
        <StatusChangeDialog
          open
          onClose={closeDialog}
          record={record}
          allowedTo={allowedActions.canTransitionTo}
        />
      )}
      {dialog === "close" && (
        <CloseCaseDialog
          open
          onClose={closeDialog}
          record={record}
          allowed={allowedActions.canClose}
        />
      )}
      {dialog === "reopen" && (
        <ReopenDialog open onClose={closeDialog} record={record} />
      )}
      {reviewOpen && (
        <ReviewTriageSheet
          record={record}
          open
          onClose={() => setReviewOpen(false)}
        />
      )}
    </>
  );
}

export function CaseDetailErrorFallback({
  onBack,
}: {
  onBack: () => void;
}) {
  return <CaseDetailNotFound onBack={onBack} />;
}
