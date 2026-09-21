import { useQuery } from "convex/react";
import { Navigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { LoadingSkeleton } from "@/components/layout/ProtectedRoute";
import { useSyncStatus } from "@/hooks/useSyncUser";

// TODO(Phase 4): replace with the real operations dashboard (metric cards,
// attention card, operations flow, up-next list, recent activity).
export function OverviewPage() {
  const { synced } = useSyncStatus();
  const current = useQuery(
    api.workspace.getCurrent,
    synced ? {} : "skip",
  );

  if (current === undefined) {
    return <LoadingSkeleton />;
  }
  if (current.needsOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">
          {current.workspace?.name ?? "Overview"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Estate operations control center
        </p>
      </header>
      <section className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-medium">Operations dashboard</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Coming in Phase 4.
        </p>
        {/* TODO(Phase 3): wire to the New Case flow when cases exist. */}
        <button
          type="button"
          disabled
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Create first case
        </button>
      </section>
    </div>
  );
}
