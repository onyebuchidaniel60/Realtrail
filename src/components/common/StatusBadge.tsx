import { cn } from "@/lib/utils";

export type StatusVariant = "default" | "success" | "warning" | "danger";

const VARIANT_CLASSES: Record<StatusVariant, string> = {
  // TODO(Phase 12): map to brand tokens (lavender/warning/positive).
  default: "bg-muted text-muted-foreground",
  success: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
  warning:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100",
  danger: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
};

export function StatusBadge({
  variant = "default",
  children,
}: {
  variant?: StatusVariant;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        VARIANT_CLASSES[variant],
      )}
    >
      {children}
    </span>
  );
}

// Shared mapping so occupancy renders identically everywhere.
export function occupancyVariant(
  status: "occupied" | "vacant" | "unknown",
): StatusVariant {
  switch (status) {
    case "occupied":
      return "success";
    case "vacant":
      return "warning";
    case "unknown":
      return "default";
  }
}
