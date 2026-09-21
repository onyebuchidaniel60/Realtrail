import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StatusChangeDialog } from "./StatusChangeDialog";
import type { CaseStatus } from "../../../../convex/cases/stateMachine";

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

const RECORD = {
  _id: "c1",
  caseNumber: 7,
  status: "IN_PROGRESS",
} as never;

const ALLOWED_TO: CaseStatus[] = ["VENDOR_CONTACTED"];

beforeEach(() => {
  mockMutate.mockReset();
  mockToast.success.mockReset();
  mockToast.error.mockReset();
  mockMutate.mockResolvedValue({});
});

describe("StatusChangeDialog", () => {
  it("lists only allowedActions.canTransitionTo values", () => {
    render(
      <StatusChangeDialog
        open
        onClose={() => {}}
        record={RECORD}
        allowedTo={ALLOWED_TO}
      />,
    );
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Vendor Contacted");
  });

  it("never offers CLOSED or RESOLVED", () => {
    render(
      <StatusChangeDialog
        open
        onClose={() => {}}
        record={RECORD}
        allowedTo={["VENDOR_CONTACTED", "IN_PROGRESS"]}
      />,
    );
    const labels = screen
      .getAllByRole("option")
      .map((o) => o.textContent ?? "");
    expect(labels).not.toContain("Closed");
    expect(labels).not.toContain("Resolved");
  });

  it("submits cases.transitionStatus with the chosen status", async () => {
    const user = userEvent.setup();
    let captured: unknown = null;
    mockMutate.mockImplementation(async (args: unknown) => {
      captured = args;
      return { caseId: "c1", status: "VENDOR_CONTACTED" };
    });
    render(
      <StatusChangeDialog
        open
        onClose={() => {}}
        record={RECORD}
        allowedTo={ALLOWED_TO}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Change status" }));
    await waitFor(() => {
      expect(captured).toMatchObject({
        caseId: "c1",
        nextStatus: "VENDOR_CONTACTED",
      });
    });
  });
});
