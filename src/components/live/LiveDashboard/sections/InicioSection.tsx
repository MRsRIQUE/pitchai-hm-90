import {
  Check,
  MessageSquare,
  Package,
  Puzzle,
  Radio,
  Rocket,
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
import { ProdutoThumb } from "./ProdutoThumb";
import { derivarPassos, passoAtual } from "./passos";
import { serieDeVendas, topProdutos, totalDeVendas } from "./vendas";
import { LegendaVendas, VendasChart } from "./VendasChart";
import { useSessoes } from "./useSessoes";
import type { SectionId } from "./sections";

/**
 * A tela de entrada do painel.
 *
 * Painel, não lista: o estado da operação em uma faixa no topo, os números
 * logo abaixo, e então duas colunas — à esquerda o desempenho da operação
 * (vendas da semana e os produtos que mais vendem) com as chaves do dia a dia,
 * à direita o que o vendedor só acompanha. O catálogo inteiro não mora mais
 * aqui: quem precisa mexer em produto vai para a seção Produtos, e o Início
 * mostra só o topo do ranking — que é onde a decisão acontece.
 */
export function InicioSection({
  extensaoInstalada,
  syncToken,
  vendas,
  onSelect,
  onAbrirConfiguracao,
}: {
  extensaoInstalada: boolean;
  syncToken: string | null;
  vendas: number | null;
  onSelect: (id: SectionId) => void;
  onAbrirConfiguracao: () => void;
}) {
  const config = useLiveStore(useShallow((state) => state.config));
  const updateConfig = useSyncedUpdateConfig();
  const { sessoes, carregando } = useSessoes();

  const passos = derivarPassos(config, { extensaoInstalada, syncToken });
  const feitos = passos.filter((p) => p.feito).length;
  const atual = passoAtual(passos);
  const pct = Math.round((feitos / passos.length) * 100);
  const pronto = feitos === passos.length;

  const produtoAtivo = config.produtos.find((p) => p.active) ?? null;
  const iaRespondendo = config.respostasIA || config.responderNoChat;
  const extensaoConectada = extensaoInstalada && Boolean(syncToken);

  const serie = serieDeVendas(sessoes);
  const vendasNaSemana = totalDeVendas(serie);
  const ranking = topProdutos(sessoes, config.produtos);
  const semHistorico = sessoes.length === 0;

  // Sem nenhuma live registrada o ranking nasce vazio. Em vez de um cartão
  // morto, o painel mostra o catálogo — o vendedor ainda consegue escolher o
  // produto ativo daqui, que é a ação que ele veio fazer.
  const linhasDoRanking = ranking.length
    ? ranking
    : config.produtos.slice(0, 5).map((p) => ({ id: p.id, nome: p.name, vendas: 0, produto: p }));
  const maiorVenda = Math.max(1, ...linhasDoRanking.map((l) => l.vendas));

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
        <div className="app-hero" data-tone={pronto ? "ok" : "warn"}>
          <span className="app-hero-icon">
            {pronto ? <Radio aria-hidden="true" /> : <Rocket aria-hidden="true" />}
          </span>
          <div className="app-hero-body">
            <p className="app-hero-title">
              {pronto
                ? "Tudo pronto — é só subir a live"
                : `Faltam ${passos.length - feitos} ajuste${passos.length - feitos > 1 ? "s" : ""} antes da live`}
            </p>
            <p className="app-hero-desc">
              {pronto
                ? "Extensão conectada, produto escolhido e proteção ligada."
                : (passos[atual]?.descricao ?? "Continue de onde parou pela lista de preparação.")}
            </p>
          </div>
          <div className="app-hero-actions">
            <button
              type="button"
              className="app-btn app-btn--primary"
              onClick={() => onSelect(pronto ? "live" : (passos[atual]?.destino ?? "live"))}
            >
              {pronto ? <Radio aria-hidden="true" /> : null}
              {pronto ? "Abrir a live" : "Continuar de onde parei"}
            </button>
            <button type="button" className="app-btn" onClick={onAbrirConfiguracao}>
              <Rocket aria-hidden="true" />
              Configuração inicial
            </button>
          </div>
        </div>
      </div>

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
            <div
              className="app-stat-value"
              data-size="sm"
              data-tone={iaRespondendo ? "ok" : "warn"}
            >
              {iaRespondendo ? "Respondendo" : "Parada"}
            </div>
            <p className="app-stat-hint">
              {config.respostasIA ? "por voz" : "voz desligada"}
              {config.responderNoChat ? " e no chat" : ""}
            </p>
          </div>

          {/* No lugar da versão: num painel de operação o que importa é se a
              ponte com o navegador está de pé. A versão continua no rodapé
              da sidebar, onde ninguém precisa dela para decidir nada. */}
          <div className="app-stat">
            <span className="app-stat-label">
              <Puzzle aria-hidden="true" />
              Extensão
            </span>
            <div
              className="app-stat-value"
              data-size="sm"
              data-tone={extensaoConectada ? "ok" : "warn"}
            >
              {extensaoConectada ? "Conectada" : extensaoInstalada ? "Sem chave" : "Ausente"}
            </div>
            <p className="app-stat-hint">
              {extensaoConectada
                ? "lendo o chat do TikTok Shop"
                : extensaoInstalada
                  ? "instalada, falta parear a conta"
                  : "instale para a IA entrar na live"}
            </p>
          </div>
        </div>
      </div>

      <div className="app-section">
        <div className="app-cols">
          <div className="app-col">
            <div className="app-card">
              <div className="app-card-head">
                <div>
                  <h2 className="app-card-title">Vendas da semana</h2>
                  <p className="app-card-desc">
                    Pedidos detectados na live, contra o que a IA respondeu no chat.
                  </p>
                </div>
                <LegendaVendas />
              </div>

              {semHistorico ? (
                <div className="app-empty">
                  <p className="app-empty-title">
                    {carregando ? "Carregando suas lives…" : "Nenhuma live registrada ainda"}
                  </p>
                  <p>
                    O gráfico se preenche sozinho a partir da sua primeira transmissão com a
                    extensão conectada.
                  </p>
                </div>
              ) : (
                <>
                  <VendasChart serie={serie} />
                  <div className="app-chart-foot">
                    <span>
                      <b>{vendasNaSemana}</b> pedido{vendasNaSemana === 1 ? "" : "s"} nos últimos 7
                      dias
                    </span>
                    {config.uiMode === "avancado" ? (
                      <button
                        type="button"
                        className="app-btn app-btn--sm"
                        onClick={() => onSelect("desempenho")}
                      >
                        Ver desempenho
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </div>

            <div className="app-card">
              <div className="app-card-head">
                <div>
                  <h2 className="app-card-title">Produtos que mais vendem</h2>
                  <p className="app-card-desc">
                    {ranking.length
                      ? "Cada pedido conta para o produto que a IA estava apresentando na hora."
                      : "Ainda sem vendas registradas — escolha aqui o produto que a IA vai vender."}
                  </p>
                </div>
                <button
                  type="button"
                  className="app-btn app-btn--sm"
                  onClick={() => onSelect("produtos")}
                >
                  Ver catálogo
                </button>
              </div>

              {linhasDoRanking.length === 0 ? (
                <div className="app-empty">
                  <p className="app-empty-title">Nenhum produto ainda</p>
                  <p>Importe a vitrine do TikTok ou cadastre o primeiro produto à mão.</p>
                  <button
                    type="button"
                    className="app-btn app-btn--sm"
                    style={{ marginTop: 12 }}
                    onClick={() => onSelect("produtos")}
                  >
                    Trazer meus produtos
                  </button>
                </div>
              ) : (
                <div className="app-rank">
                  {linhasDoRanking.map((linha, i) => {
                    const doCatalogo = linha.produto;
                    const ativo = Boolean(doCatalogo?.active);
                    return (
                      <button
                        key={linha.id ?? linha.nome}
                        type="button"
                        className="app-rank-item"
                        data-active={ativo}
                        disabled={!doCatalogo}
                        title={
                          doCatalogo
                            ? `${linha.nome} — clique para a IA vender este`
                            : `${linha.nome} — não está mais no seu catálogo`
                        }
                        onClick={() => doCatalogo && ativarProduto(doCatalogo.id)}
                      >
                        <span className="app-rank-pos">{i + 1}</span>
                        {doCatalogo ? (
                          <ProdutoThumb produto={doCatalogo} tamanho={38} />
                        ) : (
                          <span className="app-rank-ghost">
                            <Package aria-hidden="true" />
                          </span>
                        )}
                        <span className="app-rank-body">
                          <span className="app-rank-name">
                            {linha.nome}
                            {ativo ? (
                              <span className="app-tag" data-tone="accent">
                                <Check aria-hidden="true" />
                                Ativo
                              </span>
                            ) : null}
                          </span>
                          <span className="app-rank-bar">
                            <span style={{ width: `${(linha.vendas / maiorVenda) * 100}%` }} />
                          </span>
                        </span>
                        <span className="app-rank-value">
                          {linha.vendas}
                          <small>
                            venda{linha.vendas === 1 ? "" : "s"}
                            {doCatalogo && formatarPreco(doCatalogo)
                              ? ` · ${formatarPreco(doCatalogo)}`
                              : ""}
                          </small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="app-col">
            {/* A preparação é andaime, não mobília: quando os seis passos estão
                de pé ela sai da tela e os cartões de baixo sobem para ocupar o
                lugar. Não é um "dispensar" — se algo cair depois (a extensão
                desconecta, a proteção é desligada), o cartão volta sozinho com
                o passo que voltou a ficar pendente. */}
            {pronto ? null : (
              <div className="app-card">
                <div className="app-card-head">
                  <div>
                    <h2 className="app-card-title">Preparação</h2>
                    <p className="app-card-desc">Clique para ir direto ao ajuste.</p>
                  </div>
                  <span className="app-tag" data-tone="accent">
                    {feitos}/{passos.length}
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

                <div className="app-checks" style={{ marginTop: 12 }}>
                  {passos.map((passo, i) => (
                    <button
                      key={passo.id}
                      type="button"
                      className="app-check"
                      data-done={passo.feito}
                      data-current={!passo.feito && i === atual}
                      onClick={() => onSelect(passo.destino)}
                      title={passo.descricao}
                    >
                      <span className="app-check-mark">
                        <Check aria-hidden="true" />
                      </span>
                      <span className="app-check-title">{passo.titulo}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="app-card">
              <div className="app-card-head">
                <div>
                  <h2 className="app-card-title">Chaves do dia a dia</h2>
                  <p className="app-card-desc">O que a IA faz enquanto você transmite.</p>
                </div>
                <span className="app-tag" data-tone={iaRespondendo ? "ok" : undefined}>
                  {
                    [
                      config.respostasIA,
                      config.responderNoChat,
                      config.protecaoGeral,
                      config.notificacoesVenda,
                    ].filter(Boolean).length
                  }{" "}
                  de 4 ligadas
                </span>
              </div>

              <div className="app-switches">
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
                  checked={config.notificacoesVenda && config.somVenda.enabled}
                  onChange={(enabled) =>
                    updateConfig((current) => ({
                      ...current,
                      notificacoesVenda: enabled,
                      somVenda: { ...current.somVenda, enabled },
                    }))
                  }
                />
              </div>
            </div>
            <div className="app-card">
              <div className="app-card-head">
                <div>
                  <h2 className="app-card-title">Sua conta</h2>
                  <p className="app-card-desc">Licença, pareamento e versão do painel.</p>
                </div>
              </div>

              <div className="app-metas">
                <div className="app-meta-row">
                  <span className="app-meta-label">Licença</span>
                  <span className="app-tag" data-tone="ok">
                    <Check aria-hidden="true" />
                    Ativa
                  </span>
                </div>
                <div className="app-meta-row">
                  <span className="app-meta-label">Extensão</span>
                  <span className="app-tag" data-tone={extensaoConectada ? "ok" : "warn"}>
                    {extensaoConectada ? "Pareada" : extensaoInstalada ? "Sem chave" : "Ausente"}
                  </span>
                </div>
                <div className="app-meta-row">
                  <span className="app-meta-label">Versão do painel</span>
                  <span className="app-meta-value">v{APP_VERSION}</span>
                </div>
              </div>

              <button
                type="button"
                className="app-btn app-btn--sm"
                style={{ marginTop: 14, width: "100%" }}
                onClick={() => onSelect("conta")}
              >
                Conta e sincronização
              </button>
            </div>
          </div>
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
    <div className="app-switch-row" data-on={checked}>
      <span className="app-switch-icon">{icon}</span>
      <span className="app-switch-body">
        <span className="app-switch-title">{titulo}</span>
        <span className="app-switch-desc">{descricao}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={titulo} />
    </div>
  );
}
