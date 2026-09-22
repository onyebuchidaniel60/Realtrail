import { afterEach, describe, expect, test } from "vitest";
import {
  buildDedupeKey,
  buildReminderNotification,
  isResidentReminderDue,
  isVendorFollowupDue,
  reminderDelays,
} from "./reminders";

const HOUR = 3600 * 1000;

afterEach(() => {
  delete process.env.REALTRAIL_VENDOR_FOLLOWUP_HOURS;
  delete process.env.REALTRAIL_RESIDENT_REMINDER_HOURS;
  delete process.env.REALTRAIL_ESCALATION_HOURS;
});

describe("reminderDelays", () => {
  test("returns env values when set", () => {
    process.env.REALTRAIL_VENDOR_FOLLOWUP_HOURS = "2";
    process.env.REALTRAIL_RESIDENT_REMINDER_HOURS = "12";
    process.env.REALTRAIL_ESCALATION_HOURS = "48";
    expect(reminderDelays()).toEqual({
      vendorFollowupMs: 2 * HOUR,
      residentReminderMs: 12 * HOUR,
      escalationMs: 48 * HOUR,
    });
  });

  test("falls back to 4/24/72 when unset or invalid", () => {
    expect(reminderDelays()).toEqual({
      vendorFollowupMs: 4 * HOUR,
      residentReminderMs: 24 * HOUR,
      escalationMs: 72 * HOUR,
    });
    process.env.REALTRAIL_VENDOR_FOLLOWUP_HOURS = "bogus";
    process.env.REALTRAIL_RESIDENT_REMINDER_HOURS = "0";
    process.env.REALTRAIL_ESCALATION_HOURS = "-5";
    expect(reminderDelays()).toEqual({
      vendorFollowupMs: 4 * HOUR,
      residentReminderMs: 24 * HOUR,
      escalationMs: 72 * HOUR,
    });
  });
});

describe("buildDedupeKey", () => {
  test("is deterministic", () => {
    expect(buildDedupeKey("c1", "vendor_followup", 1)).toBe(
      buildDedupeKey("c1", "vendor_followup", 1),
    );
    expect(buildDedupeKey("c1", "vendor_followup", 1)).toBe(
      "c1:vendor_followup:1",
    );
  });

  test("differs across type and cycle", () => {
    const base = buildDedupeKey("c1", "vendor_followup", 1);
    expect(buildDedupeKey("c1", "resident_confirmation", 1)).not.toBe(base);
    expect(buildDedupeKey("c1", "vendor_followup", 2)).not.toBe(base);
    expect(buildDedupeKey("c2", "vendor_followup", 1)).not.toBe(base);
  });
});

describe("isVendorFollowupDue", () => {
  test("false before the threshold", () => {
    expect(isVendorFollowupDue(1000, undefined, 1000 + 4 * HOUR - 1, 4 * HOUR)).toBe(
      false,
    );
  });

  test("true at threshold with no inbound since", () => {
    expect(isVendorFollowupDue(1000, undefined, 1000 + 4 * HOUR, 4 * HOUR)).toBe(
      true,
    );
    expect(isVendorFollowupDue(1000, 500, 1000 + 9 * HOUR, 4 * HOUR)).toBe(
      true,
    );
  });

  test("false when inbound is newer than outbound", () => {
    expect(isVendorFollowupDue(1000, 2000, 1000 + 9 * HOUR, 4 * HOUR)).toBe(
      false,
    );
  });

  test("false when nothing was ever sent", () => {
    expect(isVendorFollowupDue(undefined, 2000, 9000, 1000)).toBe(false);
    expect(isVendorFollowupDue(undefined, undefined, 9000, 1000)).toBe(false);
  });
});

describe("isResidentReminderDue", () => {
  test("cycle 1 at +1x, cycle 2 at +2x, not before", () => {
    const requestedAt = 1000;
    expect(isResidentReminderDue(requestedAt, requestedAt + 24 * HOUR - 1, 1, 24 * HOUR)).toBe(
      false,
    );
    expect(isResidentReminderDue(requestedAt, requestedAt + 24 * HOUR, 1, 24 * HOUR)).toBe(
      true,
    );
    expect(isResidentReminderDue(requestedAt, requestedAt + 24 * HOUR, 2, 24 * HOUR)).toBe(
      false,
    );
    expect(isResidentReminderDue(requestedAt, requestedAt + 48 * HOUR, 2, 24 * HOUR)).toBe(
      true,
    );
    expect(isResidentReminderDue(undefined, requestedAt + 99 * HOUR, 1, 24 * HOUR)).toBe(
      false,
    );
  });
});

describe("buildReminderNotification", () => {
  test("format is stable across calls", () => {
    const args = {
      caseNumber: 7,
      caseTitle: "Leaking pipe",
      type: "resident_confirmation" as const,
      cycle: 1,
    };
    expect(buildReminderNotification(args)).toEqual(
      buildReminderNotification(args),
    );
    const built = buildReminderNotification(args);
    expect(built.title).toContain("Case #7");
    expect(built.body.length).toBeGreaterThan(0);
  });
});
