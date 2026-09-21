import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReopenDialog } from "./ReopenDialog";

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

const RECORD = { _id: "c1", caseNumber: 7, status: "CLOSED" } as never;

beforeEach(() => {
  mockMutate.mockReset();
  mockToast.success.mockReset();
  mockToast.error.mockReset();
  mockMutate.mockResolvedValue({});
});

describe("ReopenDialog", () => {
  it("requires a reason before submit is enabled", async () => {
    const user = userEvent.setup();
    render(<ReopenDialog open onClose={() => {}} record={RECORD} />);
    await user.click(screen.getByLabelText(/I understand/));
    expect(
      screen.getByRole("button", { name: "Reopen case" }),
    ).toBeDisabled();
  });

  it("requires the acknowledgement checkbox", async () => {
    const user = userEvent.setup();
    render(<ReopenDialog open onClose={() => {}} record={RECORD} />);
    await user.type(
      screen.getByLabelText(/Reason/),
      "Resident says it is back",
    );
    expect(
      screen.getByRole("button", { name: "Reopen case" }),
    ).toBeDisabled();
  });

  it("submits cases.reopen with the reason", async () => {
    const user = userEvent.setup();
    let captured: unknown = null;
    mockMutate.mockImplementation(async (args: unknown) => {
      captured = args;
      return { caseId: "c1", status: "IN_PROGRESS" };
    });
    render(<ReopenDialog open onClose={() => {}} record={RECORD} />);
    await user.type(
      screen.getByLabelText(/Reason/),
      "Resident says it is back",
    );
    await user.click(screen.getByLabelText(/I understand/));
    await user.click(screen.getByRole("button", { name: "Reopen case" }));
    await waitFor(() => {
      expect(captured).toMatchObject({
        caseId: "c1",
        reason: "Resident says it is back",
      });
    });
    expect(mockToast.success).toHaveBeenCalledWith("Case reopened");
  });
});
