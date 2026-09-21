import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { LoadingSkeleton } from "@/components/layout/ProtectedRoute";
import { useSyncStatus } from "@/hooks/useSyncUser";

const TIMEZONES = [
  "Africa/Lagos",
  "Africa/Accra",
  "Africa/Nairobi",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Dubai",
  "UTC",
];

const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "NGN",
  "GHS",
  "KES",
  "ZAR",
  "EGP",
  "XOF",
  "XAF",
  "CAD",
  "AUD",
  "JPY",
  "INR",
  "AED",
];

function defaultTimezone(): string {
  try {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (local && TIMEZONES.includes(local)) {
      return local;
    }
  } catch {
    // Fall through to UTC below.
  }
  return "UTC";
}

// The initial building/unit are collected on the Properties screen.
// Property details collected here create the first property atomically
// with the workspace (single backend mutation).
export function OnboardingPage() {
  const { synced } = useSyncStatus();
  const current = useQuery(
    api.workspace.getCurrent,
    synced ? {} : "skip",
  );
  const createWorkspace = useMutation(api.workspace.create);

  const [workspaceName, setWorkspaceName] = useState("");
  const [timezone, setTimezone] = useState(defaultTimezone);
  const [currency, setCurrency] = useState("USD");
  const [propertyName, setPropertyName] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (current === undefined) {
    return <LoadingSkeleton />;
  }
  if (!current.needsOnboarding || done) {
    return <Navigate to="/overview" replace />;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);
    const localErrors: Record<string, string> = {};
    if (workspaceName.trim().length < 2 || workspaceName.trim().length > 80) {
      localErrors.workspaceName = "Estate name must be 2–80 characters.";
    }
    if (propertyName.trim().length < 2 || propertyName.trim().length > 100) {
      localErrors.propertyName = "Property name must be 2–100 characters.";
    }
    if (
      propertyAddress.trim().length < 5 ||
      propertyAddress.trim().length > 240
    ) {
      localErrors.propertyAddress =
        "Property address must be 5–240 characters.";
    }
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      return;
    }
    setSubmitting(true);
    try {
      await createWorkspace({
        workspaceName,
        timezone,
        currency,
        propertyName,
        propertyAddress,
      });
      setDone(true);
    } catch (err) {
      const code =
        typeof err === "object" && err !== null && "data" in err
          ? (err as { data?: { code?: string; field?: string } }).data?.code
          : undefined;
      const field =
        typeof err === "object" && err !== null && "data" in err
          ? (err as { data?: { code?: string; field?: string } }).data?.field
          : undefined;
      if (code === "CONFLICT") {
        setDone(true);
        return;
      }
      if (
        code === "VALIDATION_ERROR" &&
        field &&
        [
          "workspaceName",
          "timezone",
          "currency",
          "propertyName",
          "propertyAddress",
        ].includes(field)
      ) {
        setFieldErrors({ [field]: "This value was rejected. Check and retry." });
        return;
      }
      setFormError("Something went wrong. Check your input and retry.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-6 px-4">
      <div>
        <p className="text-xl font-bold tracking-tight">Realtrail</p>
        <h1 className="mt-2 text-2xl font-semibold">Set up your estate</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create your workspace to start tracking cases.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Estate / workspace name</span>
          <input
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            placeholder="e.g. Palm Grove Estate"
            className="rounded-md border bg-background px-3 py-2"
            disabled={submitting}
          />
          {fieldErrors.workspaceName && (
            <span className="text-sm text-destructive">
              {fieldErrors.workspaceName}
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Timezone</span>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="rounded-md border bg-background px-3 py-2"
            disabled={submitting}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
          {fieldErrors.timezone && (
            <span className="text-sm text-destructive">
              {fieldErrors.timezone}
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Currency</span>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="rounded-md border bg-background px-3 py-2"
            disabled={submitting}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {fieldErrors.currency && (
            <span className="text-sm text-destructive">
              {fieldErrors.currency}
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">First property name</span>
          <input
            value={propertyName}
            onChange={(e) => setPropertyName(e.target.value)}
            placeholder="e.g. Palm Grove — Block A"
            className="rounded-md border bg-background px-3 py-2"
            disabled={submitting}
          />
          {fieldErrors.propertyName && (
            <span className="text-sm text-destructive">
              {fieldErrors.propertyName}
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">First property address</span>
          <input
            value={propertyAddress}
            onChange={(e) => setPropertyAddress(e.target.value)}
            placeholder="e.g. 12 Marina Road, Lagos"
            className="rounded-md border bg-background px-3 py-2"
            disabled={submitting}
          />
          {fieldErrors.propertyAddress && (
            <span className="text-sm text-destructive">
              {fieldErrors.propertyAddress}
            </span>
          )}
        </label>
        {formError && (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create workspace"}
        </button>
      </form>
    </main>
  );
}
