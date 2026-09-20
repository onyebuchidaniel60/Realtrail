import { SignIn, useAuth } from "@clerk/clerk-react";
import { Navigate } from "react-router-dom";
import { LoadingSkeleton } from "@/components/layout/ProtectedRoute";

export function SignInPage() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return <LoadingSkeleton />;
  }
  if (isSignedIn) {
    return <Navigate to="/overview" replace />;
  }
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-4">
      <p className="text-xl font-bold tracking-tight">Realtrail</p>
      <SignIn routing="path" path="/sign-in" fallbackRedirectUrl="/overview" />
    </main>
  );
}
