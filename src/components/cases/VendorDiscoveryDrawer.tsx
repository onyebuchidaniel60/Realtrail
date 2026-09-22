import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { ErrorState } from "@/components/common/ErrorState";
import { toast } from "@/components/common/toast";
import { errorMessage } from "@/components/cases/dialogs/dialogUtils";
import { RankBadge } from "@/components/vendors/RankBadge";
import { VendorFormDrawer } from "@/components/vendors/VendorFormDrawer";

type ResearchResult = Doc<"vendorResearchResults">;

function ResultCard({
  result,
  caseCategory,
  caseId,
  onSaved,
}: {
  result: ResearchResult;
  caseCategory: Doc<"cases">["category"];
  caseId: Id<"cases">;
  onSaved: () => void;
}) {
  const saveVendor = useMutation(api.vendors.save);
  const setVendor = useMutation(api.cases.mutations.setVendor);
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) {
    return null;
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { vendorId } = await saveVendor({
        name: result.providerName,
        serviceCategories: [caseCategory],
        email: result.email,
        phone: result.phone,
        website: result.website,
        location: result.location,
        source: "firecrawl",
        sourceUrl: result.sourceUrl,
      });
      // Two separate mutations: if linking fails the vendor still
      // exists unlinked (known limitation, see handoff). Surface it
      // loudly rather than silently closing.
      try {
        await setVendor({ caseId, vendorId });
      } catch (linkErr) {
        toast.error(`Vendor saved but not linked: ${errorMessage(linkErr)}`);
        return;
      }
      toast.success("Vendor saved");
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const host = (() => {
    try {
      return new URL(result.sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      return result.sourceUrl;
    }
  })();

  return (
    <article className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold">{result.providerName}</p>
        <RankBadge band={result.rankBand} />
      </div>
      <a
        href={result.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-muted-foreground underline"
      >
        {host}
      </a>
      {(result.email ?? result.phone) && (
        <p className="text-sm">
          {[result.email, result.phone].filter(Boolean).join(" · ")}
        </p>
      )}
      {result.location && (
        <p className="text-sm text-muted-foreground">{result.location}</p>
      )}
      {result.evidence && (
        <p className="text-sm text-muted-foreground">
          {result.evidence.slice(0, 200)}
        </p>
      )}
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Save vendor
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          disabled={saving}
          className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
    </article>
  );
}

export function VendorDiscoveryDrawer({
  record,
  open,
  onClose,
}: {
  record: Doc<"cases">;
  open: boolean;
  onClose: () => void;
}) {
  const discover = useAction(api.vendors.discover.discover);
  const [refinement, setRefinement] = useState("");
  const [researchId, setResearchId] = useState<Id<"vendorResearch"> | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const research = useQuery(
    api.vendors.research.getResearch,
    open && researchId !== null ? { researchId } : "skip",
  );

  async function handleSearch() {
    setPending(true);
    setActionError(null);
    try {
      const trimmed = refinement.trim();
      const result = await discover({
        caseId: record._id,
        ...(trimmed !== "" ? { refinement: trimmed.slice(0, 80) } : {}),
      });
      setResearchId(result.researchId);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const results = research?.results ?? [];

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent
          side="right"
          className="flex w-full flex-col overflow-y-auto sm:max-w-lg"
        >
          <SheetHeader>
            <SheetTitle>Find a vendor</SheetTitle>
            <SheetDescription>
              Search the web for providers matching this case. Results are
              advisory — review before saving.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-4 px-4 pb-4">
            <div className="flex gap-2">
              <input
                value={refinement}
                onChange={(e) => setRefinement(e.target.value)}
                placeholder="Add more detail (optional)"
                aria-label="Search refinement"
                maxLength={80}
                className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={handleSearch}
                disabled={pending}
                className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                Search
              </button>
            </div>

            {pending && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  Searching for vendors…
                </p>
                <LoadingSkeleton rows={3} />
              </div>
            )}

            {actionError !== null && !pending && (
              <ErrorState message={actionError} onRetry={handleSearch} />
            )}

            {!pending &&
              actionError === null &&
              researchId !== null &&
              research !== undefined && (
                <>
                  {results.length === 0 ? (
                    <EmptyState
                      title="No vendors found"
                      description="Try a more specific search or add one manually."
                      action={
                        <button
                          type="button"
                          onClick={() => setManualOpen(true)}
                          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
                        >
                          Add vendor manually
                        </button>
                      }
                    />
                  ) : (
                    <div className="flex flex-col gap-3">
                      {results.map((result) => (
                        <ResultCard
                          key={result._id}
                          result={result}
                          caseCategory={record.category}
                          caseId={record._id}
                          onSaved={onClose}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
          </div>
        </SheetContent>
      </Sheet>

      {manualOpen && (
        <VendorFormDrawer
          open
          onClose={() => setManualOpen(false)}
          mode={{ kind: "add" }}
        />
      )}
    </>
  );
}
