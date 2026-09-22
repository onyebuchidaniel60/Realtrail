import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { StatusBadge, type StatusVariant } from "@/components/common/StatusBadge";

type CommunicationRow = {
  _id: Id<"communications">;
  direction: Doc<"communications">["direction"];
  status: Doc<"communications">["status"];
  fromEmail: string;
  toEmails: string[];
  subject: string;
  textBody: string;
  aiDraftSource: boolean;
  participantType: Doc<"communications">["participantType"];
};

function statusChip(status: CommunicationRow["status"]): {
  variant: StatusVariant;
  label: string;
} {
  switch (status) {
    case "sent":
      return { variant: "success", label: "Sent" };
    case "failed":
      return { variant: "danger", label: "Failed" };
    case "send_uncertain":
      return { variant: "warning", label: "Needs review" };
    case "draft":
      return { variant: "default", label: "Draft" };
    case "pending_send":
      return { variant: "default", label: "Queued" };
    case "sending":
      return { variant: "default", label: "Sending" };
    default:
      return { variant: "default", label: "Received" };
  }
}

function CommunicationItem({
  row,
  onOpenDraft,
}: {
  row: CommunicationRow;
  onOpenDraft: (draft: {
    id: Id<"communications">;
    participantType: CommunicationRow["participantType"];
    toEmail: string;
  }) => void;
}) {
  const chip = statusChip(row.status);
  return (
    <li className="flex flex-col gap-1.5 rounded-xl border bg-card p-4">
      <p className="flex flex-wrap items-center gap-2">
        <StatusBadge>
          {row.direction === "inbound" ? "Inbound" : "Outbound"}
        </StatusBadge>
        <StatusBadge variant={chip.variant}>{chip.label}</StatusBadge>
        {row.aiDraftSource && <StatusBadge>AI-generated</StatusBadge>}
      </p>
      <p className="text-sm font-medium">{row.subject}</p>
      <p className="text-xs text-muted-foreground">
        {row.fromEmail} → {row.toEmails.join(", ") || "—"}
      </p>
      {/* Plain text by construction: React escapes content, and no HTML
          is ever interpreted here (AGENTS.md §8/§11). */}
      <p className="text-sm whitespace-pre-wrap">{row.textBody}</p>
      {row.status === "draft" && (
        <div>
          <button
            type="button"
            onClick={() =>
              onOpenDraft({
                id: row._id,
                participantType: row.participantType,
                toEmail: row.toEmails[0] ?? "",
              })
            }
            className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            Open draft
          </button>
        </div>
      )}
    </li>
  );
}

// Case-scoped communication history (Phase 8-C). The list is live via
// the Convex query. Draft routing (which recipient a draft belongs to)
// is resolved by the parent, which owns the composer state.
export function CommunicationsSection({
  caseId,
  vendorLinked,
  onOpenDraft,
  onContactVendor,
  onContactResident,
}: {
  caseId: Id<"cases">;
  vendorLinked: boolean;
  onOpenDraft: (draft: {
    id: Id<"communications">;
    participantType: CommunicationRow["participantType"];
    toEmail: string;
  }) => void;
  onContactVendor: () => void;
  onContactResident: () => void;
}) {
  const rows = useQuery(api.email.queries.listByCase, { caseId });

  if (rows === undefined) {
    return (
      <section className="rounded-xl border bg-card p-6">
        <h2 className="font-medium">Communications</h2>
        <div className="mt-4">
          <LoadingSkeleton rows={3} />
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border bg-card p-6">
      <h2 className="font-medium">Communications</h2>
      {rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No communications yet."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={onContactResident}
                  className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
                >
                  Contact resident
                </button>
                <button
                  type="button"
                  disabled={!vendorLinked}
                  onClick={onContactVendor}
                  className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
                >
                  Contact vendor
                </button>
              </div>
            }
          />
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {rows.map((row) => (
            <CommunicationItem
              key={row._id}
              row={row}
              onOpenDraft={onOpenDraft}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
