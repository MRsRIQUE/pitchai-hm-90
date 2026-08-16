import { AudioLines, MessageSquare, ShoppingBag, Sparkles, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useLiveStore } from "@/stores/useLiveStore";
import { useShallow } from "zustand/react/shallow";
import { useSyncedUpdateConfig } from "@/hooks/live/useLiveControls";
import { playSaleSound, unlockSaleSound } from "@/lib/live/sale-sound";
import { pushLiveConfigFields } from "@/lib/live/sync";
import type { LiveConfig } from "@/lib/live/config";

/** O que a IA faz sozinha enquanto o usuário está ocupado vendendo. */
export function AutomacoesSection() {
  const config = useLiveStore(useShallow((state) => state.config));
  const updateConfig = useSyncedUpdateConfig();

  const produtoAtivo = config.produtos.find((p) => p.active) ?? null;

  // O banco de pitches muda o agendador da extensão, então precisa ir junto no
  // doc compartilhado — o ciclo normal de config demoraria demais.
  const updatePitchBank = (value: LiveConfig["pitchBank"]) => {
    updateConfig((c) => ({ ...c, pitchBank: value }));
    void pushLiveConfigFields({ pitchBank: value }).catch((error) => {
      console.error("[AutomacoesSection] falha ao sincronizar banco de pitches:", error);
      toast.error("Não consegui atualizar o banco de pitches na extensão");
    });
  };

  return (
    <>
      <div className="app-section">
        <div className="app-card">
          <div className="app-card-head" style={{ marginBottom: 0 }}>
            <div>
              <h2
                className="app-card-title"
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <span className="app-stat-label" style={{ margin: 0 }}>
                  <Sparkles aria-hidden="true" />
                </span>
                Respostas automáticas por voz
              </h2>
              <p className="app-card-desc">
                Lê os comentários e responde falando, usando o produto ativo
                {produtoAtivo ? ` (${produtoAtivo.name})` : " — nenhum produto marcado como ativo"}.
              </p>
            </div>
            <Switch
              checked={config.respostasIA}
              onCheckedChange={(v) => updateConfig((c) => ({ ...c, respostasIA: v }))}
            />
          </div>
        </div>
      </div>

      <div className="app-section">
        <div className="app-card">
          <div className="app-card-head" style={{ marginBottom: 0 }}>
            <div>
              <h2
                className="app-card-title"
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <span className="app-stat-label" style={{ margin: 0 }}>
                  <MessageSquare aria-hidden="true" />
                </span>
                Responder no chat automaticamente
              </h2>
              <p className="app-card-desc">
                Digita respostas curtas no chat do TikTok com intervalo anti-spam. Nunca substitui
                uma mensagem que você estiver digitando.
              </p>
            </div>
            <Switch
              checked={config.responderNoChat}
              onCheckedChange={(v) => updateConfig((c) => ({ ...c, responderNoChat: v }))}
            />
          </div>
        </div>
      </div>

      <div className="app-section">
        <div className="app-card">
          <div className="app-card-head">
            <div>
              <h2
                className="app-card-title"
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <span className="app-stat-label" style={{ margin: 0 }}>
                  <AudioLines aria-hidden="true" />
                </span>
                Banco econômico de pitches
              </h2>
              <p className="app-card-desc">
                Gera um pacote por hora e reaproveita texto e áudio. O agendador espera cada fala
                terminar antes de começar a próxima.
              </p>
            </div>
            <Switch
              checked={config.pitchBank.enabled}
              onCheckedChange={(enabled) => updatePitchBank({ ...config.pitchBank, enabled })}
            />
          </div>

          <div className="app-grid app-grid--3">
            <div className="app-field">
              <label htmlFor="pitchbank-variantes">Variações por hora</label>
              <input
                id="pitchbank-variantes"
                className="app-input"
                type="number"
                min={10}
                max={15}
                value={config.pitchBank.variants}
                onChange={(e) =>
                  updatePitchBank({
                    ...config.pitchBank,
                    variants: Math.max(10, Math.min(15, Number(e.target.value) || 12)),
                  })
                }
              />
            </div>
            <div className="app-field">
              <label htmlFor="pitchbank-min">Intervalo mínimo (s)</label>
              <input
                id="pitchbank-min"
                className="app-input"
                type="number"
                min={20}
                max={600}
                value={config.pitchBank.minIntervalSec}
                onChange={(e) =>
                  updatePitchBank({
                    ...config.pitchBank,
                    minIntervalSec: Math.max(20, Number(e.target.value) || 45),
                  })
                }
              />
            </div>
            <div className="app-field">
              <label htmlFor="pitchbank-max">Intervalo máximo (s)</label>
              <input
                id="pitchbank-max"
                className="app-input"
                type="number"
                min={20}
                max={900}
                value={config.pitchBank.maxIntervalSec}
                onChange={(e) =>
                  updatePitchBank({
                    ...config.pitchBank,
                    maxIntervalSec: Math.max(20, Number(e.target.value) || 75),
                  })
                }
              />
            </div>
          </div>

          <div className="app-card app-card--flat" style={{ marginTop: 16 }}>
            <div className="app-card-head" style={{ marginBottom: 0 }}>
              <div>
                <h3 className="app-card-title">Reutilizar perguntas frequentes</h3>
                <p className="app-card-desc">
                  Só quando pergunta e produto são os mesmos, por até uma hora.
                </p>
              </div>
              <Switch
                checked={config.pitchBank.cacheReplies}
                onCheckedChange={(cacheReplies) =>
                  updatePitchBank({ ...config.pitchBank, cacheReplies })
                }
              />
            </div>
          </div>
        </div>
      </div>

      <div className="app-section">
        <div className="app-card">
          <div className="app-card-head">
            <div>
              <h2
                className="app-card-title"
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <span className="app-stat-label" style={{ margin: 0 }}>
                  <ShoppingBag aria-hidden="true" />
                </span>
                Notificações de venda
              </h2>
              <p className="app-card-desc">
                Toca o som de caixa registradora a cada venda que a extensão detecta no Gerenciador
                de LIVE.
              </p>
            </div>
            <Switch
              checked={config.notificacoesVenda}
              onCheckedChange={(v) => updateConfig((c) => ({ ...c, notificacoesVenda: v }))}
            />
          </div>

          <div className="app-card app-card--flat">
            <div className="app-card-head" style={{ marginBottom: 12 }}>
              <div>
                <h3 className="app-card-title">Som de caixa registradora</h3>
                <p className="app-card-desc">
                  O navegador bloqueia áudio até o primeiro clique — use o teste para liberar.
                </p>
              </div>
              <Switch
                checked={config.somVenda.enabled}
                onCheckedChange={(enabled) =>
                  updateConfig((c) => ({ ...c, somVenda: { ...c.somVenda, enabled } }))
                }
              />
            </div>

            <div className="app-field">
              <label htmlFor="som-volume">
                Volume — {Math.round(config.somVenda.volume * 100)}%
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Slider
                  id="som-volume"
                  value={[Math.round(config.somVenda.volume * 100)]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={([v]) =>
                    updateConfig((c) => ({
                      ...c,
                      somVenda: { ...c.somVenda, volume: (v ?? 80) / 100 },
                    }))
                  }
                />
                <button
                  type="button"
                  className="app-btn app-btn--sm"
                  onClick={async () => {
                    await unlockSaleSound();
                    await playSaleSound(config.somVenda.volume);
                    toast.success("Som de venda liberado neste navegador");
                  }}
                >
                  <Volume2 aria-hidden="true" />
                  Testar som
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
