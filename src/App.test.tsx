import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const authState = vi.hoisted(() => ({
  isLoaded: true,
  isSignedIn: false,
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => authState,
  ClerkProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  SignIn: () => <div data-testid="clerk-sign-in" />,
  SignUp: () => <div data-testid="clerk-sign-up" />,
  UserButton: () => <div data-testid="user-button" />,
}));

vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>();
  return {
    ...mod,
    useQuery: () => undefined,
    useMutation: () => () => Promise.resolve(),
  };
});

beforeEach(() => {
  authState.isLoaded = true;
  authState.isSignedIn = false;
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App routing", () => {
  it("redirects unauthenticated visitors to /sign-in", () => {
    renderAt("/overview");
    expect(screen.getByTestId("clerk-sign-in")).toBeInTheDocument();
  });

  it("redirects / to /sign-in when unauthenticated", () => {
    renderAt("/");
    expect(screen.getByTestId("clerk-sign-in")).toBeInTheDocument();
  });

  it("redirects signed-in users away from /sign-in", () => {
    authState.isSignedIn = true;
    const { container } = renderAt("/sign-in");
    expect(screen.queryByTestId("clerk-sign-in")).not.toBeInTheDocument();
    expect(container.querySelector("aside")).not.toBeNull();
  });

  it("renders the app shell sidebar for signed-in users", () => {
    authState.isSignedIn = true;
    const { container } = renderAt("/overview");
    expect(container.querySelector("aside")).not.toBeNull();
    expect(container.querySelector("main")).not.toBeNull();
  });
});
