import {
  Check,
  MessageSquare,
  Package,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Volume2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useLiveStore } from "@/stores/useLiveStore";
import { useShallow } from "zustand/react/shallow";
import { useSyncedUpdateConfig } from "@/hooks/live/useLiveControls";
import { APP_VERSION } from "@/lib/live/version";
import { formatarPreco } from "./produto";
import { derivarPassos, passoAtual } from "./passos";
import type { SectionId } from "./sections";

/**
 * A tela de entrada do painel: onde o usuário está no caminho até a primeira
 * venda, os números que ele confere antes de subir, e as quatro chaves que ele
 * mais liga e desliga. Tudo o que é ajuste fino mora nas outras seções.
 */
export function InicioSection({
  extensaoInstalada,
  syncToken,
  vendas,
  onSelect,
}: {
  extensaoInstalada: boolean;
  syncToken: string | null;
  vendas: number | null;
  onSelect: (id: SectionId) => void;
}) {
  const config = useLiveStore(useShallow((state) => state.config));
  const updateConfig = useSyncedUpdateConfig();

  const passos = derivarPassos(config, { extensaoInstalada, syncToken });
  const feitos = passos.filter((p) => p.feito).length;
  const atual = passoAtual(passos);
  const pct = Math.round((feitos / passos.length) * 100);

  const produtoAtivo = config.produtos.find((p) => p.active) ?? null;
  const iaRespondendo = config.respostasIA || config.responderNoChat;

  const set = <K extends keyof typeof config>(chave: K, valor: (typeof config)[K]) =>
    updateConfig((c) => ({ ...c, [chave]: valor }));

  const ativarProduto = (id: string) =>
    updateConfig((c) => ({
      ...c,
      produtos: c.produtos.map((p) => ({ ...p, active: p.id === id })),
    }));

  return (
    <>
      <div className="app-section">
        <div className="app-grid app-grid--4">
          <div className="app-stat">
            <span className="app-stat-label">
              <ShoppingBag aria-hidden="true" />
              Vendas
            </span>
            <div className="app-stat-value" data-tone={vendas ? "ok" : undefined}>
              {vendas === null ? "—" : vendas}
            </div>
            <p className="app-stat-hint">na sua sessão mais recente</p>
          </div>

          <div className="app-stat">
            <span className="app-stat-label">
              <Package aria-hidden="true" />
              Produtos
            </span>
            <div className="app-stat-value">{config.produtos.length}</div>
            {/* Nome longo aqui esticaria a altura do cartão e desalinharia a
                linha inteira de estatísticas — daí o corte em uma linha. */}
            <p
              className="app-stat-hint"
              title={produtoAtivo?.name}
              style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {produtoAtivo ? `ativo: ${produtoAtivo.name}` : "nenhum produto ativo"}
            </p>
          </div>

          <div className="app-stat">
            <span className="app-stat-label">
              <Sparkles aria-hidden="true" />
              IA
            </span>
            <div className="app-stat-value" data-tone={iaRespondendo ? "ok" : "warn"}>
              {iaRespondendo ? "Respondendo" : "Parada"}
            </div>
            <p className="app-stat-hint">
              {config.respostasIA ? "por voz" : "voz desligada"}
              {config.responderNoChat ? " e no chat" : ""}
            </p>
          </div>

          <div className="app-stat">
            <span className="app-stat-label">
              <ShieldCheck aria-hidden="true" />
              Versão
            </span>
            <div className="app-stat-value">v{APP_VERSION}</div>
            <p className="app-stat-hint">licença ativa</p>
          </div>
        </div>
      </div>

      <div className="app-section">
        <div className="app-card">
          <div className="app-card-head">
            <div>
              <h2 className="app-card-title">Seu passo a passo</h2>
              <p className="app-card-desc">
                {feitos === passos.length
                  ? "Tudo pronto. Pode subir a live."
                  : "Clique em qualquer passo para ir direto ao ajuste."}
              </p>
            </div>
            <span className="app-tag" data-tone={feitos === passos.length ? "ok" : "accent"}>
              {feitos} de {passos.length}
            </span>
          </div>

          <div
            className="app-progress"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="app-progress-fill" style={{ width: `${pct}%` }} />
          </div>

          <div className="app-steps" style={{ marginTop: 16 }}>
            {passos.map((passo, i) => (
              <button
                key={passo.id}
                type="button"
                className="app-step"
                data-state={passo.feito ? "done" : i === atual ? "current" : "todo"}
                onClick={() => onSelect(passo.destino)}
              >
                <span className="app-step-num">
                  {passo.feito ? <Check aria-hidden="true" /> : i + 1}
                </span>
                <span className="app-step-body">
                  <span className="app-step-title">{passo.titulo}</span>
                  <span className="app-step-desc">{passo.descricao}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="app-section">
        <div className="app-section-head">
          <h2 className="app-section-title">Produto que a IA vai vender</h2>
          <button
            type="button"
            className="app-btn app-btn--sm"
            onClick={() => onSelect("produtos")}
          >
            Gerenciar catálogo
          </button>
        </div>

        {config.produtos.length === 0 ? (
          <div className="app-card app-card--flat">
            <div className="app-empty">
              <p className="app-empty-title">Nenhum produto ainda</p>
              <p>Importe a vitrine do TikTok ou cadastre o primeiro produto à mão.</p>
            </div>
          </div>
        ) : (
          <div className="app-card">
            {/* Lista de produtos no mesmo padrão do "passo a passo": uma linha
                por produto, com o escolhido destacado. O antigo segment de
                botões lado a lado quebrava com nomes longos do TikTok. */}
            <div className="app-steps">
              {config.produtos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="app-step"
                  data-state={p.active ? "current" : "todo"}
                  aria-pressed={p.active}
                  onClick={() => ativarProduto(p.id)}
                  title={p.name}
                >
                  <span className="app-step-num">
                    {p.active ? (
                      <Check aria-hidden="true" />
                    ) : (
                      <Package aria-hidden="true" />
                    )}
                  </span>
                  <span className="app-step-body">
                    <span
                      className="app-step-title"
                      style={{
                        whiteSpace: "normal",
                        overflowWrap: "anywhere",
                        textAlign: "left",
                      }}
                    >
                      {p.name}
                    </span>
                    {p.active && p.description ? (
                      <span
                        className="app-step-desc"
                        style={{
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {p.description}
                      </span>
                    ) : null}
                  </span>
                  {formatarPreco(p) ? (
                    <span className="app-tag" data-tone={p.active ? "accent" : undefined}>
                      {formatarPreco(p)}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="app-section">
        <div className="app-section-head">
          <h2 className="app-section-title">Chaves do dia a dia</h2>
        </div>
        <div className="app-grid app-grid--2">
          <ChaveRapida
            icon={<Sparkles aria-hidden="true" />}
            titulo="Responder por voz"
            descricao="Lê os comentários e responde falando, com o produto ativo."
            checked={config.respostasIA}
            onChange={(v) => set("respostasIA", v)}
          />
          <ChaveRapida
            icon={<MessageSquare aria-hidden="true" />}
            titulo="Responder no chat"
            descricao="Digita respostas curtas no chat do TikTok, com intervalo anti-spam."
            checked={config.responderNoChat}
            onChange={(v) => set("responderNoChat", v)}
          />
          <ChaveRapida
            icon={<ShieldCheck aria-hidden="true" />}
            titulo="Proteção da live"
            descricao="Vigia a tela e filtra o chat antes de qualquer coisa chegar na IA."
            checked={config.protecaoGeral}
            onChange={(v) => set("protecaoGeral", v)}
          />
          <ChaveRapida
            icon={<Volume2 aria-hidden="true" />}
            titulo="Avisar cada venda"
            descricao="Toca o som de caixa registradora quando a extensão detecta um pedido."
            checked={config.notificacoesVenda}
            onChange={(v) => set("notificacoesVenda", v)}
          />
        </div>
      </div>
    </>
  );
}

function ChaveRapida({
  icon,
  titulo,
  descricao,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  titulo: string;
  descricao: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="app-card">
      <div className="app-card-head" style={{ marginBottom: 0 }}>
        <div>
          <h3 className="app-card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="app-stat-label" style={{ margin: 0 }}>
              {icon}
            </span>
            {titulo}
          </h3>
          <p className="app-card-desc">{descricao}</p>
        </div>
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
  );
}
