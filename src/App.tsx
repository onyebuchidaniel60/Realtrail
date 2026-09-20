import { useAuth } from "@clerk/clerk-react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import {
  LoadingSkeleton,
  ProtectedRoute,
} from "./components/layout/ProtectedRoute";
import { ActivityPage } from "./routes/Activity";
import { CasesPage } from "./routes/Cases";
import { InboxPage } from "./routes/Inbox";
import { OnboardingPage } from "./routes/Onboarding";
import { OverviewPage } from "./routes/Overview";
import { PropertiesPage } from "./routes/Properties";
import { SettingsPage } from "./routes/Settings";
import { SignInPage } from "./routes/SignIn";
import { SignUpPage } from "./routes/SignUp";
import { TasksPage } from "./routes/Tasks";
import { VendorsPage } from "./routes/Vendors";

function RootRedirect() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) {
    return <LoadingSkeleton />;
  }
  return <Navigate to={isSignedIn ? "/overview" : "/sign-in"} replace />;
}

function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/sign-up" element={<SignUpPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/cases" element={<CasesPage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/properties" element={<PropertiesPage />} />
        <Route path="/vendors" element={<VendorsPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
