import { collection, doc, getDocFromServer, onSnapshot } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";

export interface UserAiUsageStat {
  userId: string;
  userEmail: string;
  tokensInput: number;
  tokensOutput: number;
  totalTokens: number;
  apiCallCount: number;
  callFrequencyPerMin: number;
  lastApiCallAt: string;
  activeModel: string;
  status: "active" | "quota_alert" | "throttled" | "blocked";
  costEstimateUsd: number;
  updatedAt: string;
}

/** Valida a conexão sem criar documentos de teste. */
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    const db = getFirebaseDb();
    await getDocFromServer(doc(db, "ai_usage_stats", "__test_connection__"));
    return true;
  } catch (error) {
    console.error("Não foi possível conectar ao Firestore:", error);
    return false;
  }
}

/** Assina somente os dados reais já registrados pelo backend. */
export function subscribeToUserUsageStats(
  onUpdate: (stats: UserAiUsageStat[]) => void,
  onError?: (error: unknown) => void,
) {
  const db = getFirebaseDb();
  return onSnapshot(
    collection(db, "ai_usage_stats"),
    (snapshot) => {
      const items = snapshot.docs
        .filter((item) => item.id !== "__test_connection__")
        .map((item) => ({ ...(item.data() as UserAiUsageStat), userId: item.id }));
      onUpdate(items);
    },
    (error) => {
      console.error("Falha no listener de uso de IA:", error);
      onError?.(error);
    },
  );
}
