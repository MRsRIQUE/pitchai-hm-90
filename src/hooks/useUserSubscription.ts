import { useState, useEffect, useCallback } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase";
import {
  COMPED_LABEL,
  compedGrantedUntil as compedUntil,
  hasActiveCompedAccess,
  hasPaidAccess,
  planDisplayName,
  PRICE_TO_PLAN,
  PlanTier,
  type CompedAccessRecord,
} from "@/lib/live/plans";

export interface UserSubscriptionData {
  plan: string | null;
  status: string | null;
  granted_until: string | null;
  current_period_end: string | null;
  updated_at?: string | null;
  user_id?: string | null;
}

export interface UseUserSubscriptionResult {
  /** Objeto de assinatura bruto vindo do banco de dados */
  subscription: UserSubscriptionData | null;
  /** Se o usuário tem uma assinatura ou licença ativa (paga ou cortesia) */
  isPaidActive: boolean;
  /** Se o acesso é do tipo cortesia (granted_until pelo admin) */
  isComped: boolean;
  /** Categoria do plano ('free' | 'pro' | 'max') */
  planTier: PlanTier;
  /** Origem do acesso: assinatura paga, cortesia ou nenhum */
  source: "paid" | "comped" | "none";
  /** Nome legível do plano/categoria atual (ex.: "Cortesia", "Trimestral", "Sem plano") */
  planName: string;
  /** Data de validade da cortesia (camelCase do comped_access ou snake_case do legado) */
  compedGrantedUntil: string | null;
  /** Se o recurso de voz e áudio da IA em tempo real está liberado */
  allowAudio: boolean;
  /** Se as ferramentas de chat da IA estão ativas */
  allowChat: boolean;
  /** Se a transmissão e assistência ao vivo de IA estão liberadas */
  allowLiveAssist: boolean;
  /** Estado de carregamento */
  loading: boolean;
  /** Erro retornado caso haja falha na busca */
  error: Error | null;
  /** ID do usuário autenticado atual */
  userId: string | null;
  /** E-mail do usuário autenticado — é por ele que o pagamento é identificado */
  userEmail: string | null;
  /** Re-executa a verificação no banco manualmente */
  refetch: () => Promise<void>;
}

