import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

/**
 * Diz se a conta logada é administradora, para decidir o que aparece na
 * navegação (o atalho para o `/admin`, por exemplo).
 *
 * Usa `GET /api/admin/check` em vez de uma server function porque essa rota
 * monta o `Authorization` à mão: não depende do middleware de cliente ter
 * hidratado o `currentUser` no momento do RPC.
 *
 * Isto é enfeite de navegação, não controle de acesso — quem barra o `/admin`
 * é o servidor. Um `false` atrasado só esconde um atalho.
 */
export function useIsAdmin(): boolean {
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(getFirebaseAuth(), (user) => setUid(user?.uid ?? null)), []);

  const { data } = useQuery({
    queryKey: ["is-admin", uid],
    enabled: Boolean(uid),
    // O papel não muda no meio da sessão; sem isto cada foco de janela gastaria
    // uma verificação de token só para redesenhar o mesmo atalho.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async () => {
      const user = getFirebaseAuth().currentUser;
      if (!user) return false;
      const response = await fetch("/api/admin/check", {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const body = (await response.json().catch(() => ({}))) as { ok?: boolean };
      return Boolean(body.ok);
    },
  });

  return data ?? false;
}
