import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "./Settings";

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockMutate = vi.hoisted(() => vi.fn());
const mockSignOut = vi.hoisted(() => vi.fn());

vi.mock("@clerk/clerk-react", () => ({
  useUser: () => ({
    user: {
      fullName: "Ada Owner",
      firstName: "Ada",
      primaryEmailAddress: { emailAddress: "ada@example.com" },
    },
  }),
  useClerk: () => ({ signOut: mockSignOut }),
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

vi.mock("@/components/common/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

type Role = "owner" | "manager" | "staff";

let role: Role = "owner";
let inboxAddress: string | null = "estate-123@agentmail.to";
let integrations: Record<string, string> = {
  agentMailInbound: "live",
  agentMailOutbound: "live",
  openAiTriage: "configured",
  openAiDraft: "configured",
  firecrawl: "configured",
  clerkFrontend: "configured",
};
let currentTimezone = "Africa/Lagos";
let currentCurrency = "NGN";

function mockSettingsQuery() {
  mockUseQuery.mockImplementation((_fn: unknown, args: unknown) => {
    if (args === "skip") {
      return undefined;
    }
    return {
      workspace: {
        _id: "w1",
        _creationTime: 1,
        name: "Settings Estate",
        timezone: currentTimezone,
        currency: currentCurrency,
        status: "active",
        agentMailInboxAddress: inboxAddress,
        agentMailInboxConfigured: inboxAddress !== null,
        createdAt: 1,
      },
      member: { role },
      integrations: { ...integrations },
    };
  });
}

beforeEach(() => {
  mockUseQuery.mockReset();
  mockMutate.mockReset();
  mockSignOut.mockReset();
  mockMutate.mockResolvedValue({ updated: true });
  role = "owner";
  inboxAddress = "estate-123@agentmail.to";
  integrations = {
    agentMailInbound: "live",
    agentMailOutbound: "live",
    openAiTriage: "configured",
    openAiDraft: "configured",
    firecrawl: "configured",
    clerkFrontend: "configured",
  };
  currentTimezone = "Africa/Lagos";
  currentCurrency = "NGN";
  mockSettingsQuery();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

describe("SettingsPage", () => {
  it("owner sees editable fields and a disabled-until-dirty save", () => {
    renderPage();
    expect(screen.getByLabelText("Workspace name")).toBeEnabled();
    expect(screen.getByLabelText("Timezone")).toBeEnabled();
    expect(screen.getByLabelText("Currency")).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Save changes" }),
    ).toBeDisabled();
  });

  it("non-owner sees read-only fields with the owner-only helper", () => {
    role = "manager";
    renderPage();
    expect(
      screen.getByText("Only the workspace owner can change these settings."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Workspace name")).toBeDisabled();
    expect(screen.getByLabelText("Timezone")).toBeDisabled();
    expect(screen.getByLabelText("Currency")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();
  });

  it("staff also sees the read-only helper", () => {
    role = "staff";
    renderPage();
    expect(
      screen.getByText("Only the workspace owner can change these settings."),
    ).toBeInTheDocument();
  });

  it("selects render the current workspace values", () => {
    renderPage();
    expect(screen.getByLabelText("Timezone")).toHaveValue("Africa/Lagos");
    expect(screen.getByLabelText("Currency")).toHaveValue("NGN");
    expect(screen.getByLabelText("Workspace name")).toHaveValue(
      "Settings Estate",
    );
  });

  it("renders a current value missing from the option list", () => {
    currentTimezone = "Pacific/Auckland";
    renderPage();
    expect(screen.getByLabelText("Timezone")).toHaveValue("Pacific/Auckland");
  });

  it("save enables on edit and calls updateWorkspace", async () => {
    const user = userEvent.setup();
    renderPage();
    const save = screen.getByRole("button", { name: "Save changes" });
    await user.clear(screen.getByLabelText("Workspace name"));
    await user.type(screen.getByLabelText("Workspace name"), "Renamed Estate");
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith({
        name: "Renamed Estate",
        timezone: "Africa/Lagos",
        currency: "NGN",
      });
    });
  });

  it("renders integration chips with correct statuses", () => {
    integrations = {
      agentMailInbound: "live",
      agentMailOutbound: "not_configured",
      openAiTriage: "configured",
      openAiDraft: "not_configured",
      firecrawl: "configured",
      clerkFrontend: "configured",
    };
    renderPage();
    expect(screen.getByText("Email intake")).toBeInTheDocument();
    expect(screen.getAllByText("Live")).toHaveLength(1);
    expect(screen.getAllByText("Configured")).toHaveLength(3);
    expect(screen.getAllByText("Not configured")).toHaveLength(2);
  });

  it("shows the intake address when configured and hides it otherwise", () => {
    renderPage();
    expect(
      screen.getByText("Intake address: estate-123@agentmail.to"),
    ).toBeInTheDocument();
  });

  it("hides the intake address line when no inbox is configured", () => {
    inboxAddress = null;
    integrations.agentMailInbound = "not_configured";
    integrations.agentMailOutbound = "not_configured";
    renderPage();
    expect(screen.queryByText(/Intake address:/)).not.toBeInTheDocument();
  });

  it("never renders env var names or secret-looking values", () => {
    renderPage();
    const text = document.body.textContent ?? "";
    for (const needle of [
      "OPENAI_API_KEY",
      "OPENAI_TRIAGE_MODEL",
      "OPENAI_DRAFT_MODEL",
      "FIRECRAWL_API_KEY",
      "AGENTMAIL_API_KEY",
      "AGENTMAIL_WEBHOOK_SECRET",
      "CLERK_FRONTEND_API_URL",
      "sk-",
      "whsec_",
    ]) {
      expect(text).not.toContain(needle);
    }
  });

  it("account section shows the user and signs out via Clerk", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByText(/Ada Owner/)).toBeInTheDocument();
    expect(screen.getByText(/ada@example.com/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
  });
});
