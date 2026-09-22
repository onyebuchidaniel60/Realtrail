import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsDrawer } from "./NotificationsDrawer";
import { SidebarNav } from "@/components/layout/Sidebar";

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockMarkRead = vi.hoisted(() => vi.fn());
const mockMarkAllRead = vi.hoisted(() => vi.fn());
const mockNavigate = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>();
  return {
    ...mod,
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
    // Drawer + badge components call one mutation each per hook site;
    // route by args shape (markRead carries notificationId).
    useMutation: () => mockMutate,
  };
});

const mockMutate = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>();
  return { ...mod, useNavigate: () => mockNavigate };
});

vi.mock("@/hooks/useSyncUser", () => ({
  useSyncStatus: () => ({ synced: true, userId: "u1" }),
}));

vi.mock("@/components/common/toast", () => ({ toast: mockToast }));

type Row = {
  _id: string;
  type: "vendor_followup" | "resident_confirmation" | "urgent_case";
  title: string;
  body: string;
  caseId?: string;
  readAt?: number;
  createdAt: number;
};

let rows: Row[] | undefined = [];
let unread = 0;

function row(overrides: Partial<Row> = {}): Row {
  return {
    _id: "n1",
    type: "vendor_followup",
    title: "Vendor follow-up due",
    body: "No vendor reply has arrived.",
    caseId: "c1",
    createdAt: 5000,
    ...overrides,
  };
}

function routeQuery(_fn: unknown, args: unknown): unknown {
  if (args === "skip") {
    return undefined;
  }
  if (typeof args === "object" && args !== null && "limit" in args) {
    return rows;
  }
  if (typeof args === "object" && args !== null && "filter" in args) {
    return { communications: [], nextCursor: null, unreadCount: 0 };
  }
  return { count: unread };
}

beforeEach(() => {
  rows = [];
  unread = 0;
  mockUseQuery.mockReset();
  mockMutate.mockReset();
  mockMarkRead.mockReset();
  mockMarkAllRead.mockReset();
  mockNavigate.mockReset();
  mockToast.success.mockReset();
  mockToast.error.mockReset();
  mockUseQuery.mockImplementation(routeQuery);
  mockMutate.mockImplementation(async (args: unknown) => {
    if (
      typeof args === "object" &&
      args !== null &&
      "notificationId" in args
    ) {
      return mockMarkRead(args);
    }
    return mockMarkAllRead(args);
  });
  mockMarkRead.mockResolvedValue({ notificationId: "n1" });
  mockMarkAllRead.mockResolvedValue({ updated: 1 });
});

function renderDrawer(onOpenChange: (open: boolean) => void = () => {}) {
  return render(
    <MemoryRouter>
      <NotificationsDrawer open onOpenChange={onOpenChange} />
    </MemoryRouter>,
  );
}

describe("NotificationsDrawer", () => {
  it("renders the list from the query", () => {
    rows = [row(), row({ _id: "n2", title: "Second notice" })];
    renderDrawer();
    expect(screen.getByText("Vendor follow-up due")).toBeInTheDocument();
    expect(screen.getByText("Second notice")).toBeInTheDocument();
  });

  it("shows an empty state with no rows", () => {
    rows = [];
    renderDrawer();
    expect(screen.getByText("You're caught up.")).toBeInTheDocument();
  });

  it("clicking an item with caseId marks read and navigates", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    rows = [row({ _id: "n9", caseId: "c9" })];
    renderDrawer(onOpenChange);
    await user.click(screen.getByText("Vendor follow-up due"));
    await waitFor(() => {
      expect(mockMarkRead).toHaveBeenCalledWith({ notificationId: "n9" });
    });
    expect(mockNavigate).toHaveBeenCalledWith("/cases?caseId=c9");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("clicking an item without caseId marks read without navigating", async () => {
    const user = userEvent.setup();
    rows = [row({ _id: "n8", caseId: undefined })];
    renderDrawer();
    await user.click(screen.getByText("Vendor follow-up due"));
    await waitFor(() => {
      expect(mockMarkRead).toHaveBeenCalledWith({ notificationId: "n8" });
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("mark-all-as-read calls the mutation", async () => {
    const user = userEvent.setup();
    rows = [row()];
    renderDrawer();
    await user.click(
      screen.getByRole("button", { name: "Mark all as read" }),
    );
    await waitFor(() => {
      expect(mockMarkAllRead).toHaveBeenCalledWith({});
    });
    expect(mockToast.success).toHaveBeenCalledWith(
      "All notifications marked as read",
    );
  });
});

describe("SidebarNav notifications badge", () => {
  it("shows the unread count", () => {
    unread = 3;
    render(
      <MemoryRouter>
        <SidebarNav />
      </MemoryRouter>,
    );
    expect(
      screen.getByLabelText("3 unread notifications"),
    ).toBeInTheDocument();
  });

  it("hides the badge when count is 0", () => {
    unread = 0;
    render(
      <MemoryRouter>
        <SidebarNav />
      </MemoryRouter>,
    );
    expect(screen.getByText("Notifications")).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/unread notifications/),
    ).toBeNull();
  });
});
