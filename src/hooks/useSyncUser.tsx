import { useAuth } from "@clerk/clerk-react";
import { useMutation } from "convex/react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";

const SyncContext = createContext<boolean>(false);

export function useSyncStatus(): boolean {
  return useContext(SyncContext);
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn } = useAuth();
  const syncUser = useMutation(api.users.syncUser);
  const [synced, setSynced] = useState(false);
  const ranRef = useRef(false);

  useEffect(() => {
    if (!isSignedIn || ranRef.current) {
      return;
    }
    ranRef.current = true;
    syncUser({})
      .then(() => {
        setSynced(true);
      })
      .catch((err: unknown) => {
        if (import.meta.env.DEV) {
          console.error("users.syncUser failed", err);
        }
      });
  }, [isSignedIn, syncUser]);

  return (
    <SyncContext.Provider value={synced}>{children}</SyncContext.Provider>
  );
}