export function useUserSubscription(): UseUserSubscriptionResult {
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<UserSubscriptionData | null>(null);
  const [compedAccess, setCompedAccess] = useState<CompedAccessRecord | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Busca dados de assinatura no Firestore para um determinado user_id
  const fetchSubscription = useCallback(async (uid: string) => {
    try {
      setError(null);
      const db = getFirebaseDb();
      // Path correto: users/{uid}/subscription/current (subdoc com ID "current").
      // Antes era doc(db,"users",uid,"subscription") que aponta para collection
      // (sem docID) — getDoc sempre retornava null.
      const [snap, compedSnap] = await Promise.all([
        getDoc(doc(db, "users", uid, "subscription", "current")),
        getDoc(doc(db, "comped_access", uid)),
      ]);
      if (snap.exists()) {
        const d = snap.data() as Record<string, unknown>;
        setSubscription({
          plan: (d.plan as string) ?? null,
          status: (d.status as string) ?? null,
          granted_until: (d.granted_until as string) ?? null,
          current_period_end: (d.current_period_end as string) ?? null,
          updated_at: (d.updated_at as string) ?? null,
          user_id: uid,
        });
      } else {
        setSubscription(null);
      }
      setCompedAccess(compedSnap.exists() ? (compedSnap.data() as CompedAccessRecord) : null);
      // DEBUG
      console.debug(
        "[useUserSubscription] compedAccess raw:",
        compedSnap.exists() ? compedSnap.data() : "não existe",
      );
    } catch (err: any) {
      console.error("[useUserSubscription] Exceção ao consultar Firestore:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  // Monitora sessão do usuário e estado de autenticação
  useEffect(() => {
    const fbAuth = getFirebaseAuth();
    const unsub = onAuthStateChanged(fbAuth, (user) => {
      const uid = user?.uid ?? null;
      setUserId(uid);
      setUserEmail(user?.email ?? null);
      if (uid) {
        fetchSubscription(uid);
      } else {
        setSubscription(null);
        setCompedAccess(null);
        setLoading(false);
      }
    });

    return () => unsub();
  }, [fetchSubscription]);

  // Realtime: escuta mudanças no documento de assinatura
  useEffect(() => {
    if (!userId) return;
    const db = getFirebaseDb();
    // Path correto: users/{uid}/subscription/current
    const subRef = doc(db, "users", userId, "subscription", "current");
    const unsubSubscription = onSnapshot(
      subRef,
      (snap) => {
        if (!snap.exists()) {
          setSubscription(null);
          return;
        }
        const d = snap.data() as Record<string, unknown>;
        setSubscription({
          plan: (d.plan as string) ?? null,
          status: (d.status as string) ?? null,
          granted_until: (d.granted_until as string) ?? null,
          current_period_end: (d.current_period_end as string) ?? null,
          updated_at: (d.updated_at as string) ?? null,
          user_id: userId,
        });
      },
      (err) => {
        console.warn("[useUserSubscription] onSnapshot:", err);
      },
    );
    const compedRef = doc(db, "comped_access", userId);
    const unsubComped = onSnapshot(
      compedRef,
      (snap) => setCompedAccess(snap.exists() ? (snap.data() as CompedAccessRecord) : null),
      (err) => console.warn("[useUserSubscription] cortesia onSnapshot:", err),
    );

    // Polling e re-sync quando a janela ganha foco
    const onFocus = () => {
      if (userId) fetchSubscription(userId);
    };
    window.addEventListener("focus", onFocus);

    return () => {
      unsubSubscription();
      unsubComped();
      window.removeEventListener("focus", onFocus);
    };
  }, [userId, fetchSubscription]);

  // Função de re-busca manual
  const refetch = useCallback(async () => {
    if (userId) {
      setLoading(true);
      await fetchSubscription(userId);
    }
  }, [userId, fetchSubscription]);

  // Regras de negócio calculadas em tempo real.
  // Cortesia pode viver em dois lugares: comped_access/{uid} (atual) ou, legado,
  // no próprio doc de assinatura com status "comped".
  const legacyComped = subscription?.status === "comped";
  const paidSubscriptionActive = hasPaidAccess(subscription) && !legacyComped;
  const compedActive =
    hasActiveCompedAccess(compedAccess) || (legacyComped && hasPaidAccess(subscription));
  const isPaidActive = paidSubscriptionActive || compedActive;

  // DEBUG
  console.debug("[useUserSubscription] computed:", {
    compedAccess,
    hasActiveCompedAccess: hasActiveCompedAccess(compedAccess),
    compedActive,
    paidSubscriptionActive,
    isPaidActive,
    rawPlan: compedActive ? compedAccess?.plan : subscription?.plan,
  });

  const isComped = compedActive && !paidSubscriptionActive;

  const rawPlan = isComped
    ? compedAccess?.plan || subscription?.plan || "pitchai_trimestral"
    : subscription?.plan || "free";
  const planTier: PlanTier = isPaidActive ? PRICE_TO_PLAN[rawPlan] || "pro" : "free";

  const source: "paid" | "comped" | "none" = paidSubscriptionActive
    ? "paid"
    : compedActive
      ? "comped"
      : "none";
  const planName = source === "comped" ? COMPED_LABEL : planDisplayName(rawPlan);
  const compedGrantedUntil = isComped
    ? (compedUntil(compedAccess) ?? subscription?.granted_until ?? null)
    : null;

  // Liberação de Áudio/Voz da IA:
  // - Liberado se for Cortesia (comped) ou se o plano do usuário aceitar áudio (Trimestral, Anual ou Max)
  const isAudioPlan =
    rawPlan.includes("trimestral") ||
    rawPlan.includes("anual") ||
    rawPlan.includes("max") ||
    rawPlan === "pitchai_trimestral" ||
    rawPlan === "pitchai_anual";

  const allowAudio = isPaidActive && (isComped || isAudioPlan);

  const allowChat = isPaidActive;
  const allowLiveAssist = isPaidActive;

  return {
    subscription,
    isPaidActive,
    isComped,
    planTier,
    source,
    planName,
    compedGrantedUntil,
    allowAudio,
    allowChat,
    allowLiveAssist,
    loading,
    error,
    userId,
    userEmail,
    refetch,
  };
}
