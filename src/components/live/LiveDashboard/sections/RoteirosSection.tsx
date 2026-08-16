import { useState } from "react";
import { Copy, FileText, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useLiveStore } from "@/stores/useLiveStore";
import { useShallow } from "zustand/react/shallow";
import { aiHeaders } from "@/lib/live/ai-headers";
import { copyToClipboard } from "@/lib/clipboard";
import { formatarPreco } from "./produto";

const ESTILO_ROTEIRO = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12.5,
  lineHeight: 1.6,
  minHeight: 240,
} as const;

/**
 * Gerador de roteiro — o pitch que o usuário narra ao vivo.
 *
 * A geração em lote roda um produto por vez de propósito: o endpoint cobra por
 * chamada e um `Promise.all` sobre um catálogo grande estoura a cota do plano
 * antes de o usuário perceber o que aconteceu.
 */
export function RoteirosSection() {
  const { config, loading, updateConfig, setLoading } = useLiveStore(
    useShallow((state) => ({
      config: state.config,
      loading: state.loading,
      updateConfig: state.actions.updateConfig,
      setLoading: state.actions.setLoading,
    })),
  );

  const [objetivo, setObjetivo] = useState("pitch do produto ativo");
  const [duracao, setDuracao] = useState(3);
  const [gerando, setGerando] = useState(false);
  const [lote, setLote] = useState<{ feitos: number; total: number } | null>(null);

  const gerar = async () => {
    setGerando(true);
    setLoading("script", true);
    try {
      const res = await fetch("/api/script/generate", {
        method: "POST",
        headers: await aiHeaders(),
        body: JSON.stringify({ config, objetivo, duracaoMin: duracao }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { script } = (await res.json()) as { script: string };
      updateConfig((c) => ({ ...c, ultimoRoteiro: script }));
      toast.success("Roteiro gerado");
    } catch (e) {
      toast.error("Falha ao gerar roteiro", {
        description: e instanceof Error ? e.message : "Erro desconhecido",
      });
    } finally {
      setGerando(false);
      setLoading("script", false);
    }
  };

  const gerarTodos = async () => {
    const alvos = config.produtos;
    if (alvos.length === 0) {
      toast.error("Nenhum produto no catálogo");
      return;
    }
    setLote({ feitos: 0, total: alvos.length });
    const novos: Record<string, string> = { ...config.roteirosPorProduto };

    try {
      for (let i = 0; i < alvos.length; i++) {
        const p = alvos[i];
        const res = await fetch("/api/script/generate", {
          method: "POST",
          headers: await aiHeaders(),
          body: JSON.stringify({
            config,
            objetivo: `pitch focado no produto "${p.name}"`,
            duracaoMin: duracao,
            productId: p.id,
          }),
        });
        if (res.ok) {
          const { script } = (await res.json()) as { script: string };
          novos[p.id] = script;
          updateConfig((c) => ({ ...c, roteirosPorProduto: { ...novos } }));
        }
        setLote({ feitos: i + 1, total: alvos.length });
      }
      toast.success(`${alvos.length} roteiro(s) gerado(s)`);
    } catch (e) {
      toast.error("Falha ao gerar em lote", {
        description: e instanceof Error ? e.message : "Erro desconhecido",
      });
    } finally {
      setLote(null);
    }
  };

  const copiar = async (texto: string) => {
    const ok = await copyToClipboard(texto);
    if (ok) toast.success("Roteiro copiado");
    else toast.error("Não consegui copiar — selecione o texto e copie manualmente");
  };

  const ocupado = gerando || loading.script;
  const comRoteiro = config.produtos.filter((p) => config.roteirosPorProduto[p.id]);

  return (
    <div className="app-section">
      <div className="app-section-head">
        <h2 className="app-section-title">Gerador de roteiro</h2>
      </div>

      <div className="app-card">
        <div className="app-card-head">
          <div>
            <h3 className="app-card-title">Script pronto para você narrar</h3>
            <p className="app-card-desc">
              Usa o contexto da marca acima somado ao produto ativo para montar a fala.
            </p>
          </div>
        </div>

        <div className="app-grid app-grid--3">
          <div className="app-field" style={{ gridColumn: "span 2" }}>
            <label htmlFor="roteiro-objetivo">Objetivo do bloco</label>
            <input
              id="roteiro-objetivo"
              className="app-input"
              value={objetivo}
              onChange={(e) => setObjetivo(e.target.value)}
              placeholder="Ex: abertura, pitch, fechar venda, reengajar"
            />
          </div>
          <div className="app-field">
            <label htmlFor="roteiro-duracao">Duração (min)</label>
            <input
              id="roteiro-duracao"
              className="app-input"
              type="number"
              min={1}
              max={15}
              value={duracao}
              onChange={(e) => setDuracao(Math.min(15, Math.max(1, Number(e.target.value) || 3)))}
            />
          </div>
        </div>

        <div className="app-toolbar" style={{ marginTop: 16, marginBottom: 0 }}>
          <button
            type="button"
            className="app-btn app-btn--primary"
            onClick={gerar}
            disabled={ocupado}
          >
            {ocupado ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles aria-hidden="true" />
            )}
            {ocupado ? "Gerando…" : "Gerar roteiro"}
          </button>
          <button
            type="button"
            className="app-btn"
            onClick={gerarTodos}
            disabled={lote !== null || config.produtos.length === 0}
          >
            {lote ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                {lote.feitos}/{lote.total}
              </>
            ) : (
              <>
                <FileText aria-hidden="true" />
                Gerar um para cada produto ({config.produtos.length})
              </>
            )}
          </button>
        </div>
      </div>

      {comRoteiro.length > 0 ? (
        <div className="app-card" style={{ marginTop: 16 }}>
          <div className="app-card-head">
            <h3 className="app-card-title">Roteiros por produto</h3>
          </div>
          {comRoteiro.map((p) => (
            <details key={p.id} className="app-card app-card--flat" style={{ marginBottom: 8 }}>
              <summary
                title={p.name}
                style={{
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 14,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {p.name}
                {formatarPreco(p) ? ` · ${formatarPreco(p)}` : ""}
              </summary>
              <div className="app-toolbar" style={{ marginTop: 12, marginBottom: 8 }}>
                <div className="app-toolbar-end">
                  <button
                    type="button"
                    className="app-btn app-btn--sm app-btn--ghost"
                    onClick={() => void copiar(config.roteirosPorProduto[p.id])}
                  >
                    <Copy aria-hidden="true" />
                    Copiar
                  </button>
                </div>
              </div>
              <textarea
                className="app-textarea"
                style={ESTILO_ROTEIRO}
                value={config.roteirosPorProduto[p.id]}
                onChange={(e) =>
                  updateConfig((c) => ({
                    ...c,
                    roteirosPorProduto: { ...c.roteirosPorProduto, [p.id]: e.target.value },
                  }))
                }
              />
            </details>
          ))}
        </div>
      ) : null}

      {config.ultimoRoteiro ? (
        <div className="app-card" style={{ marginTop: 16 }}>
          <div className="app-card-head">
            <h3 className="app-card-title">Último roteiro</h3>
            <button
              type="button"
              className="app-btn app-btn--sm app-btn--ghost"
              onClick={() => void copiar(config.ultimoRoteiro)}
            >
              <Copy aria-hidden="true" />
              Copiar
            </button>
          </div>
          <textarea
            className="app-textarea"
            style={{ ...ESTILO_ROTEIRO, minHeight: 300 }}
            value={config.ultimoRoteiro}
            onChange={(e) => updateConfig((c) => ({ ...c, ultimoRoteiro: e.target.value }))}
          />
        </div>
      ) : null}
    </div>
  );
}
