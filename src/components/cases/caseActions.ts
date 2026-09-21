import type { Doc } from "../../../convex/_generated/dataModel";
import type { CaseStatus } from "../../../convex/cases/stateMachine";

export interface AllowedActions {
  canTransitionTo: CaseStatus[];
  canClose: {
    resolved: boolean;
    duplicate: boolean;
    invalid: boolean;
    cancelled: boolean;
  };
  canReopen: boolean;
  canAssign: boolean;
  canEdit: boolean;
}

export type PanelAction =
  | { kind: "transition"; to: CaseStatus }
  | { kind: "note" }
  | { kind: "edit" }
  | { kind: "assign" }
  | { kind: "status" }
  | { kind: "close" }
  | { kind: "reopen" };

export interface PrimaryAction {
  label: string;
  action: PanelAction | null;
  disabled: boolean;
}

export function getPrimaryAction(
  record: Doc<"cases">,
  allowed: AllowedActions,
): PrimaryAction {
  const offered = (to: CaseStatus): boolean =>
    allowed.canTransitionTo.includes(to);
  switch (record.status) {
    case "NEW":
      // TODO(Phase 6): replace fallback with "Review triage" review action.
      return {
        label: "Change status",
        action: { kind: "status" },
        disabled: allowed.canTransitionTo.length === 0,
      };
    case "TRIAGED":
      return {
        label: "Start work",
        action: { kind: "transition", to: "IN_PROGRESS" },
        disabled: !offered("IN_PROGRESS"),
      };
    case "IN_PROGRESS":
      return {
        label: "Contact vendor",
        action: { kind: "transition", to: "VENDOR_CONTACTED" },
        disabled: !offered("VENDOR_CONTACTED"),
      };
    case "VENDOR_CONTACTED":
      return {
        label: "Schedule",
        action: { kind: "transition", to: "SCHEDULED" },
        disabled: !offered("SCHEDULED"),
      };
    case "SCHEDULED":
      return {
        label: "Mark work in progress",
        action: { kind: "transition", to: "WORK_IN_PROGRESS" },
        disabled: !offered("WORK_IN_PROGRESS"),
      };
    case "WORK_IN_PROGRESS":
      // TODO(Phase 9): replace fallback with "Request confirmation" action.
      return {
        label: "Change status",
        action: { kind: "status" },
        disabled: allowed.canTransitionTo.length === 0,
      };
    case "AWAITING_CONFIRMATION":
      return { label: "Waiting on resident", action: null, disabled: true };
    case "RESOLVED":
      return {
        label: "Close case",
        action: { kind: "close" },
        disabled: !allowed.canClose.resolved,
      };
    case "CLOSED":
      return {
        label: "Reopen",
        action: { kind: "reopen" },
        disabled: !allowed.canReopen,
      };
  }
}
