import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CaseDetail } from "./CaseDetail";

// Stable stub refs: the generated api object is a Proxy without
// referential stability, so query mocks cannot dispatch on the real
// refs. Stubbing the api module gives stable identities for routing.
// cases.get and listByCase both take { caseId }, which is why routing
// by args shape alone cannot separate them.
const apiStub = vi.hoisted(() => ({
  cases: {
    queries: { get: { __stub: "casesGet" } },
    mutations: {},
    confirmation: {
      requestConfirmation: { __stub: "requestConfirmation" },
      getConfirmationState: { __stub: "getConfirmationState" },
    },
  },
  buildings: { listByProperty: { __stub: "buildings" } },
  units: { listByBuilding: { __stub: "units" } },
  properties: { list: { __stub: "properties" } },
  email: {
    queries: { listByCase: { __stub: "listByCase" } },
    mutations: {
      requestAiDraft: { __stub: "requestAiDraft" },
      createDraftRecord: { __stub: "createDraftRecord" },
      approveSend: { __stub: "approveSend" },
    },
  },
}));

vi.mock("../../../convex/_generated/api", () => ({ api: apiStub }));

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockMutate = vi.hoisted(() => vi.fn());
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
    useMutation: () => mockMutate,
  };
});

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}));

vi.mock("@/hooks/useSyncUser", () => ({
  useSyncStatus: () => ({ synced: true, userId: "u1" }),
  SyncProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@/components/common/toast", () => ({ toast: mockToast }));

const VENDOR = {
  _id: "v1",
  name: "Aqua Fix Ltd",
  email: "vendor@example.com",
  phone: undefined,
  website: undefined,
  serviceCategories: ["plumbing"],
};

function makeCase(status: string, overrides: Record<string, unknown> = {}) {
  return {
    _id: "c1",
    _creationTime: 1,
    workspaceId: "w1",
    caseNumber: 7,
    title: "Leaking pipe",
    description: "Kitchen pipe needs attention.",
    status,
    priority: "MEDIUM",
    category: "plumbing",
    reporterEmail: "ada@example.com",
    aiTriageStatus: "not_started",
    lastActivityAt: 2000,
    reopenCount: 0,
    locationUnknown: true,
    createdBy: "u1",
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

const ALLOWED_ACTIONS = {
  canTransitionTo: [],
  canClose: {
    resolved: false,
    duplicate: false,
    invalid: false,
    cancelled: false,
  },
  canReopen: false,
  canAssign: false,
  canEdit: false,
};

function mockQueries(options: {
  status?: string;
  vendor?: unknown;
  comms?: unknown[];
} = {}) {
  const caseData = {
    case: makeCase(options.status ?? "IN_PROGRESS"),
    activities: [],
    vendor: options.vendor === undefined ? VENDOR : options.vendor,
    allowedActions: ALLOWED_ACTIONS,
  };
  // Default to a non-empty thread so the comms empty-state buttons do
  // not collide with the panel/vendor buttons under test (empty-state
  // coverage lives in CommunicationsSection.test.tsx).
  const comms = options.comms ?? [
    {
      _id: "comm-1",
      direction: "inbound",
      status: "received",
      fromEmail: "ada@example.com",
      toEmails: ["estate@example.com"],
      subject: "Leak",
      textBody: "Kitchen is leaking.",
      aiDraftSource: false,
      participantType: "resident",
    },
  ];
  mockUseQuery.mockImplementation((ref: unknown, args: unknown) => {
    if (args === "skip") {
      return undefined;
    }
    if (ref === apiStub.cases.queries.get) {
      return caseData;
    }
    if (ref === apiStub.email.queries.listByCase) {
      return comms;
    }
    if (ref === apiStub.cases.confirmation.getConfirmationState) {
      return { requested: false };
    }
    return [];
  });
}

beforeEach(() => {
  mockUseQuery.mockReset();
  mockMutate.mockReset();
  mockToast.success.mockReset();
  mockToast.error.mockReset();
  mockMutate.mockResolvedValue({});
});

function renderDetail() {
  return render(<CaseDetail caseId={"c1" as never} onClose={() => {}} />);
}

// The detail view has several same-named buttons (vendor card, comms
// empty state, panel primary action). Scope vendor-card assertions to
// the Vendor section, mirroring CaseDetail.test.tsx.
function vendorSectionButton(name: string): HTMLElement {
  const section = screen
    .getByRole("heading", { name: "Vendor" })
    .closest("section");
  expect(section).not.toBeNull();
  return within(section as HTMLElement).getByRole("button", { name });
}

describe("CaseDetail contact wiring", () => {
  it("enables Contact vendor when a vendor is linked", async () => {
    const user = userEvent.setup();
    mockQueries();
    renderDetail();
    const button = vendorSectionButton("Contact vendor");
    expect(button).not.toBeDisabled();
    await user.click(button);
    expect(
      await screen.findByRole("dialog", undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Compose email")).toBeInTheDocument();
    // Vendor card plus composer recipient block.
    expect(screen.getAllByText("Aqua Fix Ltd")).toHaveLength(2);
  });

  it("shows no Contact vendor button without a linked vendor", () => {
    mockQueries({ vendor: null });
    renderDetail();
    const section = screen
      .getByRole("heading", { name: "Vendor" })
      .closest("section");
    expect(section).not.toBeNull();
    expect(
      within(section as HTMLElement).queryByRole("button", {
        name: "Contact vendor",
      }),
    ).toBeNull();
    expect(screen.getByText("No vendor linked yet.")).toBeInTheDocument();
  });

  it("Contact resident opens the composer addressed to the reporter", async () => {
    const user = userEvent.setup();
    mockQueries();
    renderDetail();
    await user.click(
      screen.getByRole("button", { name: "Contact resident" }),
    );
    expect(
      await screen.findByRole("dialog", undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
  });

  it("disables Contact vendor when the case is CLOSED", () => {
    mockQueries({ status: "CLOSED" });
    renderDetail();
    const button = vendorSectionButton("Contact vendor");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Case is closed");
  });
});
