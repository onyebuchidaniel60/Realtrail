import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CloseCaseDialog } from "./CloseCaseDialog";

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

const RECORD = { _id: "c1", caseNumber: 7, status: "RESOLVED" } as never;

const ALL_ALLOWED = {
  resolved: true,
  duplicate: true,
  invalid: true,
  cancelled: true,
};

beforeEach(() => {
  mockMutate.mockReset();
  mockToast.success.mockReset();
  mockToast.error.mockReset();
  mockMutate.mockResolvedValue({});
});

describe("CloseCaseDialog", () => {
  it("disables reason radios per allowedActions", () => {
    render(
      <CloseCaseDialog
        open
        onClose={() => {}}
        record={RECORD}
        allowed={{
          resolved: false,
          duplicate: true,
          invalid: false,
          cancelled: false,
        }}
      />,
    );
    expect(screen.getByLabelText(/Resolved/)).toBeDisabled();
    expect(screen.getByLabelText("Duplicate")).toBeEnabled();
    expect(screen.getByLabelText(/Invalid/)).toBeDisabled();
  });

  it("requires a note for non-resolved reasons", async () => {
    const user = userEvent.setup();
    render(
      <CloseCaseDialog
        open
        onClose={() => {}}
        record={RECORD}
        allowed={ALL_ALLOWED}
      />,
    );
    await user.click(screen.getByLabelText("Duplicate"));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByText("A note is required for this closure reason."),
    ).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("shows a confirmation step before final submit", async () => {
    const user = userEvent.setup();
    render(
      <CloseCaseDialog
        open
        onClose={() => {}}
        record={RECORD}
        allowed={ALL_ALLOWED}
      />,
    );
    await user.click(screen.getByLabelText("Duplicate"));
    await user.type(screen.getByLabelText(/Note/), "Same as case 3");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("button", { name: /Close case/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Closing ends active work/)).toBeInTheDocument();
  });

  it("final submit calls cases.close with reason and note", async () => {
    const user = userEvent.setup();
    let captured: unknown = null;
    mockMutate.mockImplementation(async (args: unknown) => {
      captured = args;
      return { caseId: "c1", status: "CLOSED" };
    });
    render(
      <CloseCaseDialog
        open
        onClose={() => {}}
        record={RECORD}
        allowed={ALL_ALLOWED}
      />,
    );
    await user.click(screen.getByLabelText("Duplicate"));
    await user.type(screen.getByLabelText(/Note/), "Same as case 3");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    const confirmButtons = screen.getAllByRole("button", { name: "Close case" });
    await user.click(confirmButtons[confirmButtons.length - 1]);
    await waitFor(() => {
      expect(captured).toMatchObject({
        caseId: "c1",
        reason: "duplicate",
        note: "Same as case 3",
      });
    });
    expect(mockToast.success).toHaveBeenCalledWith("Case closed");
  });
});
