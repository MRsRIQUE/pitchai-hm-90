import { useEffect, useState } from "react";
import { listMySessions, type LiveSessionRow } from "@/lib/live/sync";

/**
 * Sessões de LIVE do usuário, para os cartões de desempenho do Início.
 *
 * Recarrega a cada minuto, e não a cada poucos segundos como o contador de
 * vendas: aqui o desenho é de dias inteiros, então buscar mais rápido só
 * gastaria leitura do Firestore para redesenhar exatamente o mesmo gráfico.
 */
export function useSessoes(limite = 60): { sessoes: LiveSessionRow[]; carregando: boolean } {
  const [sessoes, setSessoes] = useState<LiveSessionRow[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;

    const buscar = async () => {
      try {
        const linhas = await listMySessions(limite);
        if (vivo) setSessoes(linhas);
      } catch (erro) {
        // Sem toast: o Início mostra o estado vazio, que já conta a história.
        // Um erro de leitura aqui não deve tapar o painel inteiro.
        console.warn("[Inicio] não foi possível ler as sessões:", erro);
      } finally {
        if (vivo) setCarregando(false);
      }
    };

    void buscar();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void buscar();
    }, 60_000);

    return () => {
      vivo = false;
      window.clearInterval(id);
    };
  }, [limite]);

  return { sessoes, carregando };
}
