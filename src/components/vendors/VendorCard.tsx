import { ExternalLink, Pencil } from "lucide-react";
import type { Doc } from "../../../convex/_generated/dataModel";
import { StatusBadge } from "@/components/common/StatusBadge";

export type VendorSummary = Pick<
  Doc<"vendors">,
  "_id" | "name" | "serviceCategories" | "email" | "phone" | "website"
> & {
  location?: string;
};

// Shared vendor card: mobile cards on the Vendors screen and the linked
// vendor display in Case Detail. Contact fields render as plain text.
export function VendorCard({
  vendor,
  onEdit,
  onOpenCases,
}: {
  vendor: VendorSummary;
  onEdit?: () => void;
  onOpenCases?: () => void;
}) {
  const contact = vendor.email ?? vendor.phone;
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{vendor.name}</p>
        <div className="flex shrink-0 items-center gap-1">
          {vendor.website && (
            <a
              href={vendor.website}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${vendor.name} website`}
              className="rounded-md p-2 hover:bg-accent"
            >
              <ExternalLink className="size-4" />
            </a>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit ${vendor.name}`}
              className="rounded-md p-2 hover:bg-accent"
            >
              <Pencil className="size-4" />
            </button>
          )}
        </div>
      </div>
      <p className="flex flex-wrap gap-1">
        {vendor.serviceCategories.slice(0, 3).map((category) => (
          <StatusBadge key={category}>{category}</StatusBadge>
        ))}
        {vendor.serviceCategories.length > 3 && (
          <StatusBadge>
            +{vendor.serviceCategories.length - 3} more
          </StatusBadge>
        )}
      </p>
      <p className="text-sm text-muted-foreground">
        {[contact, vendor.location].filter(Boolean).join(" · ") || "No contact details"}
      </p>
      {onOpenCases && (
        <button
          type="button"
          onClick={onOpenCases}
          className="self-start rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
        >
          Open related cases
        </button>
      )}
    </div>
  );
}
