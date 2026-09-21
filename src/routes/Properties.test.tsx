import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingPage } from "./Onboarding";
import { PropertiesPage } from "./Properties";

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
  useSyncStatus: () => ({ synced: true, userId: null }),
  SyncProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const PROP_A = {
  _id: "p1",
  _creationTime: 1,
  workspaceId: "w1",
  name: "Palm Grove",
  address: "12 Marina Road",
  city: undefined,
  country: undefined,
  timezone: "Africa/Lagos",
  active: true,
  createdAt: 1,
  updatedAt: 1,
};

const PROP_B = {
  ...PROP_A,
  _id: "p2",
  name: "Cedar Court",
  address: "5 Cedar Close",
};

const BLOCK_A = {
  _id: "b1",
  _creationTime: 1,
  workspaceId: "w1",
  propertyId: "p1",
  name: "Block A",
  code: "BLKA",
  createdAt: 1,
  updatedAt: 1,
};

const UNIT_A1 = {
  _id: "u1",
  _creationTime: 1,
  workspaceId: "w1",
  propertyId: "p1",
  buildingId: "b1",
  label: "A1",
  occupancyStatus: "occupied",
  createdAt: 1,
  updatedAt: 1,
};

function mockQueries({
  properties,
  buildings = [],
  units = [],
  onBuildingsArgs,
  onUnitsArgs,
}: {
  properties: unknown[];
  buildings?: unknown[];
  units?: unknown[];
  onBuildingsArgs?: (args: unknown) => void;
  onUnitsArgs?: (args: unknown) => void;
}) {
  mockUseQuery.mockImplementation((_fn: unknown, args: unknown) => {
    if (args === "skip") {
      return undefined;
    }
    if (typeof args === "object" && args !== null) {
      if ("propertyId" in args) {
        onBuildingsArgs?.(args);
        return buildings;
      }
      if ("buildingId" in args) {
        onUnitsArgs?.(args);
        return units;
      }
    }
    return properties;
  });
}

beforeEach(() => {
  mockUseQuery.mockReset();
  mockMutate.mockReset();
  mockMutate.mockResolvedValue({});
});

describe("PropertiesPage", () => {
  it("renders an empty state when no properties exist", () => {
    mockQueries({ properties: [] });
    render(<PropertiesPage />);
    expect(screen.getByText("No properties yet")).toBeInTheDocument();
  });

  it("renders the property list when data is present", () => {
    mockQueries({ properties: [PROP_A, PROP_B] });
    render(<PropertiesPage />);
    const list = screen.getByLabelText("Property list");
    expect(within(list).getByText("Palm Grove")).toBeInTheDocument();
    expect(within(list).getByText("Cedar Court")).toBeInTheDocument();
  });

  it("loads buildings when a property is selected", async () => {
    const user = userEvent.setup();
    const seen: unknown[] = [];
    mockQueries({
      properties: [PROP_A, PROP_B],
      buildings: [BLOCK_A],
      onBuildingsArgs: (args) => seen.push(args),
    });
    render(<PropertiesPage />);
    await user.click(screen.getByText("Cedar Court"));
    expect(seen).toContainEqual({ propertyId: "p2" });
    expect(screen.getByText("Block A")).toBeInTheDocument();
  });

  it("loads units when a building is selected", async () => {
    const user = userEvent.setup();
    const seen: unknown[] = [];
    mockQueries({
      properties: [PROP_A],
      buildings: [
        BLOCK_A,
        { ...BLOCK_A, _id: "b2", name: "Block B", code: undefined },
      ],
      units: [UNIT_A1],
      onUnitsArgs: (args) => seen.push(args),
    });
    render(<PropertiesPage />);
    await user.click(screen.getByText("Block B"));
    expect(seen).toContainEqual({ buildingId: "b2" });
  });

  it("opens the add-property drawer", async () => {
    const user = userEvent.setup();
    mockQueries({ properties: [PROP_A] });
    render(<PropertiesPage />);
    await user.click(screen.getByRole("button", { name: "Add property" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create property" }),
    ).toBeInTheDocument();
  });
});

describe("OnboardingPage", () => {
  it("submits all five fields to workspace.create", async () => {
    const user = userEvent.setup();
    let captured: unknown = null;
    mockMutate.mockImplementation(async (args: unknown) => {
      captured = args;
      return { workspaceId: "w1", propertyId: "p1" };
    });
    mockUseQuery.mockImplementation(() => ({
      workspace: null,
      member: null,
      needsOnboarding: true,
    }));
    render(
      <MemoryRouter initialEntries={["/onboarding"]}>
        <OnboardingPage />
      </MemoryRouter>,
    );
    await user.type(
      screen.getByLabelText(/Estate \/ workspace name/),
      "Palm Grove Estate",
    );
    await user.type(screen.getByLabelText(/First property name/), "Palm Grove");
    await user.type(
      screen.getByLabelText(/First property address/),
      "12 Marina Road, Lagos",
    );
    await user.click(
      screen.getByRole("button", { name: "Create workspace" }),
    );
    await waitFor(() => {
      expect(captured).toMatchObject({
        workspaceName: "Palm Grove Estate",
        timezone: expect.any(String),
        currency: expect.any(String),
        propertyName: "Palm Grove",
        propertyAddress: "12 Marina Road, Lagos",
      });
    });
  });
});
