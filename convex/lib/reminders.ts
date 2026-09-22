// Pure reminder helpers (Phase 10).
//
// No I/O, no timestamps taken, no randomness. Time flows in through
// arguments so every function is deterministic and trivially testable.
// Reminder cadence comes from deployment env with safe fallbacks — read
// fresh on every call (Convex functions are stateless; never cache).

const MS_PER_HOUR = 3600 * 1000;

const FALLBACK_VENDOR_FOLLOWUP_HOURS = 4;
const FALLBACK_RESIDENT_REMINDER_HOURS = 24;
const FALLBACK_ESCALATION_HOURS = 72;

function hoursEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined ? NaN : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export type ReminderDelays = {
  vendorFollowupMs: number;
  residentReminderMs: number;
  escalationMs: number;
};

export function reminderDelays(): ReminderDelays {
  return {
    vendorFollowupMs:
      hoursEnv(
        "REALTRAIL_VENDOR_FOLLOWUP_HOURS",
        FALLBACK_VENDOR_FOLLOWUP_HOURS,
      ) * MS_PER_HOUR,
    residentReminderMs:
      hoursEnv(
        "REALTRAIL_RESIDENT_REMINDER_HOURS",
        FALLBACK_RESIDENT_REMINDER_HOURS,
      ) * MS_PER_HOUR,
    escalationMs:
      hoursEnv("REALTRAIL_ESCALATION_HOURS", FALLBACK_ESCALATION_HOURS) *
      MS_PER_HOUR,
  };
}

export type ReminderType =
  | "vendor_followup"
  | "resident_confirmation"
  | "urgent_case"
  | "system_error";

// Stable idempotency key: same logical event, same key, every run.
// No timestamps, no randomness — safe to recompute in retries.
export function buildDedupeKey(
  caseId: string,
  type: string,
  cycle: number,
): string {
  return `${caseId}:${type}:${cycle}`;
}

export function buildReminderNotification(args: {
  caseNumber: number;
  caseTitle: string;
  type: ReminderType;
  cycle: number;
}): { title: string; body: string } {
  const ref = `Case #${args.caseNumber} — ${args.caseTitle}`;
  switch (args.type) {
    case "vendor_followup":
      return {
        title: `Vendor follow-up due on ${ref}`,
        body: `No vendor reply has arrived. Decide whether and how to nudge the vendor.`,
      };
    case "resident_confirmation":
      return {
        title: `Resident confirmation reminder #${args.cycle} on ${ref}`,
        body: `The resident has not confirmed yet. Use Resend confirmation to issue a fresh link.`,
      };
    case "urgent_case":
      return {
        title: `Escalation: no resident confirmation on ${ref}`,
        body: `Three reminders passed without confirmation. Manager attention required.`,
      };
    case "system_error":
      return {
        title: `Attention needed on ${ref}`,
        body: `An automated check flagged this case for review.`,
      };
  }
}

// True when an outbound vendor message has been waiting at least
// thresholdMs with no inbound reply since.
export function isVendorFollowupDue(
  lastOutboundAt: number | undefined,
  lastInboundAt: number | undefined,
  now: number,
  thresholdMs: number,
): boolean {
  if (lastOutboundAt === undefined) {
    return false;
  }
  if (lastInboundAt !== undefined && lastInboundAt >= lastOutboundAt) {
    return false;
  }
  return now - lastOutboundAt >= thresholdMs;
}

// Cycle 1 fires at +1×threshold, cycle 2 at +2×threshold, measured from
// the confirmation request time. Cycle 3 (escalation) is evaluated by
// the caller against the escalation threshold, not here.
export function isResidentReminderDue(
  confirmRequestedAt: number | undefined,
  now: number,
  cycle: number,
  thresholdMs: number,
): boolean {
  if (confirmRequestedAt === undefined) {
    return false;
  }
  if (cycle !== 1 && cycle !== 2) {
    return false;
  }
  return now - confirmRequestedAt >= cycle * thresholdMs;
}
