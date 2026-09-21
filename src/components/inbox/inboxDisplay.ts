import type { Id } from "../../../convex/_generated/dataModel";

export type InboxRow = {
  _id: Id<"communications">;
  direction: "inbound" | "outbound";
  subject: string;
  fromEmail: string;
  preview: string;
  participantType: "resident" | "vendor" | "other";
  caseId?: Id<"cases">;
  caseNumber?: number;
  caseTitle?: string;
  createdAt: number;
  readAt?: number;
  threadId: string;
};

// Sender label: classified rows show their role; otherwise the local part
// of the email address ("Name <addr>" wrappers unwrapped first).
export function senderLabel(
  row: Pick<InboxRow, "fromEmail" | "participantType">,
): string {
  if (row.participantType === "resident") {
    return "Resident";
  }
  if (row.participantType === "vendor") {
    return "Vendor";
  }
  const bracket = row.fromEmail.match(/<([^<>]+)>/);
  const address = (bracket ? bracket[1] : row.fromEmail).trim();
  const localPart = address.split("@")[0] ?? address;
  return localPart.length > 0 ? localPart : row.fromEmail;
}
