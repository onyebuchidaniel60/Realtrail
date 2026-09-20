import { ClerkProvider } from "@clerk/clerk-react";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { useConvexAuth } from "./lib/useConvexAuth";

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;
const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string | undefined;

// Full provider tree only when both keys are real. Until Phase 1.3-B
// replaces the placeholder key, the app renders a static fallback so the
// build and smoke tests stay green.
const useFullTree =
  CLERK_KEY !== undefined &&
  !CLERK_KEY.includes("PLACEHOLDER") &&
  CONVEX_URL !== undefined;

const root = createRoot(document.getElementById("root")!);

if (useFullTree && CLERK_KEY && CONVEX_URL) {
  const convex = new ConvexReactClient(CONVEX_URL);
  root.render(
    <StrictMode>
      <ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/sign-in">
        <ConvexProviderWithAuth client={convex} useAuth={useConvexAuth}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ConvexProviderWithAuth>
      </ClerkProvider>
    </StrictMode>,
  );
} else {
  root.render(
    <StrictMode>
      <main className="flex min-h-svh flex-col items-center justify-center gap-2">
        <h1 className="text-4xl font-semibold">Realtrail</h1>
        <p className="text-muted-foreground">
          Estate operations control center
        </p>
        <p className="text-sm text-muted-foreground">
          Missing frontend configuration. Set VITE_CLERK_PUBLISHABLE_KEY and
          VITE_CONVEX_URL.
        </p>
      </main>
    </StrictMode>,
  );
}
