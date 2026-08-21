import { useEffect, useRef } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { claimReferral } from "@/lib/referrals.functions";
import { getFirebaseAuth } from "@/lib/firebase";
import {
  REFERRAL_LANDING_STORAGE_KEY,
  REFERRAL_SOURCE_STORAGE_KEY,
  REFERRAL_STORAGE_KEY,
  isReferralSource,
  normalizeReferralCode,
} from "@/lib/referrals.shared";

/**
 * Captura links de afiliado (?ref=) e links de vendedor (?seller=, ?vendedor=),
 * guarda a primeira origem no dispositivo e vincula assim que houver login.
 */
export function ReferralCapture() {
  const claimingRef = useRef(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const queryCode =
      url.searchParams.get("ref") ||
      url.searchParams.get("seller") ||
      url.searchParams.get("vendedor") ||
      url.searchParams.get("codigo");
    const normalizedCode = queryCode ? normalizeReferralCode(queryCode) : "";
    if (normalizedCode) {
      try {
        localStorage.setItem(REFERRAL_STORAGE_KEY, normalizedCode);
        localStorage.setItem(
          REFERRAL_SOURCE_STORAGE_KEY,
          url.searchParams.has("ref") ? "link" : "seller_code",
        );
        localStorage.setItem(REFERRAL_LANDING_STORAGE_KEY, url.pathname.slice(0, 240));
      } catch {
        /* storage indisponível */
      }
    }

    const tryClaim = async () => {
      if (claimingRef.current) return;
      let code: string | null = null;
      let source: "link" | "seller_code" | "checkout" = "link";
      let landingPath: string | null = null;
      try {
        code = localStorage.getItem(REFERRAL_STORAGE_KEY);
        const storedSource = localStorage.getItem(REFERRAL_SOURCE_STORAGE_KEY);
        if (isReferralSource(storedSource)) source = storedSource;
        landingPath = localStorage.getItem(REFERRAL_LANDING_STORAGE_KEY);
      } catch {
        return;
      }
      if (!code) return;
      const user = getFirebaseAuth().currentUser;
      if (!user) return;
      claimingRef.current = true;
      try {
        const res = await claimReferral({ data: { code, source, landingPath } });
        // `notfound` NÃO descarta o código: ele também é a resposta para um
        // indicador que ainda não concluiu a adesão ao programa. Apagar aqui
        // perdia o vínculo em definitivo, sem chance de recuperação. Só some
        // quando o vínculo foi feito, já existia, ou o código é malformado.
        if (
          res.ok ||
          res.reason === "already" ||
          res.reason === "invalid" ||
          res.reason === "self"
        ) {
          localStorage.removeItem(REFERRAL_STORAGE_KEY);
          localStorage.removeItem(REFERRAL_SOURCE_STORAGE_KEY);
          localStorage.removeItem(REFERRAL_LANDING_STORAGE_KEY);
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
