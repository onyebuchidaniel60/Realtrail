import {
  ArrowRightLeft,
  FileText,
  Lock,
  MessageSquare,
  Pencil,
  RotateCcw,
  UserCheck,
} from "lucide-react";

export const ACTIVITY_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  CASE_CREATED: FileText,
  STATUS_CHANGED: ArrowRightLeft,
  ASSIGNED: UserCheck,
  NOTE_ADDED: MessageSquare,
  FIELDS_UPDATED: Pencil,
  CLOSED: Lock,
  REOPENED: RotateCcw,
};
