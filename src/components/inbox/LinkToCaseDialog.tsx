import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/common/StatusBadge";
import { toast } from "@/components/common/toast";
import { errorMessage, inputClass } from "@/components/cases/dialogs/dialogUtils";
import { useSyncStatus } from "@/hooks/useSyncUser";
import { cn } from "@/lib/utils";

export function LinkToCaseDialog({
  open,
  onClose,
  communicationId,
}: {
  open: boolean;
  onClose: () => void;
  communicationId: Id<"communications">;
}) {
  const { synced } = useSyncStatus();
  const linkToCase = useMutation(api.email.mutations.linkToCase);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedId, setSelectedId] = useState<Id<"cases"> | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const trimmed = debouncedSearch.trim();
  const casesResult = useQuery(
    api.cases.queries.list,
    synced && open
      ? {
          ...(trimmed !== "" ? { search: trimmed } : {}),
          pageSize: 20,
        }
      : "skip",
  );
  const cases = casesResult?.cases ?? [];

  async function handleConfirm() {
    if (selectedId === null) {
      return;
    }
    const selected = cases.find((c) => c._id === selectedId);
    setFormError(null);
    setSubmitting(true);
    try {
      await linkToCase({ communicationId, caseId: selectedId });
      toast.success(`Linked to #${selected?.caseNumber ?? "case"}`);
      onClose();
    } catch (err) {
      const message = errorMessage(err);
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link to case</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <input
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setSelectedId(null);
            }}
            placeholder="Search by title or case number…"
            aria-label="Search cases"
            className={inputClass}
          />
          {casesResult === undefined ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Loading cases…
            </p>
          ) : cases.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No cases match.{" "}
              <Link to="/cases" className="font-medium underline">
                Create one first.
              </Link>
            </p>
          ) : (
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {cases.map((c) => (
                <li key={c._id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(c._id)}
                    aria-pressed={selectedId === c._id}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-accent/50",
                      selectedId === c._id
                        ? "border-primary bg-accent"
                        : "bg-card",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      #{c.caseNumber} {c.title}
                    </span>
                    <StatusBadge>{c.status}</StatusBadge>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting || selectedId === null}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Link to case
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
