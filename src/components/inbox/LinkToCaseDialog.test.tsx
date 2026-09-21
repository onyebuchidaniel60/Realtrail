import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LinkToCaseDialog } from "./LinkToCaseDialog";

const mockMutate = vi.hoisted(() => vi.fn());
const mockUseQuery = vi.hoisted(() => vi.fn());
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

vi.mock("@/hooks/useSyncUser", () => ({
  useSyncStatus: () => ({ synced: true, userId: "u1" }),
  SyncProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/common/toast", () => ({ toast: mockToast }));

function makeCase(overrides: Record<string, unknown> = {}) {
  return {
    _id: "c1",
    caseNumber: 7,
    title: "Leaking pipe",
    status: "NEW",
    ...overrides,
  };
}

let caseRows: unknown[] = [makeCase()];
let capturedSearchArgs: unknown[] = [];

beforeEach(() => {
  mockMutate.mockReset();
  mockUseQuery.mockReset();
  mockToast.success.mockReset();
  mockToast.error.mockReset();
  mockMutate.mockResolvedValue({});
  caseRows = [makeCase()];
  capturedSearchArgs = [];
  mockUseQuery.mockImplementation((_fn: unknown, args: unknown) => {
    if (args === "skip") {
      return undefined;
    }
    capturedSearchArgs.push(args);
    return { cases: caseRows, nextCursor: null };
  });
});

function renderDialog() {
  return render(
    <MemoryRouter>
      <LinkToCaseDialog open onClose={() => {}} communicationId={"m1" as never} />
    </MemoryRouter>,
  );
}

describe("LinkToCaseDialog", () => {
  it("renders search and the case list", () => {
    renderDialog();
    expect(
      screen.getByLabelText("Search cases"),
    ).toBeInTheDocument();
    expect(screen.getByText("#7 Leaking pipe")).toBeInTheDocument();
  });

  it("selecting a case and confirming calls linkToCase with the right args", async () => {
    const user = userEvent.setup();
    let captured: unknown = null;
    mockMutate.mockImplementation(async (args: unknown) => {
      captured = args;
      return { communicationId: "m1" };
    });
    renderDialog();
    await user.click(screen.getByText("#7 Leaking pipe"));
    await user.click(screen.getByRole("button", { name: "Link to case" }));
    await waitFor(() => {
      expect(captured).toEqual({ communicationId: "m1", caseId: "c1" });
    });
    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith("Linked to #7");
    });
  });

  it("shows an empty state with a cases link when nothing matches", async () => {
    const user = userEvent.setup();
    caseRows = [];
    renderDialog();
    await user.type(screen.getByLabelText("Search cases"), "zzz-no-match");
    await waitFor(() => {
      expect(screen.getByText(/No cases match/)).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Create one first." })).toHaveAttribute(
      "href",
      "/cases",
    );
  });

  it("passes the debounced search to cases.list", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByLabelText("Search cases"), "leak");
    await waitFor(() => {
      expect(capturedSearchArgs.at(-1)).toMatchObject({ search: "leak" });
    });
  });
});
