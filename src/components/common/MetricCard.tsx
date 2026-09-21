import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: number | string;
  variant?: "default" | "warning" | "danger";
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold",
          variant === "warning" && "text-yellow-600 dark:text-yellow-400",
          variant === "danger" && "text-red-600 dark:text-red-400",
        )}
      >
        {value}
      </p>
    </div>
  );
}
