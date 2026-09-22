import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CaseDetail } from "./CaseDetail";

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockMutate = vi.hoisted(() => vi.fn());
const mockUseAction = vi.hoisted(() => vi.fn());

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}));

vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>();
  return {
    ...mod,
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
    useMutation: () => mockMutate,
    useAction: () => mockUseAction,
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

const ALLOWED_ACTIONS = {
  canTransitionTo: ["TRIAGED"],
  canClose: {
    resolved: false,
    duplicate: true,
    invalid: true,
    cancelled: true,
  },
  canReopen: false,
  canAssign: true,
  canEdit: true,
};

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
          vendor: null,
          allowedActions: ALLOWED_ACTIONS,
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
  mockUseAction.mockReset();
  mockUseAction.mockReturnValue(vi.fn());
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
        allowedActions: ALLOWED_ACTIONS,
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

  it("opens the review sheet from the Review triage primary action", async () => {
    const user = userEvent.setup();
    mockDetailQueries({
      caseData: {
        case: {
          ...CASE,
          status: "NEW",
          aiTriageStatus: "completed",
          aiTriageOutput: {
            title: "AI title",
            summary: "AI summary",
            category: "water",
            prioritySuggestion: "HIGH",
            propertyCandidateId: "p1",
            buildingCandidateId: null,
            unitCandidateId: null,
            missingInformation: [],
            suggestedNextAction: "Send the plumber.",
            possibleRelatedCaseIds: [],
            needsReview: true,
          },
        },
        activities: [],
        vendor: null,
        allowedActions: { ...ALLOWED_ACTIONS, canTransitionTo: ["TRIAGED"] },
      },
    });
    render(<CaseDetail caseId={"c1" as never} onClose={() => {}} />);
    // AI card and primary action both render for triaged NEW cases.
    expect(screen.getByText("Realtrail AI")).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: "Review triage" });
    expect(buttons.length).toBeGreaterThan(0);
    await user.click(buttons[0]);
    expect(screen.getByText("Review AI triage")).toBeInTheDocument();
  });

  it("renders the vendor empty state when no vendor is linked", () => {
    mockDetailQueries();
    render(<CaseDetail caseId={"c1" as never} onClose={() => {}} />);
    expect(screen.getByText("No vendor linked yet.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Find a vendor" }),
    ).toBeInTheDocument();
  });

  it("renders confirmation activities with labels and actors in order", () => {
    mockDetailQueries({
      caseData: {
        case: CASE,
        activities: [
          {
            _id: "a3",
            _creationTime: 3,
            workspaceId: "w1",
            caseId: "c1",
            type: "CONFIRMATION_CONFIRMED",
            actorType: "resident",
            summary: "Resident confirmed resolution",
            createdAt: 3000,
          },
          {
            _id: "a2",
            _creationTime: 2,
            workspaceId: "w1",
            caseId: "c1",
            type: "CONFIRMATION_REQUESTED",
            actorType: "user",
            summary: "Requested resident confirmation",
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
        ],
        vendor: null,
        allowedActions: ALLOWED_ACTIONS,
      },
    });
    render(<CaseDetail caseId={"c1" as never} onClose={() => {}} />);
    expect(
      screen.getByText("Requested resident confirmation"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Resident confirmed resolution"),
    ).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items[0].textContent).toContain("Resident confirmed resolution");
    expect(items[0].textContent).toContain("resident");
    expect(items[1].textContent).toContain("Requested resident confirmation");
    expect(items[1].textContent).toContain("user");
  });

  it("mounts the confirmation panel for work-in-progress cases", () => {
    mockDetailQueries({
      caseData: {
        case: { ...CASE, status: "WORK_IN_PROGRESS" },
        activities: [],
        vendor: null,
        allowedActions: ALLOWED_ACTIONS,
      },
    });
    render(<CaseDetail caseId={"c1" as never} onClose={() => {}} />);
    expect(screen.getByText("Resident confirmation")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Request resident confirmation" }),
    ).toBeInTheDocument();
  });

  it("renders the denied confirmation label with resident actor", () => {
    mockDetailQueries({
      caseData: {
        case: CASE,
        activities: [
          {
            _id: "a9",
            _creationTime: 9,
            workspaceId: "w1",
            caseId: "c1",
            type: "CONFIRMATION_DENIED",
            actorType: "resident",
            summary: "Resident reported issue not resolved",
            createdAt: 9000,
          },
        ],
        vendor: null,
        allowedActions: ALLOWED_ACTIONS,
      },
    });
    render(<CaseDetail caseId={"c1" as never} onClose={() => {}} />);
    expect(
      screen.getByText("Resident reported issue not resolved"),
    ).toBeInTheDocument();
    expect(screen.getByText(/resident ·/)).toBeInTheDocument();
  });

  it("renders the vendor card when a vendor is linked", () => {
    mockDetailQueries({
      caseData: {
        case: CASE,
        activities: [],
        vendor: {
          _id: "v1",
          name: "Aqua Plumbing",
          email: "hello@aqua.example.com",
          phone: undefined,
          website: "https://aqua.example.com/",
          serviceCategories: ["plumbing"],
        },
        allowedActions: ALLOWED_ACTIONS,
      },
    });
    render(<CaseDetail caseId={"c1" as never} onClose={() => {}} />);
    expect(screen.getByText("Aqua Plumbing")).toBeInTheDocument();
    expect(screen.getByText("hello@aqua.example.com")).toBeInTheDocument();
    // The IN_PROGRESS fixture's panel primary action is also labeled
    // "Contact vendor", so scope to the Vendor section.
    const section = screen
      .getByRole("heading", { name: "Vendor" })
      .closest("section");
    expect(section).not.toBeNull();
    const contactButton = within(section as HTMLElement).getByRole("button", {
      name: "Contact vendor",
    });
    // Phase 8-C: the placeholder-disabled button is now live — enabled
    // whenever a vendor is linked and the case is open.
    expect(contactButton).not.toBeDisabled();
  });

  it("opens the discovery drawer from Find a vendor", async () => {
    const user = userEvent.setup();
    mockDetailQueries();
    render(<CaseDetail caseId={"c1" as never} onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Find a vendor" }));
    expect(
      screen.getByText(/Search the web for providers/),
    ).toBeInTheDocument();
  });
});
