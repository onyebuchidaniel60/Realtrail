import { useNavigate } from "react-router-dom";

export function AttentionCard({
  attentionCount,
  urgent,
  waitingOnVendor,
  awaitingConfirmation,
}: {
  attentionCount: number;
  urgent: number;
  waitingOnVendor: number;
  awaitingConfirmation: number;
}) {
  const navigate = useNavigate();

  if (attentionCount === 0) {
    return (
      <section className="rounded-xl border border-green-200 bg-green-50 p-6 dark:border-green-900 dark:bg-green-950">
        <h2 className="text-lg font-medium">You&apos;re caught up.</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          No cases need attention right now.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border bg-card p-6">
      <h2 className="text-lg font-medium">
        {attentionCount} {attentionCount === 1 ? "case needs" : "cases need"}{" "}
        attention
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {urgent} urgent · {waitingOnVendor} waiting on vendors ·{" "}
        {awaitingConfirmation} awaiting confirmation
      </p>
      {/* TODO(Phase 12): pre-filter the Cases screen via query params. */}
      <button
        type="button"
        onClick={() => navigate("/cases")}
        className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Review cases →
      </button>
    </section>
  );
}
