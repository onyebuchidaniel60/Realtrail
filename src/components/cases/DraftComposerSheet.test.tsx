import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import { DraftComposerSheet } from "./DraftComposerSheet";

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockRequestAiDraft = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]): Promise<unknown> => ({
    scheduled: true,
  })),
);
const mockCreateDraftRecord = vi.hoisted(() => vi.fn());
const mockApproveSend = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const mockMutate = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]): Promise<unknown> => ({})),
);

vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>();
  // Generated api refs are Proxy objects without referential stability,
  // so useMutation cannot be dispatched by ref identity. Route by args
  // shape instead: approveSend carries communicationId, createDraftRecord
  // carries subject, requestAiDraft carries neither.
  return {
    ...mod,
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
    useMutation: () => mockMutate,
  };
});

vi.mock("@/components/common/toast", () => ({ toast: mockToast }));

type Row = {
  _id: string;
  direction: "outbound";
  status: string;
  fromEmail: string;
  toEmails: string[];
  subject: string;
  textBody: string;
  aiDraftSource: boolean;
  approvedBy?: string;
  approvedAt?: number;
  createdAt: number;
  participantType: "vendor" | "resident";
};

let rows: Row[] = [];

function aiRow(overrides: Partial<Row> = {}): Row {
  return {
    _id: "comm-ai-1",
    direction: "outbound",
    status: "draft",
    fromEmail: "estate@example.com",
    toEmails: ["vendor@example.com"],
    subject: "AI quote request",
    textBody: "Hello, please quote for the repair.",
    aiDraftSource: true,
    createdAt: 5000,
    participantType: "vendor",
    ...overrides,
  };
}

const CASE_ID = "c1" as unknown as Id<"cases">;
const VENDOR_ID = "v1" as unknown as Id<"vendors">;

const vendorRecipient = {
  type: "vendor" as const,
  vendorId: VENDOR_ID,
  vendorName: "Aqua Fix Ltd",
  vendorEmail: "vendor@example.com",
};

function renderComposer(
  overrides: Record<string, unknown> = {},
  recipient: unknown = vendorRecipient,
) {
  return render(
    <MemoryRouter>
      <DraftComposerSheet
        caseId={CASE_ID}
        caseNumber={7}
        caseTitle="Leaking pipe"
        locationLabel="Palm Grove"
        open
        onOpenChange={() => {}}
        recipient={recipient as never}
        {...(overrides as object)}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  rows = [];
  mockUseQuery.mockReset();
  mockRequestAiDraft.mockReset();
  mockCreateDraftRecord.mockReset();
  mockApproveSend.mockReset();
  mockMutate.mockReset();
  mockToast.success.mockReset();
  mockToast.error.mockReset();
  mockUseQuery.mockImplementation(() => rows);
  mockRequestAiDraft.mockResolvedValue({ scheduled: true });
  mockMutate.mockImplementation(async (args: unknown) => {
    if (isRecord(args) && "communicationId" in args) {
      return mockApproveSend(args);
    }
    if (isRecord(args) && "subject" in args) {
      return mockCreateDraftRecord(args);
    }
    return mockRequestAiDraft(args);
  });
  mockCreateDraftRecord.mockImplementation(async () => {
    const id = `comm-manual-${rows.length + 1}`;
    rows = [
      ...rows,
      {
        _id: id,
        direction: "outbound",
        status: "draft",
        fromEmail: "estate@example.com",
        toEmails: ["vendor@example.com"],
        subject: "Manual subject",
        textBody: "Manual body.",
        aiDraftSource: false,
        createdAt: 6000 + rows.length,
        participantType: "vendor",
      },
    ];
    return { communicationId: id };
  });
});

