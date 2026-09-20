import type { AppErrorData } from "../lib/errors";

export type CaseStatus =
  | "NEW"
  | "TRIAGED"
  | "IN_PROGRESS"
  | "VENDOR_CONTACTED"
  | "SCHEDULED"
  | "WORK_IN_PROGRESS"
  | "AWAITING_CONFIRMATION"
  | "RESOLVED"
  | "CLOSED";

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type Category =
  | "plumbing"
  | "electrical"
  | "power_generator"
  | "water"
  | "hvac"
  | "security_access"
  | "cleaning"
  | "structural"
  | "appliance"
  | "common_area"
  | "other";

export type Role = "owner" | "manager" | "staff";

export type ClosureReason = "resolved" | "duplicate" | "invalid" | "cancelled";

type CheckResult = { ok: true } | ({ ok: false } & AppErrorData);

const OPERATIONAL_ROLES: Role[] = ["owner", "manager", "staff"];
const CLOSURE_ROLES: Role[] = ["owner", "manager"];

// Operational transitions via cases.transitionStatus, each with the roles
// permitted to perform it. AWAITING_CONFIRMATION -> RESOLVED excludes
// staff: only owner/manager (or resident "yes" via the confirmation flow
// in Phase 9) may confirm resolution.
const OPERATIONAL_TRANSITIONS: Record<string, Role[]> = {
  "NEW>TRIAGED": ["owner", "manager", "staff"],
  "TRIAGED>IN_PROGRESS": ["owner", "manager", "staff"],
  "IN_PROGRESS>VENDOR_CONTACTED": ["owner", "manager", "staff"],
  "VENDOR_CONTACTED>SCHEDULED": ["owner", "manager", "staff"],
  "VENDOR_CONTACTED>IN_PROGRESS": ["owner", "manager", "staff"],
  "SCHEDULED>WORK_IN_PROGRESS": ["owner", "manager", "staff"],
  "SCHEDULED>IN_PROGRESS": ["owner", "manager", "staff"],
  "WORK_IN_PROGRESS>AWAITING_CONFIRMATION": ["owner", "manager", "staff"],
  "AWAITING_CONFIRMATION>WORK_IN_PROGRESS": ["owner", "manager", "staff"],
  "AWAITING_CONFIRMATION>RESOLVED": ["owner", "manager"],
};

const NON_RESOLUTION_CLOSURE_FROM: CaseStatus[] = [
  "NEW",
  "TRIAGED",
  "IN_PROGRESS",
  "VENDOR_CONTACTED",
  "SCHEDULED",
  "WORK_IN_PROGRESS",
];

const NON_RESOLUTION_REASONS: ClosureReason[] = [
  "duplicate",
  "invalid",
  "cancelled",
];

export function canTransition(
  from: CaseStatus,
  to: CaseStatus,
  role: string,
): CheckResult {
  const allowedRoles = OPERATIONAL_TRANSITIONS[`${from}>${to}`];
  if (allowedRoles === undefined) {
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      message: `Cannot move a case from ${from} to ${to}.`,
    };
  }
  if (!allowedRoles.includes(role as Role)) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: `Role ${role} cannot move a case from ${from} to ${to}.`,
    };
  }
  return { ok: true };
}

export function canClose(
  from: CaseStatus,
  reason: ClosureReason,
  role: string,
): CheckResult {
  if (!(CLOSURE_ROLES as string[]).includes(role)) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: `Role ${role} cannot close cases.`,
    };
  }
  if (reason === "resolved") {
    if (from !== "RESOLVED") {
      return {
        ok: false,
        code: "INVALID_TRANSITION",
        message: `Only a RESOLVED case can be closed as resolved (currently ${from}).`,
      };
    }
    return { ok: true };
  }
  if (!NON_RESOLUTION_REASONS.includes(reason)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: `Unknown closure reason ${reason}.`,
      field: "reason",
    };
  }
  if (!NON_RESOLUTION_CLOSURE_FROM.includes(from)) {
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      message: `Cannot close a case from ${from} as ${reason}.`,
    };
  }
  return { ok: true };
}

export function canReopen(from: CaseStatus, role: string): CheckResult {
  if (!(OPERATIONAL_ROLES as string[]).includes(role)) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: `Role ${role} cannot reopen cases.`,
    };
  }
  if (from !== "CLOSED") {
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      message: `Only a CLOSED case can be reopened (currently ${from}).`,
    };
  }
  return { ok: true };
}
