import { useQuery } from "convex/react";
import { ExternalLink, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { EmptyState } from "@/components/common/EmptyState";
import { QueryErrorBoundary } from "@/components/common/ErrorBoundary";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { StatusBadge } from "@/components/common/StatusBadge";
import { VendorCard } from "@/components/vendors/VendorCard";
import { VendorFormDrawer } from "@/components/vendors/VendorFormDrawer";
import { VENDOR_CATEGORIES } from "@/components/vendors/CategoryMultiSelect";
import { useSyncStatus } from "@/hooks/useSyncUser";

type CategoryFilter = "ALL" | Doc<"vendors">["serviceCategories"][number];
type DrawerState =
  | null
  | { mode: "add" }
  | { mode: "edit"; vendor: Doc<"vendors"> };

const selectClass =
  "rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50";

function contactFor(vendor: Doc<"vendors">): string {
  return vendor.email ?? vendor.phone ?? "—";
}

export function VendorsPage() {
  const { synced } = useSyncStatus();
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("ALL");
  const [drawer, setDrawer] = useState<DrawerState>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const trimmed = debouncedSearch.trim();
  const vendors = useQuery(
    api.vendors.list,
    synced
      ? {
          ...(trimmed !== "" ? { search: trimmed } : {}),
          ...(category !== "ALL" ? { category } : {}),
        }
      : "skip",
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Vendors</h1>
        <button
          type="button"
          onClick={() => setDrawer({ mode: "add" })}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Add vendor
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search vendors…"
          aria-label="Search vendors"
          className="min-w-40 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as CategoryFilter)}
          aria-label="Filter by category"
          className={selectClass}
        >
          <option value="ALL">All categories</option>
          {VENDOR_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <QueryErrorBoundary
        fallback={(_error, reset) => (
          <ErrorState message="Could not load vendors." onRetry={reset} />
        )}
      >
        <VendorsBody
          vendors={vendors}
          onAdd={() => setDrawer({ mode: "add" })}
          onEdit={(vendor) => setDrawer({ mode: "edit", vendor })}
        />
      </QueryErrorBoundary>

      {drawer !== null && (
        <VendorFormDrawer
          open
          onClose={() => setDrawer(null)}
          mode={
            drawer.mode === "add"
              ? { kind: "add" }
              : { kind: "edit", vendor: drawer.vendor }
          }
        />
      )}
    </div>
  );
}

function VendorsBody({
  vendors,
  onAdd,
  onEdit,
}: {
  vendors: Doc<"vendors">[] | undefined;
  onAdd: () => void;
  onEdit: (vendor: Doc<"vendors">) => void;
}) {
  if (vendors === undefined) {
    return <LoadingSkeleton rows={5} />;
  }
  if (vendors.length === 0) {
    return (
      <EmptyState
        title="No vendors yet"
        description="Add one manually or discover vendors from a case."
        action={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onAdd}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Add vendor
            </button>
            <Link
              to="/cases"
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Go to cases
            </Link>
          </div>
        }
      />
    );
  }
  return (
    <>
      {/* Desktop + tablet table (location/source hidden below lg). */}
      <div className="hidden overflow-x-auto rounded-xl border md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs text-muted-foreground uppercase">
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Categories</th>
              <th className="hidden px-4 py-2.5 font-medium lg:table-cell">
                Location
              </th>
              <th className="px-4 py-2.5 font-medium">Contact</th>
              <th className="px-4 py-2.5 font-medium">Website</th>
              <th className="hidden px-4 py-2.5 font-medium lg:table-cell">
                Source
              </th>
              <th className="px-4 py-2.5 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((vendor) => (
              <tr key={vendor._id} className="border-b last:border-0">
                <td className="px-4 py-2.5 font-medium">{vendor.name}</td>
                <td className="px-4 py-2.5">
                  <span className="flex flex-wrap gap-1">
                    {vendor.serviceCategories.slice(0, 3).map((c) => (
                      <StatusBadge key={c}>{c}</StatusBadge>
                    ))}
                    {vendor.serviceCategories.length > 3 && (
                      <StatusBadge>
                        +{vendor.serviceCategories.length - 3} more
                      </StatusBadge>
                    )}
                  </span>
                </td>
                <td className="hidden px-4 py-2.5 text-muted-foreground lg:table-cell">
                  {vendor.location ?? "—"}
                </td>
                <td className="px-4 py-2.5">{contactFor(vendor)}</td>
                <td className="px-4 py-2.5">
                  {vendor.website ? (
                    <a
                      href={vendor.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${vendor.name} website`}
                      className="rounded-md p-1.5 hover:bg-accent"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="hidden px-4 py-2.5 lg:table-cell">
                  <StatusBadge>
                    {vendor.source === "manual" ? "Manual" : "Firecrawl"}
                  </StatusBadge>
                </td>
                <td className="px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => onEdit(vendor)}
                    aria-label={`Edit ${vendor.name}`}
                    className="rounded-md p-1.5 hover:bg-accent"
                  >
                    <Pencil className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile cards. */}
      <div className="flex flex-col gap-3 md:hidden">
        {vendors.map((vendor) => (
          <VendorCard
            key={vendor._id}
            vendor={vendor}
            onEdit={() => onEdit(vendor)}
          />
        ))}
      </div>
    </>
  );
}