describe("DraftComposerSheet", () => {
  it("renders the vendor recipient block read-only", () => {
    renderComposer();
    expect(screen.getByText("Aqua Fix Ltd")).toBeInTheDocument();
    expect(screen.getByText("vendor@example.com")).toBeInTheDocument();
    expect(screen.queryByLabelText("Recipient email")).toBeNull();
  });

  it("prompts for an email when the resident has none on file", async () => {
    const user = userEvent.setup();
    renderComposer({}, { type: "resident" });
    const emailInput = screen.getByLabelText("Recipient email");
    expect(emailInput).toHaveValue("");
    // Draft with AI stays disabled until a valid address is typed.
    expect(
      screen.getByRole("button", { name: "Draft with AI" }),
    ).toBeDisabled();
    await user.type(emailInput, "resident@example.com");
    expect(
      screen.getByRole("button", { name: "Draft with AI" }),
    ).not.toBeDisabled();
  });

  it("Draft with AI calls requestAiDraft and disables while pending", async () => {
    const user = userEvent.setup();
    let release!: (value: unknown) => void;
    mockRequestAiDraft.mockImplementation(
      () => new Promise((resolve) => void (release = resolve)),
    );
    renderComposer();
    await user.type(
      screen.getByLabelText("Guidance for AI (optional)"),
      "ask for a quote",
    );
    await user.click(screen.getByRole("button", { name: "Draft with AI" }));
    expect(mockRequestAiDraft).toHaveBeenCalledWith({
      caseId: "c1",
      recipientType: "vendor",
      recipientId: "v1",
      instructions: "ask for a quote",
    });
    expect(
      screen.getByRole("button", { name: "Drafting…" }),
    ).toBeDisabled();
    release({ scheduled: true });
  });

  it("populates the editor when the AI draft row arrives", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <MemoryRouter>
        <DraftComposerSheet
          caseId={CASE_ID}
          caseNumber={7}
          caseTitle="Leaking pipe"
          locationLabel="Palm Grove"
          open
          onOpenChange={() => {}}
          recipient={vendorRecipient as never}
        />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Draft with AI" }));
    rows = [aiRow()];
    rerender(
      <MemoryRouter>
        <DraftComposerSheet
          caseId={CASE_ID}
          caseNumber={7}
          caseTitle="Leaking pipe"
          locationLabel="Palm Grove"
          open
          onOpenChange={() => {}}
          recipient={vendorRecipient as never}
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByLabelText(/Subject/)).toHaveValue(
        "AI quote request",
      );
    });
    expect(screen.getByLabelText(/Message/)).toHaveValue(
      "Hello, please quote for the repair.",
    );
    expect(screen.getByText("AI-generated")).toBeInTheDocument();
  });

  it("Save draft calls createDraftRecord with the edited values", async () => {
    const user = userEvent.setup();
    renderComposer();
    await user.type(screen.getByLabelText(/Subject/), "Pump repair");
    await user.type(screen.getByLabelText(/Message/), "Please quote soon.");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => {
      expect(mockCreateDraftRecord).toHaveBeenCalledWith({
        caseId: "c1",
        recipientType: "vendor",
        recipientEmail: "vendor@example.com",
        subject: "Pump repair",
        textBody: "Please quote soon.",
        aiDraftSource: false,
      });
    });
    expect(mockToast.success).toHaveBeenCalledWith("Draft saved");
  });

  it("Send opens the confirmation dialog without calling approveSend", async () => {
    const user = userEvent.setup();
    rows = [aiRow({ _id: "comm-ai-9" })];
    renderComposer({ existingDraftId: "comm-ai-9" });
    await waitFor(() => {
      expect(screen.getByLabelText(/Subject/)).toHaveValue(
        "AI quote request",
      );
    });
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(
      await screen.findByRole("dialog", undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Send this email?" }),
    ).toBeInTheDocument();
    expect(mockApproveSend).not.toHaveBeenCalled();
  });

  it("rejects empty subject and overlong body on save", async () => {
    const user = userEvent.setup();
    renderComposer();
    const save = screen.getByRole("button", { name: "Save draft" });
    // Empty subject: disabled.
    await user.type(screen.getByLabelText(/Message/), "Body only.");
    expect(save).toBeDisabled();
    // Valid subject, overlong body: disabled. fireEvent sets the long
    // value synchronously — typing 10k chars key-by-key would take
    // minutes under user-event.
    await user.type(screen.getByLabelText(/Subject/), "Ok subject");
    fireEvent.change(screen.getByLabelText(/Message/), {
      target: { value: "x".repeat(10001) },
    });
    expect(save).toBeDisabled();
    expect(mockCreateDraftRecord).not.toHaveBeenCalled();
  });

  it("shows an error state with retry when Draft with AI fails", async () => {
    const user = userEvent.setup();
    mockRequestAiDraft.mockRejectedValueOnce(new Error("model down"));
    renderComposer();
    await user.click(screen.getByRole("button", { name: "Draft with AI" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    mockRequestAiDraft.mockResolvedValue({ scheduled: true });
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(mockRequestAiDraft).toHaveBeenCalledTimes(2);
  });

  it("warns when the vendor has no email address", () => {
    renderComposer(
      {},
      { type: "vendor", vendorId: "v2", vendorName: "No Email Co" },
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      /no email address/i,
    );
    expect(
      screen.getByRole("button", { name: "Draft with AI" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  });
});
