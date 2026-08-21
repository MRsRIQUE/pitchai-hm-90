import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Puzzle,
  Rocket,
  ShoppingBag,
  Volume2,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ExtensionStatusBanner,
  fireSuccessConfetti,
} from "@/components/live/ExtensionStatusBanner";
import { useExtensionInstalled } from "@/components/live/LiveDashboard/sections/useExtensionInstalled";
import { aiHeaders } from "@/lib/live/ai-headers";
import { SAMPLE_PHRASE } from "@/lib/live/voices";
import { newProduct, type LiveConfig } from "@/lib/live/config";

/**
 * Configuração inicial — o pop-up do primeiro acesso.
 *
 * Checklist, não wizard: os três passos ficam todos à vista e só o que está em
 * andamento abre. A diferença não é estética — cada passo se marca sozinho a
 * partir do mundo real (a extensão respondeu, o áudio tocou, existe produto no
 * catálogo), em vez de contar cliques em "Continuar". Assim ninguém termina o
 * guia com um passo verde que na verdade não aconteceu.
 *
 * Abre sozinho no primeiro acesso; o `onFinish` marca `onboardingDone`, que é
 * o que impede o guia de voltar.
 */

type PassoId = "extensao" | "audio" | "produto";

export function SetupWizard({
  open,
  onOpenChange,
  cfg,
  setCfg,
  onImportVitrine,
  importing,
  onFinish,
  syncToken,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cfg: LiveConfig;
  setCfg: (updater: (cfg: LiveConfig) => LiveConfig) => void;
  onImportVitrine: () => Promise<void> | void;
  importing?: boolean;
  onFinish: () => void;
  syncToken?: string;
}) {
  const extensaoInstalada = useExtensionInstalled();

  const [aberto, setAberto] = useState<PassoId | null>("extensao");
  const [testing, setTesting] = useState(false);
  const [audioOk, setAudioOk] = useState<boolean | null>(null);
  const [confirmouExtensao, setConfirmouExtensao] = useState(false);
  const [nome, setNome] = useState("");
  const [preco, setPreco] = useState("");

  const temProduto = cfg.produtos.length > 0;
  // A extensão se anuncia sozinha; o check à mão existe para quem acabou de
  // instalar e o navegador ainda não avisou.
  const extensaoOk = extensaoInstalada || confirmouExtensao;
  const audioTestado = audioOk === true;

  const passos = [
    {
      id: "extensao" as const,
      icone: Puzzle,
      titulo: "Instalar a extensão",
      descricao: "É ela que lê o chat da sua live e fixa os produtos.",
      feito: extensaoOk,
    },
    {
      id: "audio" as const,
      icone: Volume2,
      titulo: "Ligar o áudio",
      descricao: "Um clique para confirmar que a voz sai neste computador.",
      feito: audioTestado,
    },
    {
      id: "produto" as const,
      icone: ShoppingBag,
      titulo: "Escolher o produto",
      descricao: "A IA responde com base no produto ativo.",
      feito: temProduto,
    },
  ];

  const feitos = passos.filter((p) => p.feito).length;
  const pct = Math.round((feitos / passos.length) * 100);
  const tudoPronto = feitos === passos.length;
  const primeiroPendente = passos.find((p) => !p.feito)?.id ?? null;

  // Cada abertura do modal começa no primeiro passo que ainda falta: mandar
  // quem já tem a extensão instalada ler de novo como instalar é ruído.
  useEffect(() => {
    if (open) setAberto(primeiroPendente);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Concluiu o passo aberto? O próximo pendente abre sozinho — é o que dava a
  // sensação de avanço no wizard antigo, agora sem botão de "Continuar".
  useEffect(() => {
    if (!open || !aberto) return;
    if (passos.find((p) => p.id === aberto)?.feito) setAberto(primeiroPendente);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, aberto, extensaoOk, audioTestado, temProduto]);

  const testarVoz = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/tts/preview", {
        method: "POST",
        headers: await aiHeaders(),
        body: JSON.stringify({
          text: SAMPLE_PHRASE,
          voice: cfg.voz.id,
          speed: cfg.voz.speed,
        }),
      });
      if (!res.ok) {
        const raw = await res.text();
        let message = raw || `Falha no serviço de voz (${res.status})`;
        try {
          const parsed = JSON.parse(raw) as { message?: string };
          if (parsed.message) message = parsed.message;
        } catch {
          // Mantém o corpo textual quando o servidor não devolve JSON.
        }
        throw new Error(message);
      }
      const audioUrl = URL.createObjectURL(await res.blob());
      const audio = new Audio(audioUrl);
      audio.addEventListener("ended", () => URL.revokeObjectURL(audioUrl), { once: true });
      audio.addEventListener("error", () => URL.revokeObjectURL(audioUrl), { once: true });
      await audio.play();
      setAudioOk(true);
      toast.success("Áudio funcionando");
    } catch (error) {
      setAudioOk(false);
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      toast.error("Não foi possível testar a voz", {
        description:
          error instanceof DOMException && error.name === "NotAllowedError"
            ? "O Chrome bloqueou a reprodução. Clique novamente em Ouvir a voz da IA."
            : message,
      });
    } finally {
      setTesting(false);
    }
  };

  const criarProduto = () => {
    if (!nome.trim()) {
      toast.error("Escreva o nome do produto");
      return;
    }
    setCfg((c) => ({
      ...c,
      produtos: [
        ...c.produtos.map((p) => ({ ...p, active: false })),
        { ...newProduct(), name: nome.trim(), price: preco.trim(), active: true },
      ],
    }));
    setNome("");
    setPreco("");
    toast.success("Produto adicionado");
  };

  const concluir = () => {
    if (tudoPronto) fireSuccessConfetti();
    onFinish();
    onOpenChange(false);
    toast.success(tudoPronto ? "Tudo pronto para a sua live" : "Configuração guardada", {
      description: "O guia não abre mais sozinho — ele fica no botão Configuração inicial.",
    });
  };

  /*
   * Fechar pelo X, pelo ESC ou clicando fora também encerra o onboarding. Sem
   * isso o pop-up voltaria a cada visita ao Início e viraria obstáculo: quem
   * fechou já disse que não quer o guia agora.
   */
  const handleOpenChange = (visivel: boolean) => {
    if (!visivel) onFinish();
    onOpenChange(visivel);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="app-tokens app-modal max-w-2xl gap-0 overflow-hidden border-[var(--app-line)] bg-[var(--app-surface)] p-0 text-[var(--app-ink)]">
        <div className="app-modal-head">
          <span className="app-modal-eyebrow">
            <Rocket aria-hidden="true" />
            Configuração inicial
          </span>
          <DialogHeader>
            <DialogTitle className="app-modal-title">Vamos deixar tudo pronto</DialogTitle>
            <DialogDescription className="app-modal-desc">
              Três passos e a IA já pode vender junto com você na live.
            </DialogDescription>
          </DialogHeader>

          <div className="app-modal-meter">
            <div className="app-modal-meter-row">
              <span>
                <b>{pct}%</b> concluído
              </span>
              <span>
                {feitos} de {passos.length} passos
              </span>
            </div>
            <div
              className="app-modal-progress"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        <div className="app-modal-body">
          <div className="app-tasks">
            {passos.map((passo) => {
              const estado = passo.feito ? "done" : aberto === passo.id ? "current" : "todo";
              const Icone = passo.icone;
              return (
                <div
                  key={passo.id}
                  className="app-task"
                  data-state={estado}
                  data-open={aberto === passo.id}
                >
                  <button
                    type="button"
                    className="app-task-head"
                    aria-expanded={aberto === passo.id}
                    onClick={() => setAberto(aberto === passo.id ? null : passo.id)}
                  >
                    <span className="app-task-icon">
                      {passo.feito ? <Check aria-hidden="true" /> : <Icone aria-hidden="true" />}
                    </span>
                    <span className="app-task-info">
                      <span className="app-task-title">{passo.titulo}</span>
                      <span className="app-task-desc">{passo.descricao}</span>
                    </span>
                    {passo.feito ? (
                      <span className="app-tag" data-tone="ok">
                        Concluído
                      </span>
                    ) : aberto === passo.id ? (
                      <span className="app-tag" data-tone="accent">
                        Agora
                      </span>
                    ) : null}
                    <ChevronDown className="app-task-chevron" aria-hidden="true" />
                  </button>

                  {aberto === passo.id ? (
                    <div className="app-task-panel">
                      {passo.id === "extensao" ? (
                        <>
                          <ExtensionStatusBanner syncToken={syncToken} />

                          <div className="app-hint-grid">
                            <div className="app-hint">
                              <span className="app-hint-title">1. Clique em baixar</span>
                              <p className="app-hint-desc">
                                Você recebe um arquivo .zip com a extensão.
                              </p>
                            </div>
                            <div className="app-hint">
                              <span className="app-hint-title">2. Extraia a pasta</span>
                              <p className="app-hint-desc">
                                Descompacte o arquivo no seu computador.
                              </p>
                            </div>
                            <div className="app-hint">
                              <span className="app-hint-title">3. Arraste pro Chrome</span>
                              <p className="app-hint-desc">
                                Em chrome://extensions com o Modo Dev ativo.
                              </p>
                            </div>
                          </div>

                          <label className="app-confirm" data-checked={confirmouExtensao}>
                            <Checkbox
                              checked={confirmouExtensao}
                              onCheckedChange={(v) => setConfirmouExtensao(v === true)}
                            />
                            <span className="app-confirm-text">
                              Já instalei a extensão no meu Chrome. Se ela ainda não aparecer como
                              ativa aqui, recarrego esta página depois.
                            </span>
                          </label>

                          <div>
                            <Link
                              to="/download"
                              target="_blank"
                              rel="noreferrer"
                              className="app-btn app-btn--sm"
                            >
                              Ver o passo a passo ilustrado
                            </Link>
                          </div>
                        </>
                      ) : null}

                      {passo.id === "audio" ? (
                        <>
                          <p className="app-card-desc" style={{ margin: 0 }}>
                            Clique em ouvir. Se você escutar a voz, este passo se marca sozinho.
                          </p>
                          <div>
                            <button
                              type="button"
                              className="app-btn app-btn--primary"
                              onClick={() => void testarVoz()}
                              disabled={testing}
                            >
                              {testing ? (
                                <Loader2 aria-hidden="true" className="animate-spin" />
                              ) : (
                                <Volume2 aria-hidden="true" />
                              )}
                              Ouvir a voz da IA
                            </button>
                          </div>
                          {audioOk === false ? (
                            <div className="app-alert" data-tone="warn">
                              <span>
                                Não ouviu nada? Confira o volume do computador. Para mandar a voz
                                para dentro da live você escolhe o cabo virtual (VB-Cable no
                                Windows, BlackHole no Mac) na seção <b>Voz</b> do painel.
                              </span>
                            </div>
                          ) : null}
                        </>
                      ) : null}

                      {passo.id === "produto" ? (
                        <>
                          <p className="app-card-desc" style={{ margin: 0 }}>
                            Traga a vitrine do TikTok de uma vez, ou cadastre um produto à mão.
                          </p>
                          <div>
                            <button
                              type="button"
                              className="app-btn"
                              onClick={() => void onImportVitrine()}
                              disabled={importing}
                            >
                              {importing ? (
                                <Loader2 aria-hidden="true" className="animate-spin" />
                              ) : null}
                              Sincronizar da vitrine
                            </button>
                          </div>
                          <div
                            style={{
                              display: "grid",
                              gap: 8,
                              gridTemplateColumns: "1fr 130px auto",
                            }}
                          >
                            <input
                              className="app-input"
                              placeholder="Nome do produto"
                              value={nome}
                              onChange={(e) => setNome(e.target.value)}
                            />
                            <input
                              className="app-input"
                              placeholder="R$ 99,90"
                              value={preco}
                              onChange={(e) => setPreco(e.target.value)}
                            />
                            <button type="button" className="app-btn" onClick={criarProduto}>
                              Adicionar
                            </button>
                          </div>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="app-modal-foot">
          <button
            type="button"
            className="app-btn app-btn--sm app-btn--ghost"
            onClick={() => {
              onFinish();
              onOpenChange(false);
            }}
          >
            Configurar depois
          </button>

          <div className="app-modal-foot-end">
            <button
              type="button"
              className="app-btn app-btn--sm app-btn--primary"
              onClick={concluir}
            >
              <CheckCircle2 aria-hidden="true" />
              {tudoPronto ? "Tudo pronto — ir para o painel" : "Concluir configuração"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
