import { useAuth } from "@clerk/clerk-react";
import { useMutation } from "convex/react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

interface SyncState {
  synced: boolean;
  userId: Id<"users"> | null;
}

const SyncContext = createContext<SyncState>({ synced: false, userId: null });

export function useSyncStatus(): SyncState {
  return useContext(SyncContext);
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn } = useAuth();
  const syncUser = useMutation(api.users.syncUser);
  const [state, setState] = useState<SyncState>({ synced: false, userId: null });
  const ranRef = useRef(false);

  useEffect(() => {
    if (!isSignedIn || ranRef.current) {
      return;
    }
    ranRef.current = true;
    syncUser({})
      .then((userId) => {
        setState({ synced: true, userId });
      })
      .catch((err: unknown) => {
        if (import.meta.env.DEV) {
          console.error("users.syncUser failed", err);
        }
      });
  }, [isSignedIn, syncUser]);

  return <SyncContext.Provider value={state}>{children}</SyncContext.Provider>;
}
