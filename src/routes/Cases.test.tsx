import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CasesPage } from "./Cases";

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockMutate = vi.hoisted(() => vi.fn());

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
    title: "Linked case",
    description: " linked description",
    status: "IN_PROGRESS",
    priority: "HIGH",
    category: "plumbing",
    aiTriageStatus: "not_started",
    lastActivityAt: 100,
    reopenCount: 0,
    locationUnknown: false,
    createdBy: "u1",
    createdAt: 90,
    updatedAt: 100,
    ...overrides,
  };
}

const LINKED = makeCase({ _id: "c1", vendorId: "v1" });
const OTHER = makeCase({
  _id: "c2",
  caseNumber: 2,
  title: "Other case",
  vendorId: undefined,
});

beforeEach(() => {
  mockUseQuery.mockReset();
  mockMutate.mockReset();
  mockUseQuery.mockImplementation((_fn: unknown, args: unknown) => {
    if (args === "skip") {
      return undefined;
    }
    if (
      typeof args === "object" &&
      args !== null &&
      "pageSize" in args
    ) {
      return { cases: [LINKED, OTHER], nextCursor: null };
    }
    return [];
  });
});

function renderPage(state: unknown = null) {
  return render(
    <MemoryRouter
      initialEntries={[
        state === null ? "/cases" : { pathname: "/cases", state },
      ]}
    >
      <CasesPage />
    </MemoryRouter>,
  );
}

describe("CasesPage vendor filter", () => {
  it("shows all cases without router state", () => {
    renderPage();
    expect(screen.getAllByText("Linked case").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Other case").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Vendor:/)).not.toBeInTheDocument();
  });

  it("honors an initial vendor filter from router state", () => {
    renderPage({ vendorId: "v1", vendorName: "Aqua Plumbing" });
    expect(screen.getByText("Vendor: Aqua Plumbing")).toBeInTheDocument();
    expect(screen.getAllByText("Linked case").length).toBeGreaterThan(0);
    expect(screen.queryByText("Other case")).not.toBeInTheDocument();
  });

  it("clearing the vendor filter restores all cases", async () => {
    const user = userEvent.setup();
    renderPage({ vendorId: "v1", vendorName: "Aqua Plumbing" });
    expect(screen.queryByText("Other case")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Clear vendor filter" }),
    );
    expect(screen.getAllByText("Other case").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Vendor:/)).not.toBeInTheDocument();
  });
});
