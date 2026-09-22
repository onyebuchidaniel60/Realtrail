import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import { ConfirmationPanel } from "./ConfirmationPanel";

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockRequest = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>();
  // Single mutation in this component; no ref dispatch needed.
  return {
    ...mod,
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
    useMutation: () => mockRequest,
  };
});

vi.mock("@/components/common/toast", () => ({ toast: mockToast }));

const CASE_ID = "c1" as unknown as Id<"cases">;

function renderPanel(status: string) {
  return render(
    <ConfirmationPanel
      caseId={CASE_ID}
      caseStatus={status as never}
    />,
  );
}

beforeEach(() => {
  mockUseQuery.mockReset();
  mockRequest.mockReset();
  mockToast.success.mockReset();
  mockToast.error.mockReset();
  mockUseQuery.mockImplementation(() => ({ requested: false }));
  mockRequest.mockResolvedValue({ tokenId: "t1", communicationId: "m1" });
});

describe("ConfirmationPanel", () => {
  it.each([
    "NEW",
    "TRIAGED",
    "IN_PROGRESS",
    "VENDOR_CONTACTED",
    "SCHEDULED",
    "CLOSED",
  ])("renders null for status %s", (status) => {
    const { container } = renderPanel(status);
    expect(container).toBeEmptyDOMElement();
  });

  it("WORK_IN_PROGRESS shows the request button; cancel is a no-op", async () => {
    const user = userEvent.setup();
    renderPanel("WORK_IN_PROGRESS");
    await user.click(
      screen.getByRole("button", { name: "Request resident confirmation" }),
    );
    expect(
      screen.getByRole("dialog"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("confirm calls requestConfirmation and toasts", async () => {
    const user = userEvent.setup();
    renderPanel("WORK_IN_PROGRESS");
    await user.click(
      screen.getByRole("button", { name: "Request resident confirmation" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Send request" }),
    );
    expect(mockRequest).toHaveBeenCalledWith({ caseId: CASE_ID });
    expect(mockToast.success).toHaveBeenCalledWith(
      "Confirmation requested",
    );
  });

  it("AWAITING_CONFIRMATION shows pending state and resend", async () => {
    const user = userEvent.setup();
    mockUseQuery.mockImplementation(() => ({
      requested: true,
      requestedAt: Date.now() - 3600 * 1000,
      expiresAt: Date.now() + 71 * 3600 * 1000,
    }));
    renderPanel("AWAITING_CONFIRMATION");
    expect(
      screen.getByText("Awaiting resident response"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Requested /)).toBeInTheDocument();
    expect(screen.getByText(/Expires /)).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Resend confirmation" }),
    );
    expect(
      screen.getByText(/previous link will no longer work/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resend" }));
    expect(mockRequest).toHaveBeenCalledWith({ caseId: CASE_ID });
  });

  it('RESOLVED with lastDecision "yes" shows the green block', () => {
    mockUseQuery.mockImplementation(() => ({
      requested: false,
      lastDecision: "yes",
      lastDecisionAt: Date.now(),
    }));
    renderPanel("RESOLVED");
    expect(
      screen.getByText("Resolved — confirmed by resident"),
    ).toBeInTheDocument();
  });

  it("RESOLVED without a resident decision shows the neutral block", () => {
    renderPanel("RESOLVED");
    expect(screen.getByText("Resolved")).toBeInTheDocument();
    expect(
      screen.queryByText("Resolved — confirmed by resident"),
    ).toBeNull();
  });

  it("never renders token-shaped strings or confirmation URLs", () => {
    mockUseQuery.mockImplementation(() => ({
      requested: true,
      requestedAt: Date.now() - 1000,
      expiresAt: Date.now() + 1000,
      lastDecision: "yes",
      lastDecisionAt: Date.now(),
    }));
    for (const status of ["WORK_IN_PROGRESS", "AWAITING_CONFIRMATION", "RESOLVED"]) {
      const { unmount } = renderPanel(status);
      const html = document.body.innerHTML;
      expect(html).not.toMatch(/[A-Za-z0-9_-]{43}/);
      expect(html).not.toContain("confirm?token=");
      unmount();
      document.body.innerHTML = "";
    }
  });
});
