import { useClerk, useUser } from "@clerk/clerk-react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { ErrorState } from "@/components/common/ErrorState";
import { QueryErrorBoundary } from "@/components/common/ErrorBoundary";
import { LoadingSkeleton as PageSkeleton } from "@/components/layout/ProtectedRoute";
import { IntegrationStatusRow } from "@/components/settings/IntegrationStatusRow";
import { toast } from "@/components/common/toast";
import { useSyncStatus } from "@/hooks/useSyncUser";

type SettingsData = NonNullable<
  FunctionReturnType<typeof api.workspace.settings.getSettings>
>;

const TIMEZONE_OPTIONS = [
  "Africa/Lagos",
  "Africa/Accra",
  "Africa/Nairobi",
  "Europe/London",
  "America/New_York",
  "UTC",
];

const CURRENCY_OPTIONS = ["NGN", "USD", "EUR", "GBP", "KES", "GHS"];

const inputClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50";

function withCurrent<T extends string>(options: T[], current: T): T[] {
  return options.includes(current) ? options : [...options, current];
}

export function SettingsPage() {
  return (
    <QueryErrorBoundary
      fallback={(_error, reset) => (
        <ErrorState message="Could not load settings." onRetry={reset} />
      )}
    >
      <SettingsBody />
    </QueryErrorBoundary>
  );
}

function SettingsBody() {
  const { synced } = useSyncStatus();
  const settings = useQuery(
    api.workspace.settings.getSettings,
    synced ? {} : "skip",
  );

  if (settings === undefined) {
    return <PageSkeleton />;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Workspace preferences, integrations, and account
        </p>
      </header>
      {/* Remount per workspace so the form adopts server values once. */}
      <SettingsForm key={settings.workspace._id} initial={settings} />
    </div>
  );
}

function SettingsForm({ initial }: { initial: SettingsData }) {
  const updateWorkspace = useMutation(api.workspace.settings.updateWorkspace);
  const { user } = useUser();
  const { signOut } = useClerk();

  const [name, setName] = useState(initial.workspace.name);
  const [timezone, setTimezone] = useState(initial.workspace.timezone);
  const [currency, setCurrency] = useState(initial.workspace.currency);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const isOwner = initial.member.role === "owner";
  const dirty =
    name !== initial.workspace.name ||
    timezone !== initial.workspace.timezone ||
    currency !== initial.workspace.currency;

  async function handleSave() {
    setSaving(true);
    try {
      await updateWorkspace({ name, timezone, currency });
      toast.success("Workspace settings saved.");
    } catch {
      toast.error("Could not save settings. Check your input and retry.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } catch {
      toast.error("Could not sign out. Please retry.");
      setSigningOut(false);
    }
  }

  const timezones = withCurrent(TIMEZONE_OPTIONS, timezone);
  const currencies = withCurrent(CURRENCY_OPTIONS, currency);

  return (
    <>
      <section aria-label="Workspace" className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-medium">Workspace</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {isOwner
            ? "Estate name, timezone, and currency."
            : "Only the workspace owner can change these settings."}
        </p>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Workspace name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isOwner || saving}
              aria-label="Workspace name"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Timezone</span>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={!isOwner || saving}
              aria-label="Timezone"
              className={inputClass}
            >
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Currency</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              disabled={!isOwner || saving}
              aria-label="Currency"
              className={inputClass}
            >
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          {isOwner && (
            <div>
              <button
                type="button"
                onClick={handleSave}
                disabled={!dirty || saving}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          )}
        </div>
      </section>

      <section
        aria-label="Integrations"
        className="rounded-xl border bg-card p-6"
      >
        <h2 className="text-lg font-medium">Integrations</h2>
        <p className="mb-1 text-sm text-muted-foreground">
          Connection health for this workspace. Managed by your administrator —
          nothing secret is shown here.
        </p>
        <div className="divide-y divide-border">
          <IntegrationStatusRow
            label="Email intake"
            description="Resident and vendor mail arriving at the workspace inbox."
            status={initial.integrations.agentMailInbound}
            detail={
              initial.workspace.agentMailInboxAddress
                ? `Intake address: ${initial.workspace.agentMailInboxAddress}`
                : undefined
            }
          />
          <IntegrationStatusRow
            label="Email sending"
            description="Approved resident and vendor messages sent from Realtrail."
            status={initial.integrations.agentMailOutbound}
          />
          <IntegrationStatusRow
            label="AI triage"
            description="Automatic understanding of incoming reports."
            status={initial.integrations.openAiTriage}
          />
          <IntegrationStatusRow
            label="AI message drafts"
            description="Draft resident and vendor emails for review."
            status={initial.integrations.openAiDraft}
          />
          <IntegrationStatusRow
            label="Vendor search"
            description="Public web discovery of service providers."
            status={initial.integrations.firecrawl}
          />
          <IntegrationStatusRow
            label="Sign-in"
            description="Team authentication for this workspace."
            status={initial.integrations.clerkFrontend}
          />
        </div>
      </section>

      <section aria-label="Account" className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-medium">Account</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Signed in as {user?.fullName ?? user?.firstName ?? "your account"}
          {user?.primaryEmailAddress?.emailAddress
            ? ` · ${user.primaryEmailAddress.emailAddress}`
            : ""}
        </p>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </section>
    </>
  );
}
