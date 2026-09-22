import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { CaseStatus } from "../../../convex/cases/stateMachine";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { toast } from "@/components/common/toast";
import { errorMessage } from "./dialogs/dialogUtils";
import { formatRelativeTime } from "./caseDisplay";

// Manager-side confirmation controls (Phase 9-C). This panel never
// renders the raw token or the confirmation URL — the link travels to
// the resident by email only. case.status is authoritative; the
// getConfirmationState projection only describes the token layer.
export function ConfirmationPanel({
  caseId,
  caseStatus,
}: {
  caseId: Id<"cases">;
  caseStatus: CaseStatus;
}) {
  const requestConfirmation = useMutation(
    api.cases.confirmation.requestConfirmation,
  );
  const state = useQuery(api.cases.confirmation.getConfirmationState, {
    caseId,
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (
    caseStatus !== "WORK_IN_PROGRESS" &&
    caseStatus !== "AWAITING_CONFIRMATION" &&
    caseStatus !== "RESOLVED"
  ) {
    return null;
  }
  if (state === undefined) {
    return (
      <section className="rounded-xl border bg-card p-6">
        <h2 className="font-medium">Resident confirmation</h2>
        <div className="mt-4">
          <LoadingSkeleton rows={2} />
        </div>
      </section>
    );
  }

  async function handleConfirm() {
    setConfirming(true);
    setFormError(null);
    try {
      await requestConfirmation({ caseId });
      toast.success("Confirmation requested");
      setConfirmOpen(false);
    } catch (err) {
      const message = errorMessage(err);
      setFormError(message);
      toast.error(message);
    } finally {
      setConfirming(false);
    }
  }

  if (caseStatus === "RESOLVED") {
    const residentConfirmed = state.lastDecision === "yes";
    return (
      <section
        className={
          residentConfirmed
            ? "rounded-xl border border-green-200 bg-green-50 p-6"
            : "rounded-xl border bg-card p-6"
        }
      >
        <h2 className="font-medium">
          {residentConfirmed ? "Resolved — confirmed by resident" : "Resolved"}
        </h2>
      </section>
    );
  }

  if (caseStatus === "AWAITING_CONFIRMATION") {
    return (
      <section className="rounded-xl border bg-card p-6">
        <h2 className="font-medium">Awaiting resident response</h2>
        {state.requested && state.requestedAt !== undefined ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Requested {formatRelativeTime(state.requestedAt)}
            {state.expiresAt !== undefined &&
              ` · Expires ${formatRelativeTime(state.expiresAt)}`}
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            A confirmation was requested for this case.
          </p>
        )}
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="mt-4 w-full rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Resend confirmation
        </button>
        {formError && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {formError}
          </p>
        )}
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Resend confirmation?"
          description="This issues a new link. The previous link will no longer work."
          confirmLabel="Resend"
          confirming={confirming}
          onConfirm={handleConfirm}
        />
      </section>
    );
  }

  return (
    <section className="rounded-xl border bg-card p-6">
      <h2 className="font-medium">Resident confirmation</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        This will email the resident a one-time link to confirm the issue
        is resolved.
      </p>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="mt-4 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Request resident confirmation
      </button>
      {formError && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {formError}
        </p>
      )}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Request resident confirmation?"
        description="This will email the resident a one-time link to confirm the issue is resolved."
        confirmLabel="Send request"
        confirming={confirming}
        onConfirm={handleConfirm}
      />
    </section>
  );
}
