import { StatusBadge } from "@/components/common/StatusBadge";
import type { StatusVariant } from "@/components/common/StatusBadge";

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

const PRIORITY_VARIANTS: Record<Priority, StatusVariant> = {
  // Phase 12: URGENT → danger red, HIGH → warm yellow, rest neutral.
  URGENT: "danger",
  HIGH: "warning",
  MEDIUM: "default",
  LOW: "default",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <StatusBadge variant={PRIORITY_VARIANTS[priority]}>{priority}</StatusBadge>;
}
