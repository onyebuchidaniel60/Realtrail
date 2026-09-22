import { UserButton } from "@clerk/clerk-react";
import {
  Activity,
  Bell,
  Briefcase,
  Building2,
  ClipboardList,
  Inbox,
  LayoutDashboard,
  Settings,
  Truck,
} from "lucide-react";
import { useQuery } from "convex/react";
import { useState } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import { useSyncStatus } from "@/hooks/useSyncUser";
import { NotificationsDrawer } from "@/components/notifications/NotificationsDrawer";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    title: "Workspace",
    items: [
      { to: "/overview", label: "Overview", icon: LayoutDashboard },
      { to: "/cases", label: "Cases", icon: Briefcase },
      { to: "/inbox", label: "Inbox", icon: Inbox },
      { to: "/properties", label: "Properties", icon: Building2 },
      { to: "/vendors", label: "Vendors", icon: Truck },
    ],
  },
  {
    title: "Operations",
    items: [
      { to: "/tasks", label: "Tasks", icon: ClipboardList },
      { to: "/activity", label: "Activity", icon: Activity },
    ],
  },
  {
    title: "Management",
    items: [{ to: "/settings", label: "Settings", icon: Settings }],
  },
];

export function SidebarNav({
  onNavigate,
  compact = false,
}: {
  onNavigate?: () => void;
  compact?: boolean;
}) {
  // Workspace-wide unread count for the Inbox badge. pageSize 1 keeps the
  // payload tiny; unreadCount is computed server-side regardless. Gated on
  // sync so the query never fires pre-auth.
  const { synced } = useSyncStatus();
  const inboxState = useQuery(
    api.email.queries.list,
    synced ? { filter: "all", pageSize: 1 } : "skip",
  );
  const unread = inboxState?.unreadCount ?? 0;
  // Notifications badge: unread reminder/attention count. Gated on
  // sync like the inbox query; never cached client-side.
  const notifState = useQuery(
    api.notifications.queries.unreadCount,
    synced ? {} : "skip",
  );
  const notifUnread = notifState?.count ?? 0;
  const [notifOpen, setNotifOpen] = useState(false);
  return (
    <>
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
      {SECTIONS.map((section) => (
        <div key={section.title}>
          <p
            className={cn(
              "px-3 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase",
              compact && "sr-only",
            )}
          >
            {section.title}
          </p>
          <ul className="flex flex-col gap-1">
            {section.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={onNavigate}
                  title={compact ? item.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? // TODO(Phase 12): replace with lavender primary accent token.
                          "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    )
                  }
                >
                  <item.icon className="size-4 shrink-0" />
                  <span className={cn(compact && "sr-only")}>
                    {item.label}
                  </span>
                  {item.to === "/inbox" && unread > 0 && (
                    <span
                      aria-label={`${unread} unread messages`}
                      className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground"
                    >
                      {unread}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
            {section.title === "Workspace" && (
              <li>
                <button
                  type="button"
                  onClick={() => setNotifOpen(true)}
                  title={compact ? "Notifications" : undefined}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                >
                  <Bell className="size-4 shrink-0" />
                  <span className={cn(compact && "sr-only")}>
                    Notifications
                  </span>
                  {notifUnread > 0 && (
                    <span
                      aria-label={`${notifUnread} unread notifications`}
                      className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground"
                    >
                      {notifUnread}
                    </span>
                  )}
                </button>
              </li>
            )}
          </ul>
        </div>
      ))}
    </nav>
    <NotificationsDrawer open={notifOpen} onOpenChange={setNotifOpen} />
    </>
  );
}

export function Sidebar({ iconsOnly = false }: { iconsOnly?: boolean }) {
  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r bg-card",
        iconsOnly ? "hidden w-16 md:flex xl:hidden" : "hidden w-60 xl:flex",
      )}
    >
      <a href="/overview" className="flex h-14 items-center px-4">
        {iconsOnly ? (
          <span className="text-lg font-bold" aria-label="Realtrail home">
            R
          </span>
        ) : (
          <span className="text-lg font-bold tracking-tight">REALTRAIL</span>
        )}
      </a>
      <SidebarNav compact={iconsOnly} />
      <div className="flex items-center gap-2 border-t p-4">
        <UserButton />
        {!iconsOnly && (
          <span className="text-xs text-muted-foreground">Account</span>
        )}
      </div>
    </aside>
  );
}
