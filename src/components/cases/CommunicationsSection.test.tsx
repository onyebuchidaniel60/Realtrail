import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import { CommunicationsSection } from "./CommunicationsSection";

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>();
  return {
    ...mod,
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
  };
});

type Row = {
  _id: string;
  direction: "inbound" | "outbound";
  status: string;
  fromEmail: string;
  toEmails: string[];
  subject: string;
  textBody: string;
  aiDraftSource: boolean;
  participantType: "resident" | "vendor" | "other";
};

let rows: Row[] | undefined = [];

function row(overrides: Partial<Row> = {}): Row {
  return {
    _id: "comm-1",
    direction: "inbound",
    status: "received",
    fromEmail: "resident@example.com",
    toEmails: ["estate@example.com"],
    subject: "No water",
    textBody: "There is no water.",
    aiDraftSource: false,
    participantType: "resident",
    ...overrides,
  };
}

function renderSection(overrides: Record<string, unknown> = {}) {
  return render(
    <MemoryRouter>
      <CommunicationsSection
        caseId={"c1" as unknown as Id<"cases">}
        vendorLinked
        onOpenDraft={() => {}}
        onContactVendor={() => {}}
        onContactResident={() => {}}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  rows = [];
  mockUseQuery.mockReset();
  mockUseQuery.mockImplementation(() => rows);
});

describe("CommunicationsSection", () => {
  it("renders items oldest-first with direction and status chips", () => {
    // listByCase returns chronological order; the section preserves it.
    rows = [
      row({ _id: "c-old", subject: "Older", textBody: "First." }),
      row({ _id: "c-new", subject: "Newer", textBody: "Second." }),
    ];
    renderSection();
    const subjects = screen.getAllByText(/^(Older|Newer)$/);
    expect(subjects[0]).toHaveTextContent("Older");
    expect(subjects[1]).toHaveTextContent("Newer");
    expect(screen.getAllByText("Inbound")).toHaveLength(2);
    expect(screen.getAllByText("Received")).toHaveLength(2);
  });

  it("renders bodies as plain text, never HTML", () => {
    rows = [row({ textBody: "<b>bold</b> & <script>alert(1)</script>" })];
    renderSection();
    // Literal text present…
    expect(
      screen.getByText("<b>bold</b> & <script>alert(1)</script>"),
    ).toBeInTheDocument();
    // …and no element was created from it.
    expect(document.querySelector("b")).toBeNull();
    expect(document.querySelector("script")).toBeNull();
  });

  it("maps every status to its chip label", () => {
    const cases: Array<[string, string]> = [
      ["received", "Received"],
      ["draft", "Draft"],
      ["pending_send", "Queued"],
      ["sending", "Sending"],
      ["sent", "Sent"],
      ["failed", "Failed"],
      ["send_uncertain", "Needs review"],
    ];
    for (const [status, label] of cases) {
      rows = [row({ status, subject: `Subject ${status}` })];
      const { unmount } = renderSection();
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it("Open draft calls back with the draft id, only on drafts", async () => {
    const user = userEvent.setup();
    const onOpenDraft = vi.fn();
    rows = [
      row({ _id: "comm-draft", status: "draft", subject: "Draft row" }),
      row({ _id: "comm-sent", status: "sent", subject: "Sent row" }),
    ];
    renderSection({ onOpenDraft });
    await user.click(screen.getByRole("button", { name: "Open draft" }));
    expect(onOpenDraft).toHaveBeenCalledTimes(1);
    expect(onOpenDraft).toHaveBeenCalledWith({
      id: "comm-draft",
      participantType: "resident",
      toEmail: "estate@example.com",
    });
    expect(
      screen.queryAllByRole("button", { name: "Open draft" }),
    ).toHaveLength(1);
  });

  it("empty state offers both contact buttons", async () => {
    const user = userEvent.setup();
    const onContactVendor = vi.fn();
    const onContactResident = vi.fn();
    rows = [];
    renderSection({ onContactVendor, onContactResident });
    expect(screen.getByText("No communications yet.")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Contact resident" }),
    );
    await user.click(screen.getByRole("button", { name: "Contact vendor" }));
    expect(onContactResident).toHaveBeenCalledTimes(1);
    expect(onContactVendor).toHaveBeenCalledTimes(1);
  });

  it("disables Contact vendor when no vendor is linked", () => {
    rows = [];
    renderSection({ vendorLinked: false });
    expect(
      screen.getByRole("button", { name: "Contact vendor" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Contact resident" }),
    ).not.toBeDisabled();
  });
});
