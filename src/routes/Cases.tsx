import { useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import type { CaseStatus, Category } from "../../convex/cases/stateMachine";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { QueryErrorBoundary } from "@/components/common/ErrorBoundary";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { MetricCard } from "@/components/common/MetricCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { CaseCardList } from "@/components/cases/CaseCard";
import { CaseDetail, CaseDetailNotFound } from "@/components/cases/CaseDetail";
import { CaseTable } from "@/components/cases/CaseTable";
import { NewCaseDialog } from "@/components/cases/NewCaseDialog";
import { useSyncStatus } from "@/hooks/useSyncUser";

type StatusFilter = "ALL" | CaseStatus;
type PriorityFilter = "ALL" | "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type AssigneeFilter = "ALL" | "me" | "unassigned";
type SortMode = "recent" | "priority" | "newest";

const STATUSES: CaseStatus[] = [
  "NEW",
  "TRIAGED",
  "IN_PROGRESS",
  "VENDOR_CONTACTED",
  "SCHEDULED",
  "WORK_IN_PROGRESS",
  "AWAITING_CONFIRMATION",
  "RESOLVED",
  "CLOSED",
];

const PRIORITIES: PriorityFilter[] = ["URGENT", "HIGH", "MEDIUM", "LOW"];

const CATEGORIES = [
  "plumbing",
  "electrical",
  "power_generator",
  "water",
  "hvac",
  "security_access",
  "cleaning",
  "structural",
  "appliance",
  "common_area",
  "other",
];

const PRIORITY_RANK: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

const selectClass =
  "rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50";

function isNotFoundError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "data" in err &&
    (err as { data?: { code?: string } }).data?.code === "NOT_FOUND"
  );
}

// Initial vendor filter from router state (Vendors → "Open related
// cases"). Local state only — no URL persistence (deferred from 3-B-1).
function initialVendorFilter(state: unknown): {
  id: string;
  name: string;
} | null {
  if (typeof state !== "object" || state === null) {
    return null;
  }
  const { vendorId, vendorName } = state as {
    vendorId?: unknown;
    vendorName?: unknown;
  };
  if (typeof vendorId !== "string" || vendorId === "") {
    return null;
  }
  return {
    id: vendorId,
    name:
      typeof vendorName === "string" && vendorName !== ""
        ? vendorName
        : "Selected vendor",
  };
}

