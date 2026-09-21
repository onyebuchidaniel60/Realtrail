import { useUser } from "@clerk/clerk-react";
import { useQuery } from "convex/react";
import { Navigate, useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { QueryErrorBoundary } from "@/components/common/ErrorBoundary";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { LoadingSkeleton as PageSkeleton } from "@/components/layout/ProtectedRoute";
import { AttentionCard } from "@/components/dashboard/AttentionCard";
import { MetricCardsRow } from "@/components/dashboard/MetricCardsRow";
import { OperationsFlow } from "@/components/dashboard/OperationsFlow";
import { RecentActivityList } from "@/components/dashboard/RecentActivityList";
import { UpNextList } from "@/components/dashboard/UpNextList";
import { useSyncStatus } from "@/hooks/useSyncUser";

function greetingFor(date: Date): string {
  const hours = date.getHours();
  if (hours < 12) {
    return "Good morning";
  }
  if (hours < 18) {
    return "Good afternoon";
  }
  return "Good evening";
}

export function OverviewPage() {
  const { synced } = useSyncStatus();
  const { user } = useUser();
  const navigate = useNavigate();
  const current = useQuery(
    api.workspace.getCurrent,
    synced ? {} : "skip",
  );

  if (current === undefined) {
    return <PageSkeleton />;
  }
  if (current.needsOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  const firstName = user?.firstName?.trim() || null;
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">
          {greetingFor(new Date())}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          {today} · {current.workspace?.name ?? "Overview"}
        </p>
      </header>

      <QueryErrorBoundary
        fallback={(_error, reset) => (
          <ErrorState
            message="Could not load the dashboard."
            onRetry={reset}
          />
        )}
      >
        <DashboardBody
          onCreateCase={() => navigate("/cases")}
        />
      </QueryErrorBoundary>
    </div>
  );
}

function DashboardBody({ onCreateCase }: { onCreateCase: () => void }) {
  const { synced } = useSyncStatus();
  // Default range is this week; the backend is currently range-independent
  // (reserved for the Phase 4-B date selector, a SHOULD HAVE feature).
  const dashboard = useQuery(
    api.dashboard.get,
    synced ? { range: "week" } : "skip",
  );
  const properties = useQuery(api.properties.list, synced ? {} : "skip");

  if (dashboard === undefined || properties === undefined) {
    return (
      <div className="flex flex-col gap-6">
        <LoadingSkeleton rows={3} />
        <LoadingSkeleton rows={2} />
        <LoadingSkeleton rows={4} />
      </div>
    );
  }

  const isEmpty =
    dashboard.metrics.open === 0 &&
    dashboard.upNext.length === 0 &&
    dashboard.attention.length === 0;

  if (isEmpty) {
    return (
      <EmptyState
        title="Your operations are quiet today. Create your first case to get started."
        action={
          <button
            type="button"
            // TODO: open the New Case dialog directly (via query param or
            // dialog state lifted to the Cases screen) instead of plain
            // navigation.
            onClick={onCreateCase}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Create first case
          </button>
        }
      />
    );
  }

  const propertyNames = new Map(properties.map((p) => [p._id, p.name] as const));

  return (
    <div className="flex flex-col gap-6">
      <AttentionCard
        attentionCount={dashboard.attention.length}
        urgent={dashboard.metrics.urgent}
        waitingOnVendor={dashboard.metrics.waitingOnVendor}
        awaitingConfirmation={dashboard.metrics.awaitingConfirmation}
      />
      {/* NOTE: the backend caps the attention list at 10, so workspaces
          with more than 10 attention-worthy cases will under-report here.
          A dedicated attentionCount field may follow in a future phase. */}
      <MetricCardsRow metrics={dashboard.metrics} />
      <OperationsFlow operations={dashboard.operations} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <UpNextList items={dashboard.upNext} propertyNames={propertyNames} />
        <RecentActivityList items={dashboard.recentActivity} />
      </div>
    </div>
  );
}
