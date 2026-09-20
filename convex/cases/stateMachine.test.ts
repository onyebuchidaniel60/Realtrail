import { describe, expect, test } from "vitest";
import {
  canClose,
  canReopen,
  canTransition,
  type CaseStatus,
  type Role,
} from "./stateMachine";

const OPERATIONAL_CASES: Array<[CaseStatus, CaseStatus]> = [
  ["NEW", "TRIAGED"],
  ["TRIAGED", "IN_PROGRESS"],
  ["IN_PROGRESS", "VENDOR_CONTACTED"],
  ["VENDOR_CONTACTED", "SCHEDULED"],
  ["VENDOR_CONTACTED", "IN_PROGRESS"],
  ["SCHEDULED", "WORK_IN_PROGRESS"],
  ["SCHEDULED", "IN_PROGRESS"],
  ["WORK_IN_PROGRESS", "AWAITING_CONFIRMATION"],
  ["AWAITING_CONFIRMATION", "WORK_IN_PROGRESS"],
  ["AWAITING_CONFIRMATION", "RESOLVED"],
];

const ALL_ROLES: Role[] = ["owner", "manager", "staff"];

describe("canTransition", () => {
  test.each(OPERATIONAL_CASES)("allows %s -> %s for operational roles", (from, to) => {
    for (const role of ALL_ROLES) {
      if (from === "AWAITING_CONFIRMATION" && to === "RESOLVED" && role === "staff") {
        continue;
      }
      expect(canTransition(from, to, role)).toEqual({ ok: true });
    }
  });

  test("staff cannot confirm resolution (AWAITING_CONFIRMATION -> RESOLVED)", () => {
    expect(canTransition("AWAITING_CONFIRMATION", "RESOLVED", "staff")).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
  });

  test.each([
    ["NEW", "IN_PROGRESS"],
    ["NEW", "CLOSED"],
    ["NEW", "RESOLVED"],
    ["TRIAGED", "TRIAGED"],
    ["IN_PROGRESS", "TRIAGED"],
    ["IN_PROGRESS", "RESOLVED"],
    ["VENDOR_CONTACTED", "RESOLVED"],
    ["SCHEDULED", "TRIAGED"],
    ["WORK_IN_PROGRESS", "IN_PROGRESS"],
    ["RESOLVED", "CLOSED"],
    ["RESOLVED", "IN_PROGRESS"],
    ["CLOSED", "IN_PROGRESS"],
  ] as Array<[CaseStatus, CaseStatus]>)(
    "rejects %s -> %s with INVALID_TRANSITION",
    (from, to) => {
      for (const role of ALL_ROLES) {
        expect(canTransition(from, to, role)).toMatchObject({
          ok: false,
          code: "INVALID_TRANSITION",
        });
      }
    },
  );

  test("rejects the AI role for every transition", () => {
    for (const [from, to] of OPERATIONAL_CASES) {
      const result = canTransition(from, to, "ai");
      expect(result.ok).toEqual(false);
      if (!result.ok) {
        expect(result.code).toEqual("FORBIDDEN");
      }
    }
  });
});

describe("canClose", () => {
  test("owner and manager can close RESOLVED as resolved", () => {
    expect(canClose("RESOLVED", "resolved", "owner")).toEqual({ ok: true });
    expect(canClose("RESOLVED", "resolved", "manager")).toEqual({ ok: true });
  });

  test("staff cannot close as resolved", () => {
    expect(canClose("RESOLVED", "resolved", "staff")).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
  });

  test("staff cannot close with non-resolution reasons", () => {
    for (const reason of ["duplicate", "invalid", "cancelled"] as const) {
      expect(canClose("NEW", reason, "staff")).toMatchObject({
        ok: false,
        code: "FORBIDDEN",
      });
    }
  });

  test("owner can close operational states with non-resolution reasons", () => {
    const states: CaseStatus[] = [
      "NEW",
      "TRIAGED",
      "IN_PROGRESS",
      "VENDOR_CONTACTED",
      "SCHEDULED",
      "WORK_IN_PROGRESS",
    ];
    for (const from of states) {
      for (const reason of ["duplicate", "invalid", "cancelled"] as const) {
        expect(canClose(from, reason, "owner")).toEqual({ ok: true });
      }
    }
  });

  test("resolved closure only from RESOLVED", () => {
    expect(canClose("NEW", "resolved", "owner")).toMatchObject({
      ok: false,
      code: "INVALID_TRANSITION",
    });
    expect(canClose("WORK_IN_PROGRESS", "resolved", "manager")).toMatchObject({
      ok: false,
      code: "INVALID_TRANSITION",
    });
  });

  test("non-resolution closure from CLOSED or RESOLVED is rejected", () => {
    expect(canClose("CLOSED", "duplicate", "owner")).toMatchObject({
      ok: false,
      code: "INVALID_TRANSITION",
    });
    expect(canClose("RESOLVED", "invalid", "owner")).toMatchObject({
      ok: false,
      code: "INVALID_TRANSITION",
    });
  });

  test("rejects the AI role for every closure", () => {
    expect(canClose("RESOLVED", "resolved", "ai")).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(canClose("NEW", "duplicate", "ai")).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
  });
});

describe("canReopen", () => {
  test("owner, manager, and staff can reopen CLOSED", () => {
    for (const role of ALL_ROLES) {
      expect(canReopen("CLOSED", role)).toEqual({ ok: true });
    }
  });

  test("reopen from non-CLOSED states is rejected", () => {
    const states: CaseStatus[] = [
      "NEW",
      "TRIAGED",
      "IN_PROGRESS",
      "RESOLVED",
      "AWAITING_CONFIRMATION",
    ];
    for (const from of states) {
      expect(canReopen(from, "owner")).toMatchObject({
        ok: false,
        code: "INVALID_TRANSITION",
      });
    }
  });

  test("rejects the AI role", () => {
    expect(canReopen("CLOSED", "ai")).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
  });
});
