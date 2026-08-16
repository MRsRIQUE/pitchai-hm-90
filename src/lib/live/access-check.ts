import { doc, getDoc } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { hasActiveCompedAccess, hasPaidAccess, type CompedAccessRecord } from "@/lib/live/plans";

/**
 * Consulta pontual (sem listener) do acesso de um usuário.
 *
 * Serve só para decidir o destino logo depois do login, quando ainda não há um
 * componente React montado para usar `useUserSubscription`. As regras de
 * negócio continuam sendo as de `plans.ts` — aqui apenas lemos os mesmos dois
 * documentos que o hook lê e reaproveitamos os predicados.
 *
 * Em caso de falha de leitura devolvemos `true`: o painel tem o próprio gate
 * (`PaymentGuardOverlay`) e é melhor deixá-lo decidir do que empurrar alguém
 * com plano ativo para a tela de compra por causa de um erro de rede.
 */
export async function hasActiveAccess(uid: string): Promise<boolean> {
  try {
    const db = getFirebaseDb();
    const [subSnap, compedSnap] = await Promise.all([
      getDoc(doc(db, "users", uid, "subscription", "current")),
      getDoc(doc(db, "comped_access", uid)),
    ]);

    const subscription = subSnap.exists()
      ? (subSnap.data() as {
          plan?: string | null;
          status?: string | null;
          granted_until?: string | null;
          current_period_end?: string | null;
        })
      : null;
    const comped = compedSnap.exists() ? (compedSnap.data() as CompedAccessRecord) : null;

    return hasPaidAccess(subscription) || hasActiveCompedAccess(comped);
  } catch (err) {
    console.warn("[access-check] Falha ao consultar o plano do usuário:", err);
    return true;
  }
}
