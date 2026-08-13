import { useEffect, useRef } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { claimReferral } from "@/lib/referrals.functions";
import { getFirebaseAuth } from "@/lib/firebase";

const REFERRAL_STORAGE_KEY = "pitchai:ref";

/**
 * Captura ?ref=CODIGO da URL, guarda no dispositivo e vincula a indicação
 * assim que houver um usuário logado.
 */
export function ReferralCapture() {
  const claimingRef = useRef(false);

  useEffect(() => {
    const ref = new URL(window.location.href).searchParams.get("ref");
    if (ref) {
      try {
        localStorage.setItem(REFERRAL_STORAGE_KEY, ref.slice(0, 32));
      } catch {
        /* storage indisponível */
      }
    }

    const tryClaim = async () => {
      if (claimingRef.current) return;
      let code: string | null = null;
      try {
        code = localStorage.getItem(REFERRAL_STORAGE_KEY);
      } catch {
        return;
      }
      if (!code) return;
      const user = getFirebaseAuth().currentUser;
      if (!user) return;
      claimingRef.current = true;
      try {
        const res = await claimReferral({ data: { code } });
        if (res.ok || res.reason === "already" || res.reason === "notfound") {
          localStorage.removeItem(REFERRAL_STORAGE_KEY);
        }
      } catch {
        /* tenta de novo no próximo login */
      } finally {
        claimingRef.current = false;
      }
    };

    tryClaim();
    const unsub = onAuthStateChanged(getFirebaseAuth(), (user) => {
      if (user) tryClaim();
    });
    return () => unsub();
  }, []);

  return null;
}
