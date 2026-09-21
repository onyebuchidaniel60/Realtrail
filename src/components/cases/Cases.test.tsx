import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CasesPage } from "../../routes/Cases";

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

function makeCase(overrides: Record<string, unknown> = {}) {
  return {
    _id: "c1",
    _creationTime: 1,
    workspaceId: "w1",
    caseNumber: 1,
    title: "Low water pressure",
    description: "Pressure dropped yesterday.",
    status: "NEW",
    priority: "HIGH",
    category: "water",
    propertyId: "p1",
    buildingId: undefined,
    unitId: undefined,
    reporterName: undefined,
    reporterEmail: undefined,
    assigneeId: undefined,
    aiTriageStatus: "not_started",
    lastActivityAt: 1000,
    reopenCount: 0,
    locationUnknown: false,
    createdBy: "u1",
    createdAt: 900,
    updatedAt: 1000,
    ...overrides,
  };
}

const PROP = {
  _id: "p1",
  _creationTime: 1,
  workspaceId: "w1",
  name: "Palm Grove",
  address: "12 Marina Road",
  timezone: "Africa/Lagos",
  active: true,
  createdAt: 1,
  updatedAt: 1,
};

let listData: unknown[] = [makeCase()];
let capturedListArgs: unknown[] = [];

function mockListQueries() {
  mockUseQuery.mockImplementation((_fn: unknown, args: unknown) => {
    if (args === "skip") {
      return undefined;
    }
    if (typeof args === "object" && args !== null && "pageSize" in args) {
      // The metrics query ({ pageSize: 100 }) is not part of the list flow.
      if ((args as { pageSize?: number }).pageSize !== 100) {
        capturedListArgs.push(args);
      }
      return { cases: listData, nextCursor: null };
    }
    return [PROP];
  });
}

beforeEach(() => {
  mockUseQuery.mockReset();
  mockMutate.mockReset();
  mockMutate.mockResolvedValue({});
  listData = [makeCase()];
  capturedListArgs = [];
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/cases"]}>
      <CasesPage />
    </MemoryRouter>,
  );
}

describe("CasesPage", () => {
  it("renders an empty state when no cases exist", () => {
    listData = [];
    mockListQueries();
    renderPage();
    expect(screen.getByText("No cases yet")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create your first case" }),
    ).toBeInTheDocument();
  });

  it("renders clear-filters state when filters exclude all", async () => {
    const user = userEvent.setup();
    mockListQueries();
    renderPage();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Low water pressure")).toBeInTheDocument();
    listData = [];
    await user.selectOptions(
      screen.getByLabelText("Filter by status"),
      "TRIAGED",
    );
    expect(screen.getByText("No cases match your filters")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Clear filters" }),
    ).toBeInTheDocument();
  });

  it("renders a loading skeleton while queries are pending", () => {
    mockUseQuery.mockReturnValue(undefined);
    renderPage();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders cases in the desktop table", () => {
    mockListQueries();
    renderPage();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Low water pressure")).toBeInTheDocument();
    expect(within(table).getByText("#1")).toBeInTheDocument();
  });

  it("renders cases as mobile cards", () => {
    mockListQueries();
    renderPage();
    const cards = screen.getByTestId("case-cards");
    expect(within(cards).getByText("Low water pressure")).toBeInTheDocument();
  });

  it("sets caseId in the URL when a row is clicked", async () => {
    const user = userEvent.setup();
    mockListQueries();
    let currentSearch = "";
    function Probe() {
      const [params] = useSearchParams();
      currentSearch = params.toString();
      return null;
    }
    render(
      <MemoryRouter initialEntries={["/cases"]}>
        <CasesPage />
        <Probe />
      </MemoryRouter>,
    );
    const table = screen.getByRole("table");
    await user.click(within(table).getByText("Low water pressure"));
    await waitFor(() => {
      expect(currentSearch).toContain("caseId=c1");
    });
  });

  it("narrows cases when the status filter changes", async () => {
    const user = userEvent.setup();
    mockListQueries();
    renderPage();
    await user.selectOptions(
      screen.getByLabelText("Filter by status"),
      "TRIAGED",
    );
    await waitFor(() => {
      expect(capturedListArgs.at(-1)).toMatchObject({ status: "TRIAGED" });
    });
  });

  it("narrows cases when the priority filter changes", async () => {
    const user = userEvent.setup();
    mockListQueries();
    renderPage();
    await user.selectOptions(
      screen.getByLabelText("Filter by priority"),
      "URGENT",
    );
    await waitFor(() => {
      expect(capturedListArgs.at(-1)).toMatchObject({ priority: "URGENT" });
    });
  });

  it("filters by title substring via search", async () => {
    const user = userEvent.setup();
    mockListQueries();
    renderPage();
    await user.type(screen.getByLabelText("Search cases"), "pump");
    await waitFor(
      () => {
        expect(capturedListArgs.at(-1)).toMatchObject({ search: "pump" });
      },
      { timeout: 2000 },
    );
  });

  it("opens the new-case dialog", async () => {
    const user = userEvent.setup();
    mockListQueries();
    renderPage();
    await user.click(screen.getByRole("button", { name: "New case" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create case" }),
    ).toBeInTheDocument();
  });

  it("submits all fields from the new-case dialog", async () => {
    const user = userEvent.setup();
    let captured: unknown = null;
    mockMutate.mockImplementation(async (args: unknown) => {
      captured = args;
      return { caseId: "c9", caseNumber: 9 };
    });
    mockListQueries();
    renderPage();
    await user.click(screen.getByRole("button", { name: "New case" }));
    await user.type(screen.getByLabelText("Title"), "Broken elevator");
    await user.type(
      screen.getByLabelText("Description"),
      "The elevator stalls between floors.",
    );
    await user.click(screen.getByRole("button", { name: "Create case" }));
    await waitFor(() => {
      expect(captured).toMatchObject({
        title: "Broken elevator",
        description: "The elevator stalls between floors.",
        category: "other",
        priority: "MEDIUM",
        locationUnknown: false,
      });
    });
  });
});
