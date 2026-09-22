import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ErrorState } from "@/components/common/ErrorState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { toast } from "@/components/common/toast";
import { errorMessage, inputClass } from "./dialogs/dialogUtils";
import { SendConfirmationDialog } from "./SendConfirmationDialog";

export type ComposerRecipient =
  | {
      type: "vendor";
      vendorId: Id<"vendors">;
      vendorName: string;
      vendorEmail?: string;
    }
  | { type: "resident"; recipientEmail?: string };

// Client-side mirror of the server email check (cases EMAIL_PATTERN).
// Advisory only: the backend re-validates on every mutation.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SUBJECT = 200;
const MAX_BODY = 10000;
const MAX_INSTRUCTIONS = 500;

export function DraftComposerSheet({
  caseId,
  caseNumber,
  caseTitle,
  locationLabel,
  open,
  onOpenChange,
  recipient,
  existingDraftId,
}: {
  caseId: Id<"cases">;
  caseNumber: number;
  caseTitle: string;
  locationLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipient: ComposerRecipient;
  existingDraftId?: Id<"communications">;
}) {
  const requestAiDraft = useMutation(api.email.mutations.requestAiDraft);
  const createDraftRecord = useMutation(
    api.email.mutations.createDraftRecord,
  );
  const rows = useQuery(
    api.email.queries.listByCase,
    open ? { caseId } : "skip",
  );

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [typedEmail, setTypedEmail] = useState("");
  const [instructions, setInstructions] = useState("");
  const [editingDraftId, setEditingDraftId] = useState<
    Id<"communications"> | undefined
  >(existingDraftId);
  const [aiSource, setAiSource] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // IDs known at AI-request time, captured in the click handler (never a
  // ref read during render): arrival adoption only accepts rows outside
  // this set, so an older draft can never be mistaken for the fresh one
  // with no client/server clock comparison involved.
  const [aiBaseline, setAiBaseline] = useState<Set<string> | null>(null);

  // Session state below is adopted during render (React's sanctioned
  // alternative to syncing in effects): the parent remounts this sheet
  // per composer session via key, so mounts start blank, and async rows
  // are adopted exactly once when they appear. No setState-in-effect.
  const [adoptedExistingId, setAdoptedExistingId] = useState<string | null>(
    null,
  );
  const existingRow =
    existingDraftId !== undefined
      ? rows?.find((row) => row._id === existingDraftId)
      : undefined;
  if (existingRow !== undefined && adoptedExistingId !== existingRow._id) {
    setAdoptedExistingId(existingRow._id);
    setSubject(existingRow.subject);
    setBody(existingRow.textBody);
    setEditingDraftId(existingRow._id);
    setAiSource(existingRow.aiDraftSource);
  }

  const [adoptedArrivalId, setAdoptedArrivalId] = useState<string | null>(
    null,
  );
  const expectedEmail =
    recipient.type === "vendor" ? recipient.vendorEmail : resolvedEmail();
  const arrival =
    requesting && rows !== undefined && aiBaseline !== null
      ? rows.find(
          (row) =>
            row.aiDraftSource &&
            row.participantType === recipient.type &&
            !aiBaseline.has(row._id) &&
            (expectedEmail === undefined ||
              expectedEmail === "" ||
              row.toEmails.includes(expectedEmail)),
        )
      : undefined;
  // Adopted rows are never trusted as sent — sending goes through the
  // confirmation dialog's approveSend call only.
  if (arrival !== undefined && adoptedArrivalId !== arrival._id) {
    setAdoptedArrivalId(arrival._id);
    setSubject(arrival.subject);
    setBody(arrival.textBody);
    setEditingDraftId(arrival._id);
    setAiSource(true);
    setRequesting(false);
    setRequestError(null);
  }

  function resolvedEmail(): string {
    if (recipient.type === "vendor") {
      return recipient.vendorEmail ?? "";
    }
    return recipient.recipientEmail ?? typedEmail.trim();
  }

  const email = resolvedEmail();
  const emailValid = EMAIL_PATTERN.test(email);
  const subjectValid =
    subject.trim().length >= 1 && subject.trim().length <= MAX_SUBJECT;
  const bodyValid =
    body.trim().length >= 1 && body.trim().length <= MAX_BODY;
  const instructionsValid = instructions.length <= MAX_INSTRUCTIONS;
  const vendorMissingEmail =
    recipient.type === "vendor" && recipient.vendorEmail === undefined;
  const canSave =
    !saving && subjectValid && bodyValid && emailValid && !vendorMissingEmail;
  const editingRow =
    editingDraftId !== undefined
      ? rows?.find((row) => row._id === editingDraftId)
      : undefined;

  async function handleAiDraft() {
    setAiBaseline(new Set((rows ?? []).map((row) => row._id)));
    setRequesting(true);
    setRequestError(null);
    try {
      const payload =
        recipient.type === "vendor"
          ? {
              caseId,
              recipientType: "vendor" as const,
              recipientId: recipient.vendorId,
              instructions: instructions.trim() || undefined,
            }
          : {
              caseId,
              recipientType: "resident" as const,
              recipientEmail: email,
              instructions: instructions.trim() || undefined,
            };
      await requestAiDraft(payload);
      // The row arrives via the live listByCase query; the watcher
      // above populates the editor. requesting stays true meanwhile.
    } catch (err) {
      setRequesting(false);
      setRequestError(errorMessage(err));
    }
  }

  async function handleSave() {
    if (!canSave) {
      return;
    }
    setSaving(true);
    try {
      // Draft rows are immutable: saving always creates a new row, even
      // when editing an existing draft. The newest saved row is the one
      // the Send step approves.
      const { communicationId } = await createDraftRecord({
        caseId,
        recipientType: recipient.type,
        recipientEmail: email,
        subject: subject.trim(),
        textBody: body.trim(),
        aiDraftSource: aiSource,
      });
      setEditingDraftId(communicationId);
      toast.success("Draft saved");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Compose email</SheetTitle>
          <SheetDescription>
            Case #{caseNumber} · {caseTitle}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-4">
          <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            <p className="font-medium">
              To:{" "}
              <span>
                {recipient.type === "vendor"
                  ? recipient.vendorName
                  : (recipient.recipientEmail ?? "Resident")}
              </span>
            </p>
            {recipient.type === "vendor" && recipient.vendorEmail !== undefined && (
              <p className="text-muted-foreground">{recipient.vendorEmail}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">{locationLabel}</p>
          </div>

          {recipient.type === "resident" &&
            recipient.recipientEmail === undefined && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Recipient email</span>
                <input
                  type="email"
                  value={typedEmail}
                  onChange={(e) => setTypedEmail(e.target.value)}
                  placeholder="resident@example.com"
                  className={inputClass}
                />
              </label>
            )}

          {vendorMissingEmail && (
            <p role="alert" className="text-sm text-destructive">
              This vendor has no email address. Add one to the vendor record
              before contacting them.
            </p>
          )}

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Guidance for AI (optional)</span>
            <input
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. ask for a quote first"
              maxLength={MAX_INSTRUCTIONS}
              className={inputClass}
              disabled={requesting}
            />
          </label>
          <div>
            <button
              type="button"
              onClick={handleAiDraft}
              disabled={requesting || vendorMissingEmail || !emailValid}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              {requesting ? "Drafting…" : "Draft with AI"}
            </button>
            {!instructionsValid && (
              <p role="alert" className="mt-1 text-xs text-destructive">
                Guidance must be at most {MAX_INSTRUCTIONS} characters.
              </p>
            )}
          </div>
          {requestError && (
            <ErrorState message={requestError} onRetry={handleAiDraft} />
          )}

          <label className="flex flex-col gap-1 text-sm">
            <span className="flex items-center gap-2 font-medium">
              Subject
              {aiSource && <StatusBadge>AI-generated</StatusBadge>}
            </span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={MAX_SUBJECT}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Message</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className={`${inputClass} whitespace-pre-wrap`}
            />
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save draft"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={
                editingDraftId === undefined ||
                editingRow === undefined ||
                !canSave
              }
              title={
                editingDraftId === undefined
                  ? "Save the draft first"
                  : undefined
              }
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </SheetContent>
      {confirmOpen && editingRow !== undefined && (
        <SendConfirmationDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          communication={editingRow}
          editedSubject={subject.trim()}
          editedBody={body.trim()}
          onSent={() => {
            setConfirmOpen(false);
            onOpenChange(false);
          }}
        />
      )}
    </Sheet>
  );
}
