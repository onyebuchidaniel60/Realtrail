import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VendorDiscoveryDrawer } from "./VendorDiscoveryDrawer";

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockMutate = vi.hoisted(() => vi.fn());
const mockDiscover = vi.hoisted(() => vi.fn());
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
    useAction: () => mockDiscover,
  };
});

vi.mock("@/components/common/toast", () => ({ toast: mockToast }));

const RECORD = {
  _id: "c1",
  category: "plumbing",
} as never;

function makeResult(overrides: Record<string, unknown> = {}) {
  return {
    _id: "r1",
    _creationTime: 1,
    workspaceId: "w1",
    researchId: "res1",
    providerName: "Aqua Plumbing Lagos",
    website: "https://aqua.example.com/",
    email: "hello@aqua.example.com",
    phone: undefined,
    services: [],
    location: "Lagos",
    sourceUrl: "https://aqua.example.com/",
    evidence: "24/7 plumber in Lagos for water pressure repairs.",
    rankBand: "high_relevance",
    fetchedAt: 1000,
    ...overrides,
  };
}

let researchData: unknown = null;

beforeEach(() => {
  mockUseQuery.mockReset();
  mockMutate.mockReset();
  mockDiscover.mockReset();
  mockToast.success.mockReset();
  mockToast.error.mockReset();
  mockMutate.mockResolvedValue({ vendorId: "v9" });
  researchData = null;
  mockUseQuery.mockImplementation((_fn: unknown, args: unknown) => {
    if (args === "skip") {
      return undefined;
    }
    return researchData;
  });
});

function renderDrawer() {
  return render(
    <MemoryRouter>
      <VendorDiscoveryDrawer record={RECORD} open onClose={() => {}} />
    </MemoryRouter>,
  );
}

describe("VendorDiscoveryDrawer", () => {
  it("search triggers the discover action with the case id", async () => {
    const user = userEvent.setup();
    mockDiscover.mockResolvedValue({ researchId: "res1" });
    renderDrawer();
    await user.type(screen.getByLabelText("Search refinement"), "emergency");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => {
      expect(mockDiscover).toHaveBeenCalledWith({
        caseId: "c1",
        refinement: "emergency",
      });
    });
  });

  it("shows a loading state while the action is pending", async () => {
    const user = userEvent.setup();
    let resolveDiscover: (value: unknown) => void = () => {};
    mockDiscover.mockImplementation(
      () => new Promise((resolve) => (resolveDiscover = resolve)),
    );
    renderDrawer();
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByText("Searching for vendors…")).toBeInTheDocument();
    resolveDiscover({ researchId: "res1" });
    await waitFor(() => {
      expect(
        screen.queryByText("Searching for vendors…"),
      ).not.toBeInTheDocument();
    });
  });

  it("renders result cards with name, band, and contact info", async () => {
    const user = userEvent.setup();
    mockDiscover.mockResolvedValue({ researchId: "res1" });
    researchData = {
      research: { _id: "res1", status: "completed" },
      results: [makeResult()],
    };
    renderDrawer();
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => {
      expect(screen.getByText("Aqua Plumbing Lagos")).toBeInTheDocument();
    });
    expect(screen.getByText("High match")).toBeInTheDocument();
    expect(screen.getByText("hello@aqua.example.com")).toBeInTheDocument();
    expect(screen.getByText("Lagos")).toBeInTheDocument();
  });

  it("save calls vendors.save then cases.setVendor", async () => {
    const user = userEvent.setup();
    const calls: Array<unknown> = [];
    mockMutate.mockImplementation(async (args: unknown) => {
      calls.push(args);
      return { vendorId: "v9" };
    });
    mockDiscover.mockResolvedValue({ researchId: "res1" });
    researchData = {
      research: { _id: "res1", status: "completed" },
      results: [makeResult()],
    };
    renderDrawer();
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(screen.getByRole("button", { name: "Save vendor" }));
    await waitFor(() => {
      expect(calls).toHaveLength(2);
    });
    expect(calls[0]).toMatchObject({
      name: "Aqua Plumbing Lagos",
      serviceCategories: ["plumbing"],
      email: "hello@aqua.example.com",
      source: "firecrawl",
      sourceUrl: "https://aqua.example.com/",
    });
    expect(calls[1]).toEqual({ caseId: "c1", vendorId: "v9" });
    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith("Vendor saved");
    });
  });

  it("renders the empty state with a manual-add action", async () => {
    const user = userEvent.setup();
    mockDiscover.mockResolvedValue({ researchId: "res1" });
    researchData = {
      research: { _id: "res1", status: "completed" },
      results: [],
    };
    renderDrawer();
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => {
      expect(screen.getByText("No vendors found")).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("button", { name: "Add vendor manually" }),
    );
    expect(screen.getByText("Add vendor")).toBeInTheDocument();
  });

  it("renders the error state when discovery fails", async () => {
    const user = userEvent.setup();
    mockDiscover.mockRejectedValueOnce(new Error("boom"));
    renderDrawer();
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => {
      // Plain Errors carry no app code, so the generic message renders.
      expect(
        screen.getByText("Something went wrong. Check your input and retry."),
      ).toBeInTheDocument();
    });
  });
});
