import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useCallback } from "react";

// Adapts Clerk's useAuth to the shape Convex's ConvexProviderWithAuth
// expects. Tokens are minted from the Clerk JWT template named "convex"
// (created in Phase 1.3-B).
export function useConvexAuth() {
  const { getToken, isLoaded, isSignedIn } = useClerkAuth();
  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken?: boolean }) => {
      try {
        return (
          (await getToken({
            template: "convex",
            skipCache: forceRefreshToken,
          })) ?? null
        );
      } catch {
        return null;
      }
    },
    [getToken],
  );
  return {
    isLoading: !isLoaded,
    isAuthenticated: isSignedIn ?? false,
    fetchAccessToken,
  };
}
