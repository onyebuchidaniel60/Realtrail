import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VendorsPage } from "./Vendors";

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

function makeVendor(overrides: Record<string, unknown> = {}) {
  return {
    _id: "v1",
    _creationTime: 1,
    workspaceId: "w1",
    name: "Aqua Plumbing",
    serviceCategories: ["plumbing", "water"],
    email: "hello@aqua.example.com",
    phone: "+234 801 000 0001",
    website: "https://aqua.example.com/",
    location: "Lagos",
    source: "manual",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

let vendorRows: unknown[] = [makeVendor()];
let vendorsPending = false;
let capturedListArgs: unknown[] = [];

function mockVendorQueries() {
  mockUseQuery.mockImplementation((_fn: unknown, args: unknown) => {
    if (args === "skip") {
      return undefined;
    }
    capturedListArgs.push(args);
    if (vendorsPending) {
      return undefined;
    }
    return vendorRows;
  });
}

beforeEach(() => {
  mockUseQuery.mockReset();
  mockMutate.mockReset();
  mockMutate.mockResolvedValue({ vendorId: "v1" });
  vendorRows = [makeVendor()];
  vendorsPending = false;
  capturedListArgs = [];
  mockVendorQueries();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <VendorsPage />
    </MemoryRouter>,
  );
}

describe("VendorsPage", () => {
  it("renders the empty state when no vendors exist", () => {
    vendorRows = [];
    renderPage();
    expect(screen.getByText("No vendors yet")).toBeInTheDocument();
    // Header button + empty-state action button.
    expect(
      screen.getAllByRole("button", { name: "Add vendor" }),
    ).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Go to cases" })).toHaveAttribute(
      "href",
      "/cases",
    );
  });

  it("renders the vendor table with expected columns", () => {
    renderPage();
    const table = document.querySelector("table");
    expect(table).not.toBeNull();
    const headers = Array.from(table!.querySelectorAll("th")).map((th) =>
      th.textContent,
    );
    expect(headers).toEqual(
      expect.arrayContaining([
        "Name",
        "Categories",
        "Location",
        "Contact",
        "Website",
        "Source",
      ]),
    );
    expect(
      within(table as HTMLElement).getByText("Aqua Plumbing"),
    ).toBeInTheDocument();
  });

  it("truncates long category lists with a +N badge", () => {
    vendorRows = [
      makeVendor({
        serviceCategories: ["plumbing", "water", "hvac", "electrical"],
      }),
    ];
    renderPage();
    expect(screen.getAllByText("+1 more").length).toBeGreaterThan(0);
  });

  it("renders mobile cards with contact details", () => {
    renderPage();
    // Mobile cards render the contact line; the table shows it too, so
    // assert presence rather than uniqueness.
    expect(
      screen.getAllByText("hello@aqua.example.com").length,
    ).toBeGreaterThan(0);
  });

  it("search input filters the list query", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText("Search vendors"), "aqua");
    await waitFor(() => {
      expect(capturedListArgs.at(-1)).toMatchObject({ search: "aqua" });
    });
  });

  it("category filter narrows the list query", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.selectOptions(screen.getByLabelText("Filter by category"), [
      "electrical",
    ]);
    await waitFor(() => {
      expect(capturedListArgs.at(-1)).toMatchObject({
        category: "electrical",
      });
    });
  });

  it("Add vendor opens the drawer", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Add vendor" }));
    expect(
      screen.getByRole("heading", { name: "Add vendor" }),
    ).toBeInTheDocument();
  });

  it("edit opens the drawer prefilled", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(
      screen.getAllByRole("button", { name: "Edit Aqua Plumbing" })[0],
    );
    expect(screen.getByText("Edit vendor")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Aqua Plumbing");
  });

  it("renders a loading skeleton while pending", () => {
    vendorsPending = true;
    renderPage();
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });
});
