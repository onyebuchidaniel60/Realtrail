import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { CaseTable } from "./CaseTable";

// Phase 12 a11y coverage: table rows are the only way to open a case from
// the desktop/tablet list, so they must be keyboard reachable, and status
// and priority must always render text (never colour alone).
function makeCase(overrides: Record<string, unknown> = {}) {
  return {
    _id: "cases_1",
    _creationTime: 0,
    workspaceId: "ws_1",
    caseNumber: 1042,
    title: "Lobby leak",
    description: "Water through the ceiling",
    status: "IN_PROGRESS",
    priority: "HIGH",
    category: "plumbing",
    locationUnknown: false,
    aiTriageStatus: "completed",
    reopenCount: 0,
    createdBy: "users_1",
    createdAt: 0,
    updatedAt: 0,
    lastActivityAt: 0,
    ...overrides,
  } as unknown as Doc<"cases">;
}

const PROPERTY_NAMES = new Map<string, string>([["properties_1", "Lekki Phase 1"]]);

function renderTable(options: {
  cases?: Doc<"cases">[];
  selectedId?: Id<"cases"> | null;
  onSelect?: (caseId: Id<"cases">) => void;
}) {
  const cases = options.cases ?? [makeCase()];
  return render(
    <CaseTable
      cases={cases}
      propertyNames={PROPERTY_NAMES}
      selectedId={options.selectedId ?? null}
      onSelect={options.onSelect ?? (() => {})}
    />,
  );
}

function firstRow() {
  // Row 0 is the header row; the first data row follows it.
  const rows = screen.getAllByRole("row");
  return rows[1];
}

describe("CaseTable accessibility", () => {
  it("renders status and priority as text alongside colour", () => {
    renderTable({});
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("HIGH")).toBeInTheDocument();
  });

  it("makes the case row keyboard focusable", () => {
    renderTable({});
    expect(firstRow().getAttribute("tabindex")).toBe("0");
  });

  it("opens the case when the focused row receives Enter", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderTable({ onSelect });
    firstRow().focus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith("cases_1");
  });

  it("opens the case when the focused row receives Space", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderTable({ onSelect });
    firstRow().focus();
    await user.keyboard(" ");
    expect(onSelect).toHaveBeenCalledWith("cases_1");
  });

  it("marks the selected row with aria-current", () => {
    const record = makeCase();
    renderTable({ selectedId: record._id, cases: [record] });
    expect(firstRow().getAttribute("aria-current")).toBe("true");
  });
});
