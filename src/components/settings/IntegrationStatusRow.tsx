import { StatusBadge } from "@/components/common/StatusBadge";

export type IntegrationStatus = "live" | "configured" | "not_configured";

// One integration health row: label, status chip, optional detail line
// (e.g. the workspace intake address). Never renders env var names,
// values, keys, or IDs — the backend only returns these enums.
export function IntegrationStatusRow({
  label,
  description,
  status,
  detail,
}: {
  label: string;
  description: string;
  status: IntegrationStatus;
  detail?: string;
}) {
  const ready = status !== "not_configured";
  return (
    <div className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
        {detail && (
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {detail}
          </p>
        )}
      </div>
      <StatusBadge variant={ready ? "success" : "default"}>
        {status === "live"
          ? "Live"
          : status === "configured"
            ? "Configured"
            : "Not configured"}
      </StatusBadge>
    </div>
  );
}
