import { useState, useEffect, useCallback } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase";
import {
  compedGrantedUntil as compedUntil,
  hasActiveCompedAccess,
  hasPaidAccess,
  planDisplayName,
  PRICE_TO_PLAN,
  PlanTier,
  type CompedAccessRecord,
} from "@/lib/live/plans";
import { resolvePlanQuota } from "@/lib/live/quotas";

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
  /**
   * Nome legível do plano concedido (ex.: "Trimestral", "Anual", "Sem plano").
   * Na cortesia é o nome do plano, não "Cortesia" — use `isComped`/`source` para
   * saber a origem do acesso.
   */
  planName: string;
  /** Data de validade da cortesia (camelCase do comped_access ou snake_case do legado) */
  compedGrantedUntil: string | null;
  /** Identificador bruto do plano concedido (pago ou cortesia), ex.: "pitchai_trimestral" */
  plan: string | null;
  /** Franquia mensal de tokens do plano atual (0 sem acesso) */
  tokenLimit: number;
  /** Tokens consumidos no mês corrente */
  tokenUsed: number;
  /** Tokens restantes no mês corrente */
  tokenRemaining: number;
  /** Percentual restante da franquia mensal (0-100, arredondado) */
  tokenRemainingPct: number;
  /** Fim do período pago atual (current_period_end ou granted_until da assinatura) */
  planExpiresAt: string | null;
  /** Dias até o fim do acesso (assinatura paga ou cortesia); null sem data válida */
  daysUntilExpiry: number | null;
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
  const [tokenUsed, setTokenUsed] = useState<number>(0);

  // Busca dados de assinatura no Firestore para um determinado user_id
  const fetchSubscription = useCallback(async (uid: string) => {
    try {
      setError(null);
      const db = getFirebaseDb();
      // Path correto: users/{uid}/subscription/current (subdoc com ID "current").
      // Antes era doc(db,"users",uid,"subscription") que aponta para collection
      // (sem docID) — getDoc sempre retornava null.
      // O mês do token_usage segue o relógio UTC do backend (api-auth.server.ts).
      const month = new Date().toISOString().slice(0, 7);
      const [snap, compedSnap, usageSnap] = await Promise.all([
        getDoc(doc(db, "users", uid, "subscription", "current")),
        getDoc(doc(db, "comped_access", uid)),
        getDoc(doc(db, "users", uid, "token_usage", month)),
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
      if (usageSnap.exists()) {
        const u = usageSnap.data() as Record<string, unknown>;
        const input = Math.max(0, Number(u.tokensInput) || 0);
        const output = Math.max(0, Number(u.tokensOutput) || 0);
        setTokenUsed(input + output);
      } else {
        setTokenUsed(0);
      }
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
        setTokenUsed(0);
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
  // A cortesia mostra o NOME DO PLANO concedido (Trimestral/Anual), não o rótulo
  // "Cortesia": é o plano que define a franquia de tokens e as cotas do usuário,
  // então exibir "Cortesia" escondia justamente a informação que importa.
  // Quem precisa saber a origem do acesso usa `source`/`isComped`.
  const planName = planDisplayName(rawPlan);
  const compedGrantedUntil = isComped
    ? (compedUntil(compedAccess) ?? subscription?.granted_until ?? null)
    : null;

  // Franquia mensal de tokens: limite vem do plano, consumo do doc de uso do
  // mês corrente (mesma fonte que o backend usa para bloquear a extensão).
  const tokenLimit = isPaidActive ? resolvePlanQuota(rawPlan).monthlyTokenLimit : 0;
  const tokenUsedCount = isPaidActive ? tokenUsed : 0;
  const tokenRemaining = Math.max(0, tokenLimit - tokenUsedCount);
  const tokenRemainingPct =
    tokenLimit > 0 ? Math.max(0, Math.round((tokenRemaining / tokenLimit) * 100)) : 0;

  // Fim do acesso: assinatura paga usa current_period_end/granted_until do
  // doc de assinatura; cortesia já tem compedGrantedUntil.
  const planExpiresAt = paidSubscriptionActive
    ? (subscription?.current_period_end ?? subscription?.granted_until ?? null)
    : null;
  const accessExpiresAt = isComped ? compedGrantedUntil : planExpiresAt;
  const daysUntilExpiry = (() => {
    if (!accessExpiresAt) return null;
    const timestamp = Date.parse(accessExpiresAt);
    if (!Number.isFinite(timestamp)) return null;
    return Math.ceil((timestamp - Date.now()) / 86_400_000);
  })();

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
    plan: rawPlan,
    tokenLimit,
    tokenUsed: tokenUsedCount,
    tokenRemaining,
    tokenRemainingPct,
    planExpiresAt,
    daysUntilExpiry,
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
