import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditCaseDialog } from "./EditCaseDialog";

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
    useQuery: () => [],
    useMutation: () => mockMutate,
  };
});

vi.mock("@/components/common/toast", () => ({ toast: mockToast }));

vi.mock("@/hooks/useSyncUser", () => ({
  useSyncStatus: () => ({ synced: true, userId: "u1" }),
  SyncProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const RECORD = {
  _id: "c1",
  _creationTime: 1,
  workspaceId: "w1",
  caseNumber: 7,
  title: "Low water pressure",
  description: "Pressure dropped.",
  status: "IN_PROGRESS",
  priority: "HIGH",
  category: "water",
  propertyId: undefined,
  buildingId: undefined,
  unitId: undefined,
  reporterName: undefined,
  reporterEmail: undefined,
  assigneeId: undefined,
  aiTriageStatus: "not_started",
  lastActivityAt: 2000,
  reopenCount: 0,
  locationUnknown: true,
  createdBy: "u1",
  createdAt: 1000,
  updatedAt: 2000,
} as never;

beforeEach(() => {
  mockMutate.mockReset();
  mockToast.success.mockReset();
  mockToast.error.mockReset();
  mockMutate.mockResolvedValue({});
});

describe("EditCaseDialog", () => {
  it("renders with pre-filled values", () => {
    render(<EditCaseDialog open onClose={() => {}} record={RECORD} />);
    expect(screen.getByDisplayValue("Low water pressure")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Pressure dropped.")).toBeInTheDocument();
  });

  it("submits cases.updateFields with expected args", async () => {
    const user = userEvent.setup();
    let captured: unknown = null;
    mockMutate.mockImplementation(async (args: unknown) => {
      captured = args;
      return { caseId: "c1" };
    });
    render(<EditCaseDialog open onClose={() => {}} record={RECORD} />);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => {
      expect(captured).toMatchObject({
        caseId: "c1",
        title: "Low water pressure",
        description: "Pressure dropped.",
        category: "water",
        priority: "HIGH",
      });
    });
  });

  it("renders field-level errors inline", async () => {
    const user = userEvent.setup();
    mockMutate.mockRejectedValueOnce({
      data: { code: "VALIDATION_ERROR", field: "title" },
    });
    render(<EditCaseDialog open onClose={() => {}} record={RECORD} />);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => {
      expect(
        screen.getByText("This value was rejected. Check and retry."),
      ).toBeInTheDocument();
    });
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it("disables submit while in flight", async () => {
    const user = userEvent.setup();
    mockMutate.mockReturnValueOnce(new Promise(() => {}));
    render(<EditCaseDialog open onClose={() => {}} record={RECORD} />);
    const submit = screen.getByRole("button", { name: "Save changes" });
    await user.click(submit);
    expect(submit).toBeDisabled();
  });
});
