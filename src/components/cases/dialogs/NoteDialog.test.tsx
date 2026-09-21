import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NoteDialog } from "./NoteDialog";

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

const RECORD = { _id: "c1", caseNumber: 7 } as never;

beforeEach(() => {
  mockMutate.mockReset();
  mockToast.success.mockReset();
  mockToast.error.mockReset();
  mockMutate.mockResolvedValue({});
});

describe("NoteDialog", () => {
  it("disables submit with an empty body", () => {
    render(<NoteDialog open onClose={() => {}} record={RECORD} />);
    expect(screen.getByRole("button", { name: "Add note" })).toBeDisabled();
  });

  it("submits cases.addNote with the body", async () => {
    const user = userEvent.setup();
    let captured: unknown = null;
    mockMutate.mockImplementation(async (args: unknown) => {
      captured = args;
      return { activityId: "a1" };
    });
    render(<NoteDialog open onClose={() => {}} record={RECORD} />);
    await user.type(screen.getByLabelText("Note"), "Called the plumber");
    await user.click(screen.getByRole("button", { name: "Add note" }));
    await waitFor(() => {
      expect(captured).toMatchObject({
        caseId: "c1",
        body: "Called the plumber",
      });
    });
  });

  it("fires toast.success on success", async () => {
    const user = userEvent.setup();
    render(<NoteDialog open onClose={() => {}} record={RECORD} />);
    await user.type(screen.getByLabelText("Note"), "Called the plumber");
    await user.click(screen.getByRole("button", { name: "Add note" }));
    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith("Note added");
    });
  });
});
