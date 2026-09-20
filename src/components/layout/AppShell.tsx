import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar, SidebarNav } from "./Sidebar";
import { SyncProvider } from "@/hooks/useSyncUser";

function MobileDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }
  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close menu"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className="absolute inset-y-0 left-0 flex w-60 flex-col bg-card shadow-lg">
        <div className="flex h-14 items-center justify-between px-4">
          <span className="text-lg font-bold tracking-tight">REALTRAIL</span>
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="rounded-md p-2 hover:bg-accent"
          >
            <X className="size-5" />
          </button>
        </div>
        <SidebarNav onNavigate={onClose} />
      </div>
    </div>
  );
}

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <SyncProvider>
      <div className="flex min-h-svh bg-background">
        {/* Desktop ≥1280px: persistent sidebar. Tablet: icons-only. */}
        <Sidebar />
        <Sidebar iconsOnly />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar with hamburger. */}
          <header className="flex h-14 items-center gap-2 border-b px-4 md:hidden">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setDrawerOpen(true)}
              className="rounded-md p-2 hover:bg-accent"
            >
              <Menu className="size-5" />
            </button>
            <span className="text-base font-bold tracking-tight">
              REALTRAIL
            </span>
          </header>
          <main className="flex-1 px-4 py-6 md:px-8">
            <Outlet />
          </main>
        </div>
        <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      </div>
    </SyncProvider>
  );
}
