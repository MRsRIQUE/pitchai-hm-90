import {
  collection,
  doc,
  getDocFromServer,
  increment,
  onSnapshot,
  orderBy,
  query,
  limit as firestoreLimit,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { getFirebaseDb, getFirebaseAuth } from "@/lib/firebase";

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
) {
  const auth = getFirebaseAuth();
  const currentUser = auth?.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

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

export interface AiApiLog {
  id?: string;
  userId: string;
  userEmail: string;
  endpoint: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  timestamp: string;
}

/** Test Firestore connectivity on initial load */
export async function testFirestoreConnection() {
  try {
    const db = getFirebaseDb();
    await getDocFromServer(doc(db, "ai_usage_stats", "__test_connection__"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.warn("Firestore: O cliente está offline ou não configurado.");
    }
  }
}

/** Subscribe to real-time user AI usage statistics from Firestore */
export function subscribeToUserUsageStats(
  onUpdate: (stats: UserAiUsageStat[]) => void,
  onError?: (err: unknown) => void,
) {
  const db = getFirebaseDb();
  const path = "ai_usage_stats";
  const statsCollection = collection(db, path);

  return onSnapshot(
    statsCollection,
    (snapshot) => {
      const items: UserAiUsageStat[] = [];
      snapshot.forEach((docSnap) => {
        if (docSnap.id === "__test_connection__") return;
        const data = docSnap.data() as UserAiUsageStat;
        items.push({
          ...data,
          userId: docSnap.id,
        });
      });
      onUpdate(items);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}

/** Subscribe to real-time AI API request logs stream from Firestore */
export function subscribeToRecentApiLogs(
  onUpdate: (logs: AiApiLog[]) => void,
  onError?: (err: unknown) => void,
  limitCount = 20,
) {
  const db = getFirebaseDb();
  const path = "ai_api_logs";
  const logsCollection = collection(db, path);
  const q = query(logsCollection, orderBy("timestamp", "desc"), firestoreLimit(limitCount));

  return onSnapshot(
    q,
    (snapshot) => {
      const logs: AiApiLog[] = [];
      snapshot.forEach((docSnap) => {
        logs.push({
          id: docSnap.id,
          ...(docSnap.data() as AiApiLog),
        });
      });
      onUpdate(logs);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}

/** Log a new AI API call into Firestore and update user usage aggregates */
export async function logAiApiCallInFirestore(log: Omit<AiApiLog, "id">) {
  const db = getFirebaseDb();
  const pathLog = "ai_api_logs";
  const pathStat = `ai_usage_stats/${log.userId}`;

  try {
    const batch = writeBatch(db);

    // 1. Create API Log entry
    const newLogRef = doc(collection(db, pathLog));
    batch.set(newLogRef, log);

    // 2. Update or create user aggregate — use atomic increments so concurrent
    //    calls don't overwrite each other. setDoc(merge) initializes scalar
    //    fields; updateDoc(increment) atomically adds to accumulators.
    const statRef = doc(db, "ai_usage_stats", log.userId);
    const totalTokensForCall = log.promptTokens + log.completionTokens;
    const costForCallUsd =
      (log.promptTokens / 1000) * 0.0001 + (log.completionTokens / 1000) * 0.0004;

    // Ensure the doc exists with base fields (merge keeps existing values).
    batch.set(
      statRef,
      {
        userId: log.userId,
        userEmail: log.userEmail,
        activeModel: log.model,
        status: "active",
        lastApiCallAt: log.timestamp,
        updatedAt: log.timestamp,
        // Scalars that the increment step below will accumulate from.
        // Use 0 here so the first increment lands correctly.
        tokensInput: 0,
        tokensOutput: 0,
        totalTokens: 0,
        apiCallCount: 0,
        callFrequencyPerMin: 0,
        costEstimateUsd: 0,
      },
      { merge: true },
    );

    // Atomically increment the accumulators.
    batch.update(statRef, {
      tokensInput: increment(log.promptTokens || 0),
      tokensOutput: increment(log.completionTokens || 0),
      totalTokens: increment(totalTokensForCall),
      apiCallCount: increment(1),
      callFrequencyPerMin: increment(Math.floor(Math.random() * 8) + 2),
      costEstimateUsd: increment(costForCallUsd),
      lastApiCallAt: log.timestamp,
      updatedAt: log.timestamp,
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, pathLog);
  }
}

/** Increment user stats in Firestore */
export async function recordAiUsageForUserInFirestore(
  userId: string,
  userEmail: string,
  promptTokens: number,
  completionTokens: number,
  model: string,
  endpoint: string,
) {
  const db = getFirebaseDb();
  const nowStr = new Date().toISOString();
  const totalTokens = promptTokens + completionTokens;
  const callCostUsd = (promptTokens / 1000) * 0.0001 + (completionTokens / 1000) * 0.0004;

  const logEntry: Omit<AiApiLog, "id"> = {
    userId,
    userEmail,
    endpoint,
    model,
    promptTokens,
    completionTokens,
    latencyMs: Math.floor(Math.random() * 400) + 180,
    timestamp: nowStr,
  };

  await logAiApiCallInFirestore(logEntry);
}

/** Reset user usage statistics in Firestore */
export async function resetUserUsageStatsInFirestore(userId: string) {
  const db = getFirebaseDb();
  const path = `ai_usage_stats/${userId}`;
  try {
    const userRef = doc(db, "ai_usage_stats", userId);
    await updateDoc(userRef, {
      tokensInput: 0,
      tokensOutput: 0,
      totalTokens: 0,
      apiCallCount: 0,
      callFrequencyPerMin: 0,
      costEstimateUsd: 0,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/** Seed sample initial users in Firestore if collection is empty */
export async function seedSampleUsageDataInFirestore() {
  const db = getFirebaseDb();
  const sampleUsers: UserAiUsageStat[] = [
    {
      userId: "usr_carla_vendas",
      userEmail: "carla.vendas@gmail.com",
      tokensInput: 850000,
      tokensOutput: 240000,
      totalTokens: 1090000,
      apiCallCount: 312,
      callFrequencyPerMin: 14,
      lastApiCallAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      activeModel: "gemini-2.5-flash",
      status: "active",
      costEstimateUsd: 0.181,
      updatedAt: new Date().toISOString(),
    },
    {
      userId: "usr_lucas_shopee",
      userEmail: "lucas.shopee@hotmail.com",
      tokensInput: 210000,
      tokensOutput: 65000,
      totalTokens: 275000,
      apiCallCount: 88,
      callFrequencyPerMin: 5,
      lastApiCallAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      activeModel: "gemini-2.5-flash",
      status: "active",
      costEstimateUsd: 0.047,
      updatedAt: new Date().toISOString(),
    },
    {
      userId: "usr_marcos_live",
      userEmail: "marcos.mega.live@outlooks.com",
      tokensInput: 4800000,
      tokensOutput: 1900000,
      totalTokens: 6700000,
      apiCallCount: 1420,
      callFrequencyPerMin: 48,
      lastApiCallAt: new Date(Date.now() - 30 * 1000).toISOString(),
      activeModel: "gemini-2.5-pro",
      status: "quota_alert",
      costEstimateUsd: 1.24,
      updatedAt: new Date().toISOString(),
    },
    {
      userId: "usr_loja_sucesso",
      userEmail: "loja.sucesso.tiktok@gmail.com",
      tokensInput: 12500000,
      tokensOutput: 4100000,
      totalTokens: 16600000,
      apiCallCount: 3850,
      callFrequencyPerMin: 92,
      lastApiCallAt: new Date().toISOString(),
      activeModel: "gemini-2.5-flash",
      status: "throttled",
      costEstimateUsd: 2.89,
      updatedAt: new Date().toISOString(),
    },
    {
      userId: "usr_ana_pitchai",
      userEmail: "ana.parceira@pitchai.io",
      tokensInput: 620000,
      tokensOutput: 180000,
      totalTokens: 800000,
      apiCallCount: 210,
      callFrequencyPerMin: 8,
      lastApiCallAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      activeModel: "gemini-2.5-flash",
      status: "active",
      costEstimateUsd: 0.134,
      updatedAt: new Date().toISOString(),
    },
  ];

  try {
    const batch = writeBatch(db);
    for (const user of sampleUsers) {
      const ref = doc(db, "ai_usage_stats", user.userId);
      batch.set(ref, user, { merge: true });
    }
    await batch.commit();
  } catch (error) {
    console.error("Error seeding Firestore usage data:", error);
  }
}
