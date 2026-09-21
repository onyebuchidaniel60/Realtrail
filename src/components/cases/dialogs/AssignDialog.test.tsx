import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssignDialog } from "./AssignDialog";

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
    useQuery: () => undefined,
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
  caseNumber: 7,
  status: "IN_PROGRESS",
  assigneeId: undefined,
} as never;

beforeEach(() => {
  mockMutate.mockReset();
  mockToast.success.mockReset();
  mockToast.error.mockReset();
  mockMutate.mockResolvedValue({});
});

describe("AssignDialog", () => {
  it("renders unassigned by default", () => {
    render(<AssignDialog open onClose={() => {}} record={RECORD} />);
    expect(screen.getByLabelText("Assignee")).toHaveValue("unassigned");
  });

  it("submits cases.assign with the current user for Me", async () => {
    const user = userEvent.setup();
    let captured: unknown = null;
    mockMutate.mockImplementation(async (args: unknown) => {
      captured = args;
      return { caseId: "c1" };
    });
    render(<AssignDialog open onClose={() => {}} record={RECORD} />);
    await user.selectOptions(screen.getByLabelText("Assignee"), "me");
    await user.click(
      screen.getByRole("button", { name: "Save assignment" }),
    );
    await waitFor(() => {
      expect(captured).toMatchObject({ caseId: "c1", assigneeId: "u1" });
    });
    expect(mockToast.success).toHaveBeenCalledWith("Assignee updated");
  });

  it("submits cases.assign with null for Unassigned", async () => {
    const user = userEvent.setup();
    let captured: unknown = null;
    mockMutate.mockImplementation(async (args: unknown) => {
      captured = args;
      return { caseId: "c1" };
    });
    render(<AssignDialog open onClose={() => {}} record={RECORD} />);
    await user.click(
      screen.getByRole("button", { name: "Save assignment" }),
    );
    await waitFor(() => {
      expect(captured).toMatchObject({ caseId: "c1", assigneeId: null });
    });
  });
});
