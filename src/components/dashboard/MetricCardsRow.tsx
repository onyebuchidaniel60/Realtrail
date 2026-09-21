import { useNavigate } from "react-router-dom";
import { MetricCard } from "@/components/common/MetricCard";

export interface DashboardMetrics {
  open: number;
  urgent: number;
  waitingOnVendor: number;
  awaitingConfirmation: number;
  resolvedThisWeek: number;
}

export function MetricCardsRow({ metrics }: { metrics: DashboardMetrics }) {
  const navigate = useNavigate();
  const goCases = () => navigate("/cases");

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <MetricCard label="Open cases" value={metrics.open} onClick={goCases} />
      <MetricCard
        label="Urgent cases"
        value={metrics.urgent}
        variant={metrics.urgent > 0 ? "danger" : "default"}
        caption={metrics.urgent > 0 ? "needs follow-up" : undefined}
        onClick={goCases}
      />
      <MetricCard
        label="Waiting on vendor"
        value={metrics.waitingOnVendor}
        variant={metrics.waitingOnVendor > 0 ? "warning" : "default"}
        onClick={goCases}
      />
      <MetricCard
        label="Resolved this week"
        value={metrics.resolvedThisWeek}
        variant={metrics.resolvedThisWeek > 0 ? "success" : "default"}
        caption="this week"
        onClick={goCases}
      />
    </div>
  );
}
