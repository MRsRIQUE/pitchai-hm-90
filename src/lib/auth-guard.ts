import { redirect } from "@tanstack/react-router";
import { onAuthStateChanged } from "firebase/auth";
import type { User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

/**
 * Guard de rota para TanStack Router (cliente).
 * Espera o primeiro evento de `onAuthStateChanged` e decide:
 *  - se logado, retorna (rota renderiza normalmente)
 *  - se deslogado, lança redirect para /entrar com `next` preservando pathname
 *
 * Uso em createFileRoute("...")({ beforeLoad: requireAuthBeforeLoad }).
 *
 * Como TanStack Start SSR não tem acesso ao Firebase Auth no servidor (auth
 * state é client-only), este guard roda só no cliente. Em SSR a rota
 * renderiza; o componente aplica o bloqueio depois.
 */
export async function requireAuthBeforeLoad({ location }: { location: { pathname: string } }) {
  // No SSR não há auth state — só podemos bloquear no cliente.
  if (typeof window === "undefined") return;

  const fbAuth = getFirebaseAuth();
  // Fast path: usuário já em memória.
  if (fbAuth.currentUser) return;

  // Espera o primeiro fire do Firebase Auth (persistence hydrated).
  // Não lance redirect dentro do executor da Promise: exceções ali viram
  // erros não tratados e não são propagadas pelo await.
  const user = await new Promise<User | null>((resolve) => {
    let settled = false;
    const unsub = onAuthStateChanged(fbAuth, (nextUser) => {
      if (settled) return;
      settled = true;
      unsub();
      resolve(nextUser);
    });
  });

  if (!user) {
    throw redirect({
      to: "/entrar",
      search: { next: location.pathname },
      replace: true,
    });
  }
}
