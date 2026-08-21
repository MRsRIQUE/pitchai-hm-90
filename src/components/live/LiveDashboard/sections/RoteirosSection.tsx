import { useEffect, useMemo, useState } from "react";
import { Copy, FileText, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { copyToClipboard } from "@/lib/clipboard";
import { aiHeaders } from "@/lib/live/ai-headers";
import { SCRIPT_OBJECTIVES, SCRIPT_STYLES, type ScriptStyle } from "@/lib/live/script-generation";
import { useLiveStore } from "@/stores/useLiveStore";
import { formatarPreco } from "./produto";

const ESTILO_ROTEIRO = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 13,
  lineHeight: 1.65,
  minHeight: 280,
} as const;

type ScriptResponse = {
  script: string;
  productId: string;
  targetWords: number;
  tokenRemaining?: number;
};

async function readError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return String(body?.error || `Falha ao gerar roteiro (${response.status}).`);
}

export function RoteirosSection() {
  const { config, loading, updateConfig, setLoading } = useLiveStore(
    useShallow((state) => ({
      config: state.config,
      loading: state.loading,
      updateConfig: state.actions.updateConfig,
      setLoading: state.actions.setLoading,
    })),
  );
  const activeProduct = config.produtos.find((product) => product.active) ?? config.produtos[0];
  const [productId, setProductId] = useState(activeProduct?.id ?? "");
  const [objective, setObjective] = useState<string>(SCRIPT_OBJECTIVES[0]);
  const [style, setStyle] = useState<ScriptStyle>("natural");
  const [duration, setDuration] = useState(3);
  const [cta, setCta] = useState("");
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [batch, setBatch] = useState<{ done: number; total: number; failures: number } | null>(
    null,
  );

  useEffect(() => {
    if (productId && config.produtos.some((product) => product.id === productId)) return;
    setProductId(activeProduct?.id ?? "");
  }, [activeProduct?.id, config.produtos, productId]);

  const selectedProduct = config.produtos.find((product) => product.id === productId) ?? null;
  const scripts = useMemo(
    () => config.produtos.filter((product) => config.roteirosPorProduto[product.id]),
    [config.produtos, config.roteirosPorProduto],
  );

  const requestScript = async (targetProductId: string): Promise<ScriptResponse> => {
    const targetProduct = config.produtos.find((product) => product.id === targetProductId);
    if (!targetProduct) throw new Error("Produto não encontrado no catálogo.");
    const response = await fetch("/api/script/generate", {
      method: "POST",
      headers: await aiHeaders(),
      body: JSON.stringify({
        config: { produtos: [targetProduct], aiContext: config.aiContext },
        objetivo: objective,
        duracaoMin: duration,
        productId: targetProductId,
        style,
        cta: cta.trim() || undefined,
      }),
    });
    if (!response.ok) throw new Error(await readError(response));
    return response.json() as Promise<ScriptResponse>;
  };

  const saveScript = (targetProductId: string, script: string) => {
    updateConfig((current) => ({
      ...current,
      ultimoRoteiro: script,
      roteirosPorProduto: { ...current.roteirosPorProduto, [targetProductId]: script },
    }));
  };

  const generateOne = async (targetProductId = productId) => {
    if (!targetProductId) {
      toast.error("Selecione um produto");
      return;
    }
    setGeneratingId(targetProductId);
    setLoading("script", true);
    try {
      const result = await requestScript(targetProductId);
      saveScript(targetProductId, result.script);
      toast.success("Roteiro gerado e salvo no produto");
    } catch (error) {
      toast.error("Falha ao gerar roteiro", {
        description: error instanceof Error ? error.message : "Erro desconhecido",
      });
    } finally {
      setGeneratingId(null);
      setLoading("script", false);
    }
  };

  const generateAll = async () => {
    if (!config.produtos.length) {
      toast.error("Adicione um produto antes de gerar roteiros");
      return;
    }
    const targets = config.produtos.slice(0, 20);
    let failures = 0;
    let completed = 0;
    setBatch({ done: 0, total: targets.length, failures: 0 });
    setLoading("script", true);
    try {
      for (const product of targets) {
        try {
          const result = await requestScript(product.id);
          saveScript(product.id, result.script);
        } catch (error) {
          failures += 1;
          console.warn(`[roteiros] falha em ${product.id}:`, error);
        }
        completed += 1;
        setBatch({ done: completed, total: targets.length, failures });
      }
      if (failures) {
        toast.warning(`${targets.length - failures} gerado(s), ${failures} com falha.`);
      } else {
        toast.success(`${targets.length} roteiro(s) gerado(s) e salvos.`);
      }
      if (config.produtos.length > targets.length) {
        toast.info("Foram processados os primeiros 20 produtos para respeitar o limite da IA.");
      }
    } finally {
      setBatch(null);
      setLoading("script", false);
    }
  };

  const copy = async (text: string) => {
    if (await copyToClipboard(text)) toast.success("Roteiro copiado");
    else toast.error("Não consegui copiar; selecione o texto manualmente.");
  };

  const busy = loading.script || generatingId !== null || batch !== null;
  const currentScript = selectedProduct ? config.roteirosPorProduto[selectedProduct.id] || "" : "";
  const wordCount = currentScript.trim() ? currentScript.trim().split(/\s+/).length : 0;

  return (
    <div className="app-section">
      <div className="app-section-head">
        <div>
          <h2 className="app-section-title">Gerador de roteiros</h2>
          <p className="app-section-desc">
            Monte uma fala completa, pronta para narrar e vinculada ao produto escolhido.
          </p>
        </div>
      </div>

      <div className="app-card">
        <div className="app-card-head">
          <div>
            <h3 className="app-card-title">Configure a fala</h3>
            <p className="app-card-desc">
              A IA usa os dados reais do produto e o contexto da sua marca.
            </p>
          </div>
          <span className="app-tag" data-tone="accent">
            <Sparkles aria-hidden="true" /> {duration * 130} palavras estimadas
          </span>
        </div>

        {!config.produtos.length ? (
          <div className="app-empty">
            <p className="app-empty-title">Nenhum produto cadastrado</p>
            <p>Adicione ou importe produtos antes de gerar um roteiro.</p>
          </div>
        ) : (
          <>
            <div className="app-grid app-grid--2">
              <div className="app-field">
                <label htmlFor="script-product">Produto</label>
                <select
                  id="script-product"
                  className="app-select"
                  value={productId}
                  onChange={(event) => setProductId(event.currentTarget.value)}
                >
                  {config.produtos.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                      {product.active ? " · ativo" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="app-field">
                <label htmlFor="script-objective">Objetivo</label>
                <select
                  id="script-objective"
                  className="app-select"
                  value={objective}
                  onChange={(event) => setObjective(event.currentTarget.value)}
                >
                  {SCRIPT_OBJECTIVES.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </div>

              <div className="app-field">
                <label htmlFor="script-style">Estilo da fala</label>
                <select
                  id="script-style"
                  className="app-select"
                  value={style}
                  onChange={(event) => setStyle(event.currentTarget.value as ScriptStyle)}
                >
                  {SCRIPT_STYLES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="app-field">
                <label htmlFor="script-duration">Duração aproximada</label>
                <select
                  id="script-duration"
                  className="app-select"
                  value={duration}
                  onChange={(event) => setDuration(Number(event.currentTarget.value))}
                >
                  {[1, 2, 3, 5, 8, 10, 15].map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes} min
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="app-field" style={{ marginTop: 16 }}>
              <label htmlFor="script-cta">Chamada final personalizada (opcional)</label>
              <input
                id="script-cta"
                className="app-input"
                value={cta}
                maxLength={240}
                onChange={(event) => setCta(event.currentTarget.value)}
                placeholder="Ex.: clique no produto fixado para ver as opções"
              />
              <span className="app-field-hint">
                Preços e promoções só serão usados quando estiverem cadastrados no produto.
              </span>
            </div>

            <div className="app-toolbar" style={{ marginTop: 16, marginBottom: 0 }}>
              <button
                type="button"
                className="app-btn app-btn--primary"
                onClick={() => void generateOne()}
                disabled={busy || !productId}
              >
                {generatingId === productId ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {currentScript ? "Gerar nova versão" : "Gerar roteiro"}
              </button>
              <button
                type="button"
                className="app-btn"
                onClick={() => void generateAll()}
                disabled={busy}
              >
                {batch ? <Loader2 className="animate-spin" /> : <FileText />}
                {batch
                  ? `${batch.done}/${batch.total}${batch.failures ? ` · ${batch.failures} falha(s)` : ""}`
                  : `Gerar para todos (${Math.min(20, config.produtos.length)})`}
              </button>
            </div>
          </>
        )}
      </div>

      {selectedProduct && currentScript ? (
        <div className="app-card" style={{ marginTop: 16 }}>
          <div className="app-card-head">
            <div>
              <h3 className="app-card-title">{selectedProduct.name}</h3>
              <p className="app-card-desc">
                {formatarPreco(selectedProduct) || "Preço não informado"} · {wordCount} palavras ·
                aproximadamente {Math.max(1, Math.round(wordCount / 130))} min
              </p>
            </div>
            <div className="app-table-actions">
              <button
                type="button"
                className="app-btn app-btn--sm app-btn--ghost"
                onClick={() => void generateOne(selectedProduct.id)}
                disabled={busy}
              >
                <RefreshCw /> Nova versão
              </button>
              <button
                type="button"
                className="app-btn app-btn--sm app-btn--ghost"
                onClick={() => void copy(currentScript)}
              >
                <Copy /> Copiar
              </button>
            </div>
          </div>
          <textarea
            className="app-textarea"
            style={ESTILO_ROTEIRO}
            value={currentScript}
            onChange={(event) => saveScript(selectedProduct.id, event.currentTarget.value)}
            aria-label={`Roteiro de ${selectedProduct.name}`}
          />
        </div>
      ) : null}

      {scripts.length > 1 ? (
        <div className="app-card" style={{ marginTop: 16 }}>
          <div className="app-card-head">
            <div>
              <h3 className="app-card-title">Biblioteca por produto</h3>
              <p className="app-card-desc">{scripts.length} produtos com roteiro salvo.</p>
            </div>
          </div>
          <div className="app-steps">
            {scripts.map((product) => (
              <button
                key={product.id}
                type="button"
                className="app-step"
                data-state={product.id === productId ? "current" : "done"}
                onClick={() => setProductId(product.id)}
              >
                <FileText aria-hidden="true" />
                <span className="min-w-0 text-left">
                  <strong className="block truncate">{product.name}</strong>
                  <small>
                    {config.roteirosPorProduto[product.id].trim().split(/\s+/).length} palavras
                  </small>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
