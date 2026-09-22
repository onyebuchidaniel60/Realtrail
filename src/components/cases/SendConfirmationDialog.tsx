import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/common/toast";
import { errorMessage, getAppError } from "./dialogs/dialogUtils";

// The subset of a communication row the dialog needs. listByCase rows
// satisfy this shape; the To address always comes from the server row,
// never from client state.
export type ConfirmableDraft = Pick<
  Doc<"communications">,
  "_id" | "toEmails" | "subject" | "textBody"
>;

const PREVIEW_CHARS = 500;

// The ONLY approveSend call site in the UI (AGENTS.md: AI drafts, the
// human approves). Do not add other call sites.
export function SendConfirmationDialog({
  open,
  onOpenChange,
  communication,
  editedSubject,
  editedBody,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communication: ConfirmableDraft;
  editedSubject: string;
  editedBody: string;
  onSent: () => void;
}) {
  const approveSend = useMutation(api.email.mutations.approveSend);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [showFull, setShowFull] = useState(false);

  const recipient = communication.toEmails[0] ?? "recipient";
  const truncated = editedBody.length > PREVIEW_CHARS;

  async function handleConfirm() {
    setConfirming(true);
    setConfirmError(null);
    try {
      await approveSend({
        communicationId: communication._id,
        subject: editedSubject,
        textBody: editedBody,
      });
      toast.success("Email queued for send");
      onSent();
    } catch (err) {
      if (getAppError(err).code === "CONFLICT") {
        toast.error("This draft has already been sent or is sending");
        onSent();
        return;
      }
      setConfirmError(errorMessage(err));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send this email?</DialogTitle>
          <DialogDescription>
            This will send an external email. It cannot be unsent.
          </DialogDescription>
        </DialogHeader>
        <dl className="flex flex-col gap-2 text-sm">
          <div>
            <dt className="font-medium">To</dt>
            <dd>{recipient}</dd>
          </div>
          <div>
            <dt className="font-medium">Subject</dt>
            <dd>{editedSubject}</dd>
          </div>
          <div>
            <dt className="font-medium">Message</dt>
            <dd className="rounded-md border bg-muted/40 px-3 py-2 whitespace-pre-wrap">
              {showFull || !truncated
                ? editedBody
                : `${editedBody.slice(0, PREVIEW_CHARS)}…`}
            </dd>
            {truncated && (
              <button
                type="button"
                onClick={() => setShowFull((v) => !v)}
                className="mt-1 text-xs text-muted-foreground underline"
              >
                {showFull ? "Show less" : "Show full"}
              </button>
            )}
          </div>
        </dl>
        {confirmError && (
          <p role="alert" className="text-sm text-destructive">
            {confirmError}
          </p>
        )}
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={confirming}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirming}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {confirming ? "Sending…" : "Send"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
