import { getFirebaseAuth } from "@/lib/firebase";

/**
 * Headers para os endpoints de IA (/api/script/generate, /api/tts/preview).
 * Usa o sync token quando existir; senão cai no ID token do usuário logado.
 */
export async function aiHeaders(syncToken?: string): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (syncToken) {
    headers.Authorization = `Bearer ${syncToken}`;
    return headers;
  }
  const user = getFirebaseAuth().currentUser;
  if (user) {
    const token = await user.getIdToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}
