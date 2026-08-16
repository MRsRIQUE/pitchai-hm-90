/**
 * WordFilterSection — filtro de palavras do painel web.
 *
 * Antes disso só a extensão tinha tela de filtro: quem configurava tudo pelo
 * painel subia a live sem nenhuma palavra bloqueada. Aqui a lista padrão do
 * Pitch AI já vem ligada e o usuário só precisa somar os termos dele.
 */
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ShieldBan, CircleAlert } from "lucide-react";
import { useLiveStore } from "@/stores/useLiveStore";
import { useShallow } from "zustand/react/shallow";
import { CATEGORIAS, CATEGORIA_INFO, TODAS, parseTermosDoUsuario } from "@/lib/live/blocklist";
import { pushLiveConfigFields } from "@/lib/live/sync";
import type { BlocklistCategory } from "@/lib/live/blocklist";

const CATEGORIA_KEYS = Object.keys(CATEGORIAS) as BlocklistCategory[];

export function WordFilterSection() {
  const { filtros, updateConfig } = useLiveStore(
    useShallow((state) => ({
      filtros: state.config.filtros,
      updateConfig: state.actions.updateConfig,
    })),
  );

  const usarListaPadrao = filtros.usarListaPadrao;
  const proprios = filtros.blacklist;

  // O textarea tem rascunho próprio para o usuário poder digitar linha vazia,
  // espaço e vírgula sem a lista salva reescrever o que ele está escrevendo.
  const [draft, setDraft] = useState(() => proprios.join("\n"));

  useEffect(() => {
    // Só realinha quando a lista mudou por fora (importar backup, sincronizar).
    // Enquanto digita, o parse do rascunho bate com a lista e nada acontece.
    const salvo = proprios.join("\n");
    if (parseTermosDoUsuario(draft).join("\n") !== salvo) setDraft(salvo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proprios]);

  const setFiltros = (next: { blacklist?: string[]; usarListaPadrao?: boolean }) => {
    updateConfig((c) => ({ ...c, filtros: { ...c.filtros, ...next } }));
  };

  const publicar = (next: { blacklist?: string[]; usarListaPadrao?: boolean }) => {
    const atual = useLiveStore.getState().config.filtros;
    void pushLiveConfigFields({ filtros: { ...atual, ...next } }).catch((err) => {
      console.error("[WordFilterSection] falha ao publicar filtros:", err);
    });
  };

  const handleTermosBlur = () => {
    const termos = parseTermosDoUsuario(draft);
    setFiltros({ blacklist: termos });
    publicar({ blacklist: termos });
  };

  const totalPadrao = usarListaPadrao ? TODAS.length : 0;
  const totalBloqueado = totalPadrao + proprios.length;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
            <ShieldBan className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </div>
          <div>
            <h3 className="font-display text-base font-bold">Filtro de palavras</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Mensagens com esses termos são bloqueadas antes de chegar na IA — ela não responde nem
              repete nada disso na sua live.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {/* Lista padrão */}
        <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="font-semibold">Usar a lista de proteção do Pitch AI</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                {TODAS.length} termos em português já revisados pela nossa equipe. Recomendado
                deixar ligado.
              </p>
            </div>
            <Switch
              checked={usarListaPadrao}
              onCheckedChange={(v) => {
                setFiltros({ usarListaPadrao: v });
                publicar({ usarListaPadrao: v });
              }}
            />
          </div>

          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {CATEGORIA_KEYS.map((key) => (
              <li
                key={key}
                className={`rounded-md border border-border/50 bg-background/40 p-2.5 transition ${
                  usarListaPadrao ? "" : "opacity-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{CATEGORIA_INFO[key].label}</span>
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold text-primary">
                    {CATEGORIAS[key].length}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  {CATEGORIA_INFO[key].hint}
                </p>
              </li>
            ))}
          </ul>

          {!usarListaPadrao && (
            <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-500">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Com a lista padrão desligada, só os seus termos bloqueiam. Xingamento e discurso de
                ódio passam direto para a IA.
              </span>
            </p>
          )}
        </div>

        {/* Termos do usuário */}
        <div>
          <label
            htmlFor="filtro-termos-proprios"
            className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground"
          >
            Seus termos
          </label>
          <Textarea
            id="filtro-termos-proprios"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleTermosBlur}
            rows={5}
            placeholder={
              "Um termo por linha. Ex:\nnome do concorrente\napelido chato\npromessa que não posso cumprir"
            }
            className="text-sm"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Um por linha (vírgula também vale). Estes <b>somam</b> com a lista padrão — não
            substituem. Salva ao sair do campo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-dashed border-border/70 bg-muted/20 p-3 text-xs">
          <span className="font-semibold text-foreground">
            {totalBloqueado} termo{totalBloqueado === 1 ? "" : "s"} bloqueado
            {totalBloqueado === 1 ? "" : "s"} no total
          </span>
          <span className="text-muted-foreground">
            {totalPadrao} da lista padrão · {proprios.length} seu{proprios.length === 1 ? "" : "s"}
          </span>
          <span className="text-muted-foreground">
            A comparação é por palavra inteira — "cura" não bloqueia "curso".
          </span>
        </div>
      </div>
    </Card>
  );
}
