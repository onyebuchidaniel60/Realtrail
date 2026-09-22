import {
  ArrowRightLeft,
  CircleCheckIcon,
  FileText,
  Lock,
  Mail,
  MessageSquare,
  Pencil,
  RotateCcw,
  UserCheck,
  XIcon,
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
  CONFIRMATION_REQUESTED: Mail,
  CONFIRMATION_CONFIRMED: CircleCheckIcon,
  CONFIRMATION_DENIED: XIcon,
};
