import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  variant = "default",
  caption,
  onClick,
}: {
  label: string;
  value: number | string;
  variant?: "default" | "warning" | "danger" | "success";
  caption?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold",
          variant === "warning" && "text-yellow-600 dark:text-yellow-400",
          variant === "danger" && "text-red-600 dark:text-red-400",
          variant === "success" && "text-green-600 dark:text-green-400",
        )}
      >
        {value}
      </p>
      {caption && (
        <p className="mt-0.5 text-xs text-muted-foreground">{caption}</p>
      )}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        data-variant={variant}
        className="rounded-xl border bg-card px-4 py-3 text-left hover:bg-accent/50"
      >
        {body}
      </button>
    );
  }
  return (
    <div data-variant={variant} className="rounded-xl border bg-card px-4 py-3">
      {body}
    </div>
  );
}
