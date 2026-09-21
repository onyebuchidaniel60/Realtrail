import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationView } from "./ConversationView";

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockMutate = vi.hoisted(() => vi.fn());

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}));

vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>();
  return {
    ...mod,
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
    useMutation: () => mockMutate,
  };
});

vi.mock("@/hooks/useSyncUser", () => ({
  useSyncStatus: () => ({ synced: true, userId: "u1" }),
  SyncProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    _id: "m1",
    direction: "inbound",
    fromEmail: "resident@example.com",
    toEmails: ["estate@example.com"],
    subject: "Leaking pipe",
    textBody: "The kitchen pipe is leaking badly.",
    status: "received",
    participantType: "other",
    createdAt: 1000,
    readAt: undefined,
    ...overrides,
  };
}

let messages: unknown[] = [makeMessage()];
let linkedCase: unknown = null;

beforeEach(() => {
  mockUseQuery.mockReset();
  mockMutate.mockReset();
  mockMutate.mockResolvedValue({});
  messages = [makeMessage()];
  linkedCase = null;
  mockUseQuery.mockImplementation((_fn: unknown, args: unknown) => {
    if (args === "skip") {
      return undefined;
    }
    if (typeof args === "object" && args !== null && "threadId" in args) {
      return { communications: messages, linkedCase };
    }
    if (typeof args === "object" && args !== null && "search" in args) {
      return { cases: [], nextCursor: null };
    }
    return undefined;
  });
});

afterEach(() => {
  vi.useRealTimers();
});

function renderView() {
  return render(
    <MemoryRouter>
      <ConversationView threadId="thread_1" onBack={() => {}} />
    </MemoryRouter>,
  );
}

describe("ConversationView", () => {
  it("renders messages in ascending order", () => {
    messages = [
      makeMessage({ _id: "m1", createdAt: 1000, textBody: "First report" }),
      makeMessage({ _id: "m2", createdAt: 2000, textBody: "Second report" }),
    ];
    const { container } = renderView();
    const bodies = Array.from(
      container.querySelectorAll("article p.whitespace-pre-wrap"),
    ).map((el) => el.textContent);
    expect(bodies).toEqual(["First report", "Second report"]);
  });

  it("renders subject and participants", () => {
    renderView();
    expect(screen.getByText("Leaking pipe")).toBeInTheDocument();
    expect(
      screen.getByText("resident@example.com → estate@example.com"),
    ).toBeInTheDocument();
  });

  it("renders the linked case badge when present", () => {
    linkedCase = { _id: "c1", caseNumber: 42, title: "Pipe fix" };
    renderView();
    expect(screen.getByText("#42 Pipe fix")).toBeInTheDocument();
  });

  it("shows Link to case for inbound unlinked threads", () => {
    renderView();
    expect(
      screen.getByRole("button", { name: "Link to case" }),
    ).toBeInTheDocument();
  });

  it("hides Link to case when the thread is already linked", () => {
    linkedCase = { _id: "c1", caseNumber: 42, title: "Pipe fix" };
    renderView();
    expect(
      screen.queryByRole("button", { name: "Link to case" }),
    ).not.toBeInTheDocument();
  });

  it("hides Link to case when the first message is outbound", () => {
    messages = [makeMessage({ direction: "outbound" })];
    renderView();
    expect(
      screen.queryByRole("button", { name: "Link to case" }),
    ).not.toBeInTheDocument();
  });

  it("shows Mark as read only while messages are unread", () => {
    renderView();
    expect(
      screen.getByRole("button", { name: "Mark as read" }),
    ).toBeInTheDocument();
  });

  it("hides Mark as read when everything is read", () => {
    messages = [makeMessage({ readAt: 5000 })];
    renderView();
    expect(
      screen.queryByRole("button", { name: "Mark as read" }),
    ).not.toBeInTheDocument();
  });

  it("auto-marks the thread as read after mount", async () => {
    vi.useFakeTimers();
    renderView();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(mockMutate).toHaveBeenCalledWith({ threadId: "thread_1" });
  });

  it("renders bodies as plain text, never HTML", () => {
    messages = [
      makeMessage({ textBody: '<script>alert("x")</script> attempt' }),
    ];
    const { container } = renderView();
    expect(container.querySelector("script")).toBeNull();
    expect(
      screen.getByText('<script>alert("x")</script> attempt'),
    ).toBeInTheDocument();
  });
});
