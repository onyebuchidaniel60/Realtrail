import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VendorFormDrawer } from "./VendorFormDrawer";

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
    useMutation: () => mockMutate,
  };
});

vi.mock("@/components/common/toast", () => ({ toast: mockToast }));

const VENDOR = {
  _id: "v1",
  workspaceId: "w1",
  name: "Aqua Plumbing",
  serviceCategories: ["plumbing", "water"],
  email: "hello@aqua.example.com",
  phone: "+234 801 000 0001",
  website: "https://aqua.example.com/",
  location: "Lagos",
  notes: "Reliable.",
  source: "manual",
} as never;

beforeEach(() => {
  mockMutate.mockReset();
  mockToast.success.mockReset();
  mockToast.error.mockReset();
  mockMutate.mockResolvedValue({ vendorId: "v1" });
});

function renderDrawer(mode: "add" | "edit" = "add") {
  return render(
    <MemoryRouter>
      <VendorFormDrawer
        open
        onClose={() => {}}
        mode={mode === "add" ? { kind: "add" } : { kind: "edit", vendor: VENDOR }}
      />
    </MemoryRouter>,
  );
}

describe("VendorFormDrawer", () => {
  it("renders empty fields in add mode", () => {
    renderDrawer("add");
    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.getByLabelText("Email")).toHaveValue("");
  });

  it("prefills fields in edit mode", () => {
    renderDrawer("edit");
    expect(screen.getByLabelText("Name")).toHaveValue("Aqua Plumbing");
    expect(screen.getByLabelText("Email")).toHaveValue(
      "hello@aqua.example.com",
    );
    expect(screen.getByLabelText("Website")).toHaveValue(
      "https://aqua.example.com/",
    );
  });

  it("renders inline validation errors", async () => {
    const user = userEvent.setup();
    renderDrawer("add");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      screen.getByText("Name must be 1..120 characters."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Pick 1 to 5 service categories."),
    ).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("rejects a website without a scheme", async () => {
    const user = userEvent.setup();
    renderDrawer("add");
    await user.type(screen.getByLabelText("Name"), "Aqua");
    await user.click(screen.getByLabelText("plumbing"));
    await user.type(screen.getByLabelText("Website"), "aqua.example.com");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      screen.getByText("Website must start with https:// or http://."),
    ).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("save calls vendors.save with manual source in add mode", async () => {
    const user = userEvent.setup();
    let captured: unknown = null;
    mockMutate.mockImplementation(async (args: unknown) => {
      captured = args;
      return { vendorId: "v9" };
    });
    renderDrawer("add");
    await user.type(screen.getByLabelText("Name"), "Bolt Electric");
    await user.click(screen.getByLabelText("electrical"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(captured).toMatchObject({
        name: "Bolt Electric",
        serviceCategories: ["electrical"],
        source: "manual",
      });
    });
    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith("Vendor saved");
    });
  });

  it("save calls vendors.update in edit mode", async () => {
    const user = userEvent.setup();
    let captured: unknown = null;
    mockMutate.mockImplementation(async (args: unknown) => {
      captured = args;
      return { vendorId: "v1" };
    });
    renderDrawer("edit");
    await user.clear(screen.getByLabelText("Phone"));
    await user.type(screen.getByLabelText("Phone"), "+234 802 000 0002");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(captured).toMatchObject({
        vendorId: "v1",
        phone: "+234 802 000 0002",
      });
    });
    expect(captured as Record<string, unknown>).not.toHaveProperty("source");
  });

  it("cancel closes without calling any mutation", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <VendorFormDrawer open onClose={onClose} mode={{ kind: "add" }} />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(mockMutate).not.toHaveBeenCalled();
  });
});
