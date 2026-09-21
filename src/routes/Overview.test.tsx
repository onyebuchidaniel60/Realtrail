import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OverviewPage } from "./Overview";

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockMutate = vi.hoisted(() => vi.fn());

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
  useUser: () => ({ user: { firstName: "Ada" } }),
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

function makeCase(overrides: Record<string, unknown> = {}) {
  return {
    _id: "c1",
    _creationTime: 1,
    workspaceId: "w1",
    caseNumber: 3,
    title: "Low water pressure",
    description: "Pressure dropped.",
    status: "IN_PROGRESS",
    priority: "HIGH",
    category: "water",
    propertyId: "p1",
    buildingId: undefined,
    unitId: undefined,
    aiTriageStatus: "not_started",
    lastActivityAt: 2000,
    reopenCount: 0,
    locationUnknown: false,
    createdBy: "u1",
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

const GET_CURRENT = {
  workspace: { _id: "w1", name: "Palm Estate" },
  member: { role: "owner" },
  needsOnboarding: false,
};

const PROP = { _id: "p1", name: "Palm Grove" };

function makeDashboard(overrides: Record<string, unknown> = {}) {
  return {
    metrics: {
      open: 2,
      urgent: 1,
      waitingOnVendor: 1,
      awaitingConfirmation: 0,
      resolvedThisWeek: 0,
    },
    attention: [makeCase()],
    operations: {
      new: 1,
      triaged: 0,
      inProgress: 1,
      vendorContacted: 0,
      scheduled: 0,
      workInProgress: 0,
      awaitingConfirmation: 0,
      resolved: 0,
      closed: 0,
    },
    upNext: [makeCase()],
    recentActivity: [
      {
        _id: "a1",
        caseId: "c1",
        caseNumber: 3,
        caseTitle: "Low water pressure",
        type: "CASE_CREATED",
        summary: "Case created",
        actorType: "user",
        createdAt: 2000,
      },
    ],
    ...overrides,
  };
}

let dashboardData: ReturnType<typeof makeDashboard> = makeDashboard();
// workspace.getCurrent ({}) and properties.list ({}) share an arg shape;
// hook order is deterministic (getCurrent first), so odd {} calls resolve
// to the workspace and even ones to properties.
let emptyCalls = 0;

function mockDashboardQueries() {
  emptyCalls = 0;
  mockUseQuery.mockImplementation((_fn: unknown, args: unknown) => {
    if (args === "skip") {
      return undefined;
    }
    if (typeof args === "object" && args !== null && "range" in args) {
      return dashboardData;
    }
    emptyCalls += 1;
    return emptyCalls % 2 === 1 ? GET_CURRENT : [PROP];
  });
}

beforeEach(() => {
  mockUseQuery.mockReset();
  mockMutate.mockReset();
  dashboardData = makeDashboard();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/overview"]}>
      <OverviewPage />
    </MemoryRouter>,
  );
}

describe("OverviewPage", () => {
  it("renders a greeting with the workspace name", () => {
    mockDashboardQueries();
    renderPage();
    expect(
      screen.getByText(/Good (morning|afternoon|evening), Ada/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Palm Estate/)).toBeInTheDocument();
  });

  it("renders attention counts and a Review cases button", () => {
    mockDashboardQueries();
    renderPage();
    expect(screen.getByText(/1 case needs attention/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Review cases/ }),
    ).toBeInTheDocument();
  });

  it("renders the caught-up variant when attention is empty", () => {
    dashboardData = makeDashboard({ attention: [] });
    mockDashboardQueries();
    renderPage();
    expect(screen.getByText(/You're caught up/)).toBeInTheDocument();
  });

  it("renders four metric cards with correct values", () => {
    mockDashboardQueries();
    renderPage();
    expect(screen.getByText("Open cases")).toBeInTheDocument();
    expect(screen.getByText("Waiting on vendor")).toBeInTheDocument();
    expect(screen.getByText("Resolved this week")).toBeInTheDocument();
  });

  it("marks the urgent card as danger when urgent > 0", () => {
    mockDashboardQueries();
    renderPage();
    const card = screen.getByText("Urgent cases").closest("[data-variant]");
    expect(card?.getAttribute("data-variant")).toEqual("danger");
  });

  it("renders the six operations stages with counts", () => {
    mockDashboardQueries();
    renderPage();
    for (const label of [
      "New",
      "Triaged",
      "In progress",
      "Vendor contacted",
      "Awaiting confirmation",
      "Resolved",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText(/0 closed/)).toBeInTheDocument();
  });

  it("navigates to the case when an up-next row is clicked", async () => {
    const user = userEvent.setup();
    mockDashboardQueries();
    let location = "";
    function Probe() {
      const loc = useLocation();
      location = `${loc.pathname}${loc.search}`;
      return null;
    }
    render(
      <MemoryRouter initialEntries={["/overview"]}>
        <OverviewPage />
        <Probe />
      </MemoryRouter>,
    );
    await user.click(screen.getByText("Low water pressure"));
    await waitFor(() => {
      expect(location).toContain("caseId=c1");
    });
  });

  it("renders the up-next empty state", () => {
    dashboardData = makeDashboard({ upNext: [] });
    mockDashboardQueries();
    renderPage();
    expect(
      screen.getByText("Nothing in the queue right now."),
    ).toBeInTheDocument();
  });

  it("renders recent activity entries with case links", () => {
    mockDashboardQueries();
    renderPage();
    expect(screen.getByText("Case created")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /#3 Low water pressure/ });
    expect(link.getAttribute("href")).toContain("caseId=c1");
  });

  it("renders the recent activity empty state", () => {
    dashboardData = makeDashboard({ recentActivity: [] });
    mockDashboardQueries();
    renderPage();
    expect(screen.getByText("No recent activity.")).toBeInTheDocument();
  });

  it("renders skeletons while queries are pending", () => {
    mockUseQuery.mockReturnValue(undefined);
    renderPage();
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  });

  it("renders an error state with retry on failure", async () => {
    const user = userEvent.setup();
    mockUseQuery.mockImplementation((_fn: unknown, args: unknown) => {
      if (typeof args === "object" && args !== null && "range" in args) {
        throw new Error("boom");
      }
      return GET_CURRENT;
    });
    renderPage();
    expect(
      await screen.findByText("Could not load the dashboard."),
    ).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Retry" });
    await user.click(retry);
    expect(
      await screen.findByText("Could not load the dashboard."),
    ).toBeInTheDocument();
  });

  it("updates without reload when query data changes (realtime)", () => {
    mockDashboardQueries();
    const { rerender } = render(
      <MemoryRouter initialEntries={["/overview"]}>
        <OverviewPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("Low water pressure")).toBeInTheDocument();
    dashboardData = makeDashboard({
      attention: [makeCase({ title: "Second wave" })],
      upNext: [makeCase({ title: "Second wave" })],
      recentActivity: [],
    });
    rerender(
      <MemoryRouter initialEntries={["/overview"]}>
        <OverviewPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("Second wave")).toBeInTheDocument();
  });

  it("renders the empty-workspace state when there is nothing to show", () => {
    dashboardData = makeDashboard({
      metrics: {
        open: 0,
        urgent: 0,
        waitingOnVendor: 0,
        awaitingConfirmation: 0,
        resolvedThisWeek: 0,
      },
      attention: [],
      upNext: [],
      recentActivity: [],
    });
    mockDashboardQueries();
    renderPage();
    expect(screen.getByText(/quiet today/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create first case" }),
    ).toBeInTheDocument();
  });
});
