import type { User } from "firebase/auth";

/**
 * Garante que toda conta do Firebase Auth também tenha o índice users/{uid}
 * usado pelo admin, checkout e concessão de cortesia.
 *
 * A operação é idempotente e deve rodar depois de qualquer forma de login,
 * inclusive ao restaurar uma sessão criada em versões antigas do aplicativo.
 */
export async function ensureAccountProfile(user: User): Promise<void> {
  const idToken = await user.getIdToken();
  const response = await fetch("/api/account/ensure", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "Não foi possível concluir seu cadastro.");
  }
}
