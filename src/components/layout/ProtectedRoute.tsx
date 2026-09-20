import { useAuth } from "@clerk/clerk-react";
import { Navigate, useLocation } from "react-router-dom";
import { LoadingSkeleton as LoadingSkeletonRows } from "@/components/common/LoadingSkeleton";

export function LoadingSkeleton() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4">
      <LoadingSkeletonRows rows={4} />
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
