import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InboxPage } from "./Inbox";

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

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    _id: "m1",
    direction: "inbound",
    subject: "Leaking pipe",
    fromEmail: "resident@example.com",
    preview: "The kitchen pipe is leaking.",
    participantType: "other",
    caseId: undefined,
    caseNumber: undefined,
    caseTitle: undefined,
    createdAt: 2000,
    readAt: undefined,
    threadId: "thread_1",
    ...overrides,
  };
}

let listRows: unknown[] = [makeRow()];
let listUnread = 1;
let listPending = false;
let capturedListArgs: unknown[] = [];
let threadData: unknown = null;

function mockQueries() {
  mockUseQuery.mockImplementation((_fn: unknown, args: unknown) => {
    if (args === "skip") {
      return undefined;
    }
    if (typeof args !== "object" || args === null) {
      return undefined;
    }
    if ("threadId" in args) {
      return threadData;
    }
    if ("filter" in args) {
      capturedListArgs.push(args);
      if (listPending) {
        return undefined;
      }
      return { communications: listRows, nextCursor: null, unreadCount: listUnread };
    }
    // workspace.getCurrent
    return {
      workspace: {
        _id: "w1",
        name: "Estate",
        agentMailInboxAddress: "estate-1@example.com",
      },
      member: null,
      needsOnboarding: false,
    };
  });
}

beforeEach(() => {
  mockUseQuery.mockReset();
  mockMutate.mockReset();
  mockMutate.mockResolvedValue({});
  listRows = [makeRow()];
  listUnread = 1;
  listPending = false;
  capturedListArgs = [];
  threadData = null;
  mockQueries();
});

function renderPage(entry = "/inbox") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <InboxPage />
    </MemoryRouter>,
  );
}

describe("InboxPage", () => {
  it("renders a loading skeleton while the list is pending", () => {
    listPending = true;
    renderPage();
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });

  it("renders the empty state with the inbox address when no communications", () => {
    listRows = [];
    listUnread = 0;
    renderPage();
    expect(screen.getByText("No messages yet")).toBeInTheDocument();
    expect(screen.getByText(/estate-1@example\.com/)).toBeInTheDocument();
  });

  it("renders list rows with sender and subject", () => {
    renderPage();
    expect(screen.getByText("Leaking pipe")).toBeInTheDocument();
    expect(screen.getByText("resident")).toBeInTheDocument();
  });

  it("marks unread rows with an unread indicator", () => {
    listRows = [
      makeRow({ _id: "m1", readAt: undefined }),
      makeRow({ _id: "m2", readAt: 5000, subject: "Read mail" }),
    ];
    renderPage();
    expect(screen.getAllByLabelText("Unread")).toHaveLength(1);
  });

  it("clicking a row opens the conversation via threadId", async () => {
    const user = userEvent.setup();
    threadData = {
      communications: [
        {
          ...makeRow(),
          toEmails: ["estate@example.com"],
          textBody: "The kitchen pipe is leaking badly.",
          status: "received",
        },
      ],
      linkedCase: null,
    };
    renderPage();
    await user.click(screen.getByText("Leaking pipe"));
    await waitFor(() => {
      expect(
        screen.getByText("The kitchen pipe is leaking badly."),
      ).toBeInTheDocument();
    });
  });

  it("filter tabs re-query with the selected filter", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(capturedListArgs.at(-1)).toMatchObject({ filter: "all" });
    await user.click(screen.getByRole("tab", { name: /Residents/ }));
    await waitFor(() => {
      expect(capturedListArgs.at(-1)).toMatchObject({ filter: "residents" });
    });
    await user.click(screen.getByRole("tab", { name: /Vendors/ }));
    await waitFor(() => {
      expect(capturedListArgs.at(-1)).toMatchObject({ filter: "vendors" });
    });
  });

  it("shows the unread badge on the selected tab", () => {
    listUnread = 3;
    renderPage();
    expect(screen.getByLabelText("3 unread")).toBeInTheDocument();
  });

  it("renders a linked case badge on the row", () => {
    listRows = [makeRow({ caseNumber: 42 })];
    renderPage();
    expect(screen.getByText("#42")).toBeInTheDocument();
  });
});
