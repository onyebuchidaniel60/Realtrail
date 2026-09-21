import type { StatusVariant } from "@/components/common/StatusBadge";
import type { CaseStatus } from "../../../convex/cases/stateMachine";

const STATUS_VARIANTS: Record<CaseStatus, StatusVariant> = {
  // TODO(Phase 12): map to brand tokens (lavender flow, lime resolved).
  NEW: "default",
  TRIAGED: "default",
  IN_PROGRESS: "default",
  VENDOR_CONTACTED: "default",
  SCHEDULED: "default",
  WORK_IN_PROGRESS: "default",
  AWAITING_CONFIRMATION: "warning",
  RESOLVED: "success",
  CLOSED: "default",
};

export function caseStatusVariant(status: CaseStatus): StatusVariant {
  return STATUS_VARIANTS[status];
}

export function formatStatus(status: CaseStatus): string {
  return status
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const diffMs = now - timestamp;
  if (diffMs < 0) {
    return "just now";
  }
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  if (hours < 48) {
    return "yesterday";
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }
  return new Date(timestamp).toLocaleDateString();
}
