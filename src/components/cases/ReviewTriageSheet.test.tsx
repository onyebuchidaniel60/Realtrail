import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewTriageSheet } from "./ReviewTriageSheet";

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockMutate = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>();
  return {
    ...mod,
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
    useMutation: () => mockMutate,
  };
});

vi.mock("@/components/common/toast", () => ({ toast: mockToast }));

const PROP_A = { _id: "p1", name: "Palm Grove" };
const PROP_B = { _id: "p2", name: "Cedar Court" };
const BUILDING = { _id: "b1", name: "Block A" };
const UNIT = { _id: "u9", label: "A1" };

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    _id: "c1",
    _creationTime: 1,
    workspaceId: "w1",
    caseNumber: 7,
    title: "Low water pressure",
    description: "Pressure dropped yesterday.",
    status: "NEW",
    priority: "MEDIUM",
    category: "water",
    propertyId: "p1",
    buildingId: undefined,
    unitId: undefined,
    aiTriageStatus: "completed",
    aiTriageOutput: {
      title: "AI guessed title",
      summary: "AI guessed summary",
      category: "water",
      prioritySuggestion: "HIGH",
      propertyCandidateId: "p1",
      buildingCandidateId: null,
      unitCandidateId: null,
      missingInformation: ["Which floor is affected?"],
      suggestedNextAction: "Send the plumber.",
      possibleRelatedCaseIds: ["c9"],
      needsReview: true,
    },
    nextActionLabel: "Send the plumber.",
    lastActivityAt: 2000,
    reopenCount: 0,
    locationUnknown: false,
    createdBy: "u1",
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  } as never;
}

beforeEach(() => {
  mockUseQuery.mockReset();
  mockMutate.mockReset();
  mockToast.success.mockReset();
  mockToast.error.mockReset();
  mockMutate.mockResolvedValue({ caseId: "c1", status: "TRIAGED" });
  mockUseQuery.mockImplementation((_fn: unknown, args: unknown) => {
    if (args === "skip") {
      return undefined;
    }
    if (typeof args === "object" && args !== null) {
      if ("buildingId" in args) {
        return [UNIT];
      }
      if ("propertyId" in args) {
        return [BUILDING];
      }
    }
    return [PROP_A, PROP_B];
  });
});

function renderSheet(record?: Record<string, unknown>) {
  return render(
    <MemoryRouter>
      <ReviewTriageSheet
        record={makeRecord(record)}
        open
        onClose={() => {}}
      />
    </MemoryRouter>,
  );
}

describe("ReviewTriageSheet", () => {
  it("prefills inputs with the current case values", () => {
    renderSheet();
    expect(screen.getByLabelText("Title")).toHaveValue("Low water pressure");
    expect(screen.getByLabelText("Summary")).toHaveValue(
      "Pressure dropped yesterday.",
    );
    expect(screen.getByLabelText("Category")).toHaveValue("water");
    expect(screen.getByLabelText("Priority")).toHaveValue("MEDIUM");
    expect(screen.getByLabelText("Property")).toHaveValue("p1");
    expect(screen.getByLabelText("Next action")).toHaveValue(
      "Send the plumber.",
    );
  });

  it("shows AI-suggested hints where values differ", () => {
    renderSheet();
    // Title/summary/priority differ from the AI suggestion; category and
    // property match, so no hint renders for those.
    expect(screen.getByText(/AI guessed title/)).toBeInTheDocument();
    expect(screen.getByText(/AI guessed summary/)).toBeInTheDocument();
    expect(screen.getByText("HIGH")).toBeInTheDocument();
    expect(screen.getAllByText(/AI suggested:/)).toHaveLength(3);
  });

  it("editing a field updates the submitted value", async () => {
    const user = userEvent.setup();
    let captured: unknown = null;
    mockMutate.mockImplementation(async (args: unknown) => {
      captured = args;
      return { caseId: "c1", status: "TRIAGED" };
    });
    renderSheet();
    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Confirmed burst main");
    await user.click(screen.getByRole("button", { name: "Accept triage" }));
    await waitFor(() => {
      expect(captured).toMatchObject({ title: "Confirmed burst main" });
    });
  });

  it("cancel closes without calling the mutation", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <ReviewTriageSheet
          record={makeRecord()}
          open
          onClose={onClose}
        />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("accept calls acceptAiTriage with all current values", async () => {
    const user = userEvent.setup();
    let captured: unknown = null;
    mockMutate.mockImplementation(async (args: unknown) => {
      captured = args;
      return { caseId: "c1", status: "TRIAGED" };
    });
    renderSheet();
    await user.click(screen.getByRole("button", { name: "Accept triage" }));
    await waitFor(() => {
      expect(captured).toEqual({
        caseId: "c1",
        title: "Low water pressure",
        summary: "Pressure dropped yesterday.",
        category: "water",
        priority: "MEDIUM",
        propertyId: "p1",
        buildingId: null,
        unitId: null,
        nextActionType: null,
        nextActionLabel: "Send the plumber.",
        locationUnknown: false,
      });
    });
    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith("Triage accepted");
    });
  });

  it("renders field-level errors inline on VALIDATION_ERROR", async () => {
    const user = userEvent.setup();
    mockMutate.mockRejectedValueOnce({
      data: { code: "VALIDATION_ERROR", field: "title", message: "Too short." },
    });
    renderSheet();
    await user.click(screen.getByRole("button", { name: "Accept triage" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Too short.");
    });
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it("renders the missing-information list when present", () => {
    renderSheet();
    // <details> content is in the DOM regardless of open state.
    expect(
      screen.getByText("Which floor is affected?"),
    ).toBeInTheDocument();
  });

  it("renders related case links when present", () => {
    renderSheet();
    const link = screen.getByRole("link", { name: "Open related case" });
    expect(link).toHaveAttribute("href", "/cases?caseId=c9");
  });
});
