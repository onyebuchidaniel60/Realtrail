import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import { SendConfirmationDialog } from "./SendConfirmationDialog";

const mockApproveSend = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>();
  // Single mock: generated api refs are Proxy objects without referential
  // stability, so dispatching useMutation by ref identity does not work.
  // This dialog calls exactly one mutation, so no routing is needed.
  return { ...mod, useMutation: () => mockApproveSend };
});

vi.mock("@/components/common/toast", () => ({ toast: mockToast }));

const LONG_BODY = `Line one. ${"x".repeat(600)}`;

function renderDialog(overrides: Record<string, unknown> = {}) {
  return render(
    <MemoryRouter>
      <SendConfirmationDialog
        open
        onOpenChange={() => {}}
        communication={{
          _id: "comm-1" as unknown as Id<"communications">,
          toEmails: ["vendor@example.com"],
          subject: "Quote request",
          textBody: LONG_BODY,
        }}
        editedSubject="Quote request"
        editedBody={LONG_BODY}
        onSent={() => {}}
        {...(overrides as object)}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockApproveSend.mockReset();
  mockToast.success.mockReset();
  mockToast.error.mockReset();
  mockApproveSend.mockResolvedValue({
    communicationId: "comm-1",
    status: "pending_send",
  });
});

describe("SendConfirmationDialog", () => {
  it("shows the server-side recipient read-only with truncated preview", async () => {
    const user = userEvent.setup();
    renderDialog();
    expect(screen.getByText("vendor@example.com")).toBeInTheDocument();
    expect(screen.getByText("Quote request")).toBeInTheDocument();
    // Recipient is text, never an input.
    expect(screen.queryByRole("textbox")).toBeNull();
    // Truncated with a Show full toggle.
    expect(screen.getByText("Show full")).toBeInTheDocument();
    expect(screen.queryByText(LONG_BODY)).toBeNull();
    await user.click(screen.getByText("Show full"));
    expect(screen.getByText(LONG_BODY)).toBeInTheDocument();
  });

  it("confirm calls approveSend and closes with a toast", async () => {
    const user = userEvent.setup();
    const onSent = vi.fn();
    renderDialog({ onSent });
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(mockApproveSend).toHaveBeenCalledWith({
      communicationId: "comm-1",
      subject: "Quote request",
      textBody: LONG_BODY,
    });
    expect(mockToast.success).toHaveBeenCalledWith("Email queued for send");
    expect(onSent).toHaveBeenCalled();
  });

  it("CONFLICT shows the already-sent toast and still closes", async () => {
    const user = userEvent.setup();
    const onSent = vi.fn();
    mockApproveSend.mockRejectedValue({
      data: { code: "CONFLICT", message: "Only drafts can be approved." },
    });
    renderDialog({ onSent });
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(mockToast.error).toHaveBeenCalledWith(
      "This draft has already been sent or is sending",
    );
    expect(onSent).toHaveBeenCalled();
  });

  it("generic errors stay open with an inline error", async () => {    const user = userEvent.setup();
    const onSent = vi.fn();
    mockApproveSend.mockRejectedValue({
      data: { code: "PROVIDER_ERROR", message: "Send failed." },
    });
    renderDialog({ onSent });
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Send failed.");
    expect(onSent).not.toHaveBeenCalled();
    // Dialog is still open: Cancel is available.
    expect(
      screen.getByRole("button", { name: "Cancel" }),
    ).toBeInTheDocument();
  });

  it("Cancel closes without calling approveSend", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockApproveSend).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
