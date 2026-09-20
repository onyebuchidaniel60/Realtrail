import { useAuth } from "@clerk/clerk-react";
import { Navigate, useLocation } from "react-router-dom";

export function LoadingSkeleton() {
  return (
    <main className="flex min-h-svh items-center justify-center">
      <p className="text-muted-foreground" role="status">
        Loading…
      </p>
    </main>
  );
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();

  if (!isLoaded) {
    return <LoadingSkeleton />;
  }
  if (!isSignedIn) {
    return (
      <Navigate to="/sign-in" replace state={{ from: location.pathname }} />
    );
  }
  return <>{children}</>;
}
