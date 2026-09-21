import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CaseDetail } from "./CaseDetail";

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

const CASE = {
  _id: "c1",
  _creationTime: 1,
  workspaceId: "w1",
  caseNumber: 7,
  title: "Low water pressure",
  description: "Pressure dropped\nyesterday.",
  status: "IN_PROGRESS",
  priority: "HIGH",
  category: "water",
  propertyId: "p1",
  buildingId: "b1",
  unitId: "u9",
  reporterName: "Ada",
  reporterEmail: "ada@example.com",
  assigneeId: "u1",
  aiTriageStatus: "not_started",
  lastActivityAt: 2000,
  reopenCount: 0,
  locationUnknown: false,
  createdBy: "u1",
  createdAt: 1000,
  updatedAt: 2000,
};

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

const BUILDING = {
  _id: "b1",
  _creationTime: 1,
  workspaceId: "w1",
  propertyId: "p1",
  name: "Block A",
  createdAt: 1,
  updatedAt: 1,
};

const UNIT = {
  _id: "u9",
  _creationTime: 1,
  workspaceId: "w1",
  propertyId: "p1",
  buildingId: "b1",
  label: "A1",
  occupancyStatus: "occupied",
  createdAt: 1,
  updatedAt: 1,
};

const ACTIVITIES_NEWEST_FIRST = [
  {
    _id: "a2",
    _creationTime: 2,
    workspaceId: "w1",
    caseId: "c1",
    type: "NOTE_ADDED",
    actorType: "user",
    summary: "Called the plumber",
    createdAt: 2000,
  },
  {
    _id: "a1",
    _creationTime: 1,
    workspaceId: "w1",
    caseId: "c1",
    type: "CASE_CREATED",
    actorType: "user",
    summary: "Case created",
    createdAt: 1000,
  },
];

function mockDetailQueries(overrides?: {
  caseData?: unknown;
  properties?: unknown[];
  buildings?: unknown[];
  units?: unknown[];
}) {
  const caseData =
    overrides && "caseData" in overrides
      ? overrides.caseData
      : {
          case: CASE,
          activities: ACTIVITIES_NEWEST_FIRST,
          allowedActions: {},
        };
  mockUseQuery.mockImplementation((_fn: unknown, args: unknown) => {
    if (args === "skip") {
      return undefined;
    }
    if (typeof args === "object" && args !== null) {
      if ("caseId" in args) {
        return caseData;
      }
      if ("propertyId" in args) {
        return overrides?.buildings ?? [BUILDING];
      }
      if ("buildingId" in args) {
        return overrides?.units ?? [UNIT];
      }
    }
    return overrides?.properties ?? [PROP];
  });
}

beforeEach(() => {
  mockUseQuery.mockReset();
  mockMutate.mockReset();
});

describe("CaseDetail", () => {
  it("renders header with case number, title, status, and priority", () => {
    mockDetailQueries();
    render(<CaseDetail caseId={"c1" as never} onClose={() => {}} />);
    expect(screen.getByText("#7")).toBeInTheDocument();
    expect(screen.getByText("Low water pressure")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("HIGH")).toBeInTheDocument();
  });

  it("renders Location unknown when the case has no property", () => {
    mockDetailQueries({
      caseData: {
        case: { ...CASE, propertyId: undefined, buildingId: undefined, unitId: undefined },
        activities: [],
        allowedActions: {},
      },
    });
    render(<CaseDetail caseId={"c1" as never} onClose={() => {}} />);
    expect(screen.getByText("Location unknown")).toBeInTheDocument();
  });

  it("renders the issue section with description and reporter", () => {
    mockDetailQueries();
    render(<CaseDetail caseId={"c1" as never} onClose={() => {}} />);
    expect(screen.getByText(/Pressure dropped/)).toBeInTheDocument();
    expect(screen.getByText(/Ada/)).toBeInTheDocument();
    expect(screen.getByText("water")).toBeInTheDocument();
  });

  it("renders timeline activities in newest-first order", () => {
    mockDetailQueries();
    render(<CaseDetail caseId={"c1" as never} onClose={() => {}} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0].textContent).toContain("Called the plumber");
    expect(items[1].textContent).toContain("Case created");
  });

  it("renders a loading skeleton while the query is pending", () => {
    mockUseQuery.mockReturnValue(undefined);
    render(<CaseDetail caseId={"c1" as never} onClose={() => {}} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders a not-found state when the query returns null", () => {
    mockDetailQueries({ caseData: null });
    render(<CaseDetail caseId={"c1" as never} onClose={() => {}} />);
    expect(screen.getByText("Case not found")).toBeInTheDocument();
  });
});