export function CasesPage() {
  const { synced, userId } = useSyncStatus();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const caseIdParam = searchParams.get("caseId");

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [priority, setPriority] = useState<PriorityFilter>("ALL");
  const [propertyId, setPropertyId] = useState<string>("ALL");
  const [category, setCategory] = useState<"ALL" | Category>("ALL");
  const [vendorFilter, setVendorFilter] = useState(() =>
    initialVendorFilter(location.state),
  );
  const [assignee, setAssignee] = useState<AssigneeFilter>("ALL");
  const [sort, setSort] = useState<SortMode>("recent");
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const [invalidCase, setInvalidCase] = useState(false);
  const [accumulated, setAccumulated] = useState<Doc<"cases">[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [prevSignature, setPrevSignature] = useState<string | null>(null);
  const [mergedToken, setMergedToken] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const filterSignature = JSON.stringify({
    search: debouncedSearch,
    status,
    priority,
    propertyId,
    category,
    assignee,
  });

  const listResult = useQuery(
    api.cases.queries.list,
    synced
      ? {
          ...(debouncedSearch.trim() !== ""
            ? { search: debouncedSearch.trim() }
            : {}),
          ...(status !== "ALL" ? { status } : {}),
          ...(priority !== "ALL" ? { priority } : {}),
          ...(propertyId !== "ALL"
            ? { propertyId: propertyId as Id<"properties"> }
            : {}),
          ...(category !== "ALL" ? { category } : {}),
          ...(assignee === "me" && userId
            ? { assigneeId: userId }
            : {}),
          pageSize: 25,
          ...(cursor !== undefined ? { cursor } : {}),
        }
      : "skip",
  );

  const properties = useQuery(api.properties.list, synced ? {} : "skip");

  // Pagination accumulation by adjusting state during render (the
  // sanctioned alternative to reset/merge effects): on filter change, drop
  // accumulated pages and the cursor; otherwise append each fresh page once,
  // keyed by filter signature + cursor. The _id dedupe also guards
  // StrictMode double-render.
  if (prevSignature !== filterSignature) {
    setPrevSignature(filterSignature);
    setMergedToken(null);
    setAccumulated([]);
    setCursor(undefined);
  } else if (listResult) {
    const token = `${filterSignature}|${cursor ?? "first"}`;
    if (mergedToken !== token) {
      setMergedToken(token);
      setAccumulated((prev) => {
        const seen = new Set(prev.map((c) => c._id));
        const fresh = listResult.cases.filter((c) => !seen.has(c._id));
        return fresh.length === 0 ? prev : [...prev, ...fresh];
      });
    }
  }

  // Metrics derive from an unfiltered workspace-bounded page (pageSize 100).
  // NOTE: counts reflect the loaded page, not a server aggregate. The spec
  // lists more metrics (needs attention, waiting on vendor, overdue) that
  // depend on Phase 5+ data; the strip expands in later phases.
  const metricsResult = useQuery(
    api.cases.queries.list,
    synced ? { pageSize: 100 } : "skip",
  );

  const propertyNames = useMemo(
    () => new Map((properties ?? []).map((p) => [p._id, p.name] as const)),
    [properties],
  );

  const metrics = useMemo(() => {
    const all = metricsResult?.cases ?? [];
    const open = all.filter((c) => c.status !== "CLOSED");
    return {
      total: all.length,
      open: open.length,
      urgent: open.filter((c) => c.priority === "URGENT").length,
      awaiting: all.filter((c) => c.status === "AWAITING_CONFIRMATION").length,
    };
  }, [metricsResult]);

  const visible = useMemo(() => {
    let items = accumulated;
    if (vendorFilter !== null) {
      items = items.filter((c) => c.vendorId === vendorFilter.id);
    }
    if (assignee === "unassigned") {
      items = items.filter((c) => !c.assigneeId);
    }
    if (sort === "priority") {
      items = [...items].sort(
        (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
      );
    } else if (sort === "newest") {
      items = [...items].sort((a, b) => b.createdAt - a.createdAt);
    }
    return items;
  }, [accumulated, assignee, sort, vendorFilter]);

  const hasActiveFilters =
    debouncedSearch.trim() !== "" ||
    status !== "ALL" ||
    priority !== "ALL" ||
    propertyId !== "ALL" ||
    category !== "ALL" ||
    vendorFilter !== null ||
    assignee !== "ALL";

  function clearFilters() {
    setSearchInput("");
    setDebouncedSearch("");
    setStatus("ALL");
    setPriority("ALL");
    setPropertyId("ALL");
    setCategory("ALL");
    setVendorFilter(null);
    setAssignee("ALL");
    setSort("recent");
  }

  function selectCase(id: Id<"cases">) {
    setInvalidCase(false);
    setSearchParams({ caseId: id });
  }

  function clearCase() {
    setSearchParams({});
  }

  function handleInvalidCase() {
    setSearchParams({});
    setInvalidCase(true);
  }

  const showDetail = caseIdParam !== null && !invalidCase;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Cases</h1>
        <button
          type="button"
          onClick={() => setNewCaseOpen(true)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          New case
        </button>
      </header>

      <div className="flex flex-col gap-6 xl:flex-row">
        <section
          className={
            showDetail
              ? "hidden flex-1 flex-col gap-6 xl:flex"
              : "flex flex-1 flex-col gap-6"
          }
        >
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <MetricCard label="All cases" value={metrics.total} />
            <MetricCard label="Open" value={metrics.open} />
            <MetricCard
              label="Urgent"
              value={metrics.urgent}
              variant={metrics.urgent > 0 ? "danger" : "default"}
            />
            <MetricCard
              label="Awaiting confirmation"
              value={metrics.awaiting}
              variant={metrics.awaiting > 0 ? "warning" : "default"}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search cases…"
              aria-label="Search cases"
              className="min-w-40 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              aria-label="Filter by status"
              className={selectClass}
            >
              <option value="ALL">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as PriorityFilter)}
              aria-label="Filter by priority"
              className={selectClass}
            >
              <option value="ALL">All priorities</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              aria-label="Filter by property"
              className={selectClass}
            >
              <option value="ALL">All properties</option>
              {(properties ?? []).map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as "ALL" | Category)
              }
              aria-label="Filter by category"
              className={selectClass}
            >
              <option value="ALL">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value as AssigneeFilter)}
              aria-label="Filter by assignee"
              className={selectClass}
            >
              <option value="ALL">All assignees</option>
              {/* TODO(member directory): full member list needs a member-list
                  query that does not exist yet. */}
              {userId && <option value="me">Assigned to me</option>}
              <option value="unassigned">Unassigned</option>
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              aria-label="Sort cases"
              className={selectClass}
            >
              <option value="recent">Recent activity</option>
              <option value="priority">Priority</option>
              <option value="newest">Newest</option>
            </select>
          </div>

          {/* TODO(filters): persist filter state in the URL for deep-linking
              filtered views. Currently local component state only. */}
          {vendorFilter !== null && (
            <div className="flex items-center gap-2 text-sm">
              <StatusBadge>Vendor: {vendorFilter.name}</StatusBadge>
              <button
                type="button"
                onClick={() => setVendorFilter(null)}
                className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
              >
                Clear vendor filter
              </button>
            </div>
          )}
          {listResult === undefined ? (
            <LoadingSkeleton rows={5} />
          ) : visible.length === 0 ? (
            hasActiveFilters ? (
              <EmptyState
                title="No cases match your filters"
                description="Try adjusting or clearing the filters."
                action={
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
                  >
                    Clear filters
                  </button>
                }
              />
            ) : (
              <EmptyState
                title="No cases yet"
                description="Create your first case to start tracking estate issues."
                action={
                  <button
                    type="button"
                    onClick={() => setNewCaseOpen(true)}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                  >
                    Create your first case
                  </button>
                }
              />
            )
          ) : (
            <>
              <CaseTable
                cases={visible}
                propertyNames={propertyNames}
                selectedId={caseIdParam as Id<"cases"> | null}
                onSelect={selectCase}
              />
              <CaseCardList
                cases={visible}
                propertyNames={propertyNames}
                selectedId={caseIdParam as Id<"cases"> | null}
                onSelect={selectCase}
              />
              {listResult.nextCursor !== null && (
                <button
                  type="button"
                  onClick={() => setCursor(listResult.nextCursor ?? undefined)}
                  className="self-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
                >
                  Load more
                </button>
              )}
            </>
          )}
        </section>

        {showDetail && (
          <aside className="xl:w-[480px] xl:shrink-0">
            <QueryErrorBoundary
              key={caseIdParam}
              fallback={(error, reset) =>
                isNotFoundError(error) ? (
                  <NotFoundReporter onInvalid={handleInvalidCase} />
                ) : (
                  <ErrorState
                    message="Could not load this case."
                    onRetry={reset}
                  />
                )
              }
            >
              <CaseDetail
                caseId={caseIdParam as Id<"cases">}
                onClose={clearCase}
              />
            </QueryErrorBoundary>
          </aside>
        )}

        {invalidCase && (
          <aside className="xl:w-[480px] xl:shrink-0">
            <CaseDetailNotFound
              onBack={() => {
                setInvalidCase(false);
                clearCase();
              }}
            />
          </aside>
        )}
      </div>

      {newCaseOpen && (
        <NewCaseDialog open onClose={() => setNewCaseOpen(false)} />
      )}
    </div>
  );
}

function NotFoundReporter({ onInvalid }: { onInvalid: () => void }) {
  useEffect(() => {
    onInvalid();
  }, [onInvalid]);
  return null;
}
