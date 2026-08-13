import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase";

/**
 * Lê o sync token do usuário logado (users/{uid}.syncToken), usado pela
 * extensão e pelos banners de status de sincronização.
 */
export function useSyncToken(): string | null {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const db = getFirebaseDb();
    const unsub = onAuthStateChanged(getFirebaseAuth(), (user) => {
      if (!user) {
        setToken(null);
        return;
      }
      getDoc(doc(db, "users", user.uid))
        .then((snap) => {
          if (cancelled) return;
          setToken((snap.data() as { syncToken?: string } | undefined)?.syncToken ?? null);
        })
        .catch(() => {
          if (!cancelled) setToken(null);
        });
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  return token;
}
