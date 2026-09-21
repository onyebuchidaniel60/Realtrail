import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaseActionPanel } from "./CaseActionPanel";
import type { AllowedActions } from "./caseActions";
import type { CaseStatus } from "../../../convex/cases/stateMachine";

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    _id: "c1",
    _creationTime: 1,
    workspaceId: "w1",
    caseNumber: 7,
    title: "Low water pressure",
    description: "Pressure dropped.",
    status: "NEW",
    priority: "MEDIUM",
    category: "water",
    aiTriageStatus: "not_started",
    lastActivityAt: 2000,
    reopenCount: 0,
    locationUnknown: true,
    createdBy: "u1",
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  } as never;
}

function makeAllowed(overrides: Partial<AllowedActions> = {}): AllowedActions {
  return {
    canTransitionTo: [],
    canClose: {
      resolved: false,
      duplicate: false,
      invalid: false,
      cancelled: false,
    },
    canReopen: false,
    canAssign: true,
    canEdit: true,
    ...overrides,
  };
}

describe("CaseActionPanel", () => {
  it("renders the Next Action card", () => {
    render(
      <CaseActionPanel
        record={makeRecord({ status: "TRIAGED" })}
        allowed={makeAllowed({ canTransitionTo: ["IN_PROGRESS"] })}
        onAction={() => {}}
      />,
    );
    expect(screen.getByText("What happens next?")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start work" }),
    ).toBeInTheDocument();
  });

  it.each([
    ["TRIAGED", "Start work"],
    ["IN_PROGRESS", "Contact vendor"],
    ["VENDOR_CONTACTED", "Schedule"],
    ["SCHEDULED", "Mark work in progress"],
    ["RESOLVED", "Close case"],
    ["CLOSED", "Reopen"],
  ] as Array<[CaseStatus, string]>)(
    "shows primary action %s for status %s",
    (status, label) => {
      render(
        <CaseActionPanel
          record={makeRecord({ status })}
          allowed={makeAllowed({
            canTransitionTo: ["IN_PROGRESS"],
            canClose: {
              resolved: true,
              duplicate: true,
              invalid: true,
              cancelled: true,
            },
            canReopen: true,
          })}
          onAction={() => {}}
        />,
      );
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    },
  );

  it("shows only Reopen for a CLOSED case", () => {
    render(
      <CaseActionPanel
        record={makeRecord({ status: "CLOSED" })}
        allowed={makeAllowed({ canReopen: true })}
        onAction={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Reopen" })).toBeInTheDocument();
    expect(screen.queryByText("Add note")).not.toBeInTheDocument();
    expect(screen.queryByText("Edit details")).not.toBeInTheDocument();
  });

  it("disables Close when no closure reason is allowed (staff)", () => {
    render(
      <CaseActionPanel
        record={makeRecord({ status: "RESOLVED" })}
        allowed={makeAllowed()}
        onAction={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Close case" })).toBeDisabled();
  });

  it("reflects an empty transition list by disabling Change status", () => {
    const onAction = vi.fn();
    render(
      <CaseActionPanel
        record={makeRecord({ status: "NEW" })}
        allowed={makeAllowed({ canTransitionTo: [] })}
        onAction={onAction}
      />,
    );
    expect(screen.getByRole("button", { name: "Change status" })).toBeDisabled();
  });
});
