import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, ExternalLink, Flame, Loader2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/clipboard";
import { fetchPublicRanking } from "@/lib/live/admin";

/** Dinheiro sempre pelo locale — `toFixed` come o separador de milhar. */
function brl(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Vitrine dos produtos quentes dentro do painel do assinante.
 *
 * Autocontido de propósito: lê a curadoria pela leitura pública do ranking (a
 * mesma da página `/quentes`) e não depende de nenhum estado do dashboard. O
 * que o assinante faz aqui é copiar o link de afiliado da equipe.
 */
export function QuentesDoTime() {
  const {
    data: produtos = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["quentes", "publico"],
    queryFn: fetchPublicRanking,
    staleTime: 5 * 60 * 1000,
  });
  const [copiado, setCopiado] = useState<string | null>(null);

  async function copiarLink(id: string, link: string) {
    const ok = await copyToClipboard(link);
    if (!ok) {
      toast.error("O navegador não deixou copiar. Copie o link pelo botão Abrir.");
      return;
    }
    setCopiado(id);
    toast.success("Link de afiliado copiado.");
    window.setTimeout(() => setCopiado((atual) => (atual === id ? null : atual)), 2000);
  }

  return (
    <Card id="sec-quentes" className="scroll-mt-24 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Flame className="h-5 w-5 text-orange-500" aria-hidden="true" />
            Produtos quentes da equipe
          </h2>
          <p className="text-muted-foreground text-sm">
            Curadoria do Pitch AI. Copie o link e use na sua live.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href="/quentes" target="_blank" rel="noreferrer">
            Ver a página completa
          </a>
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Carregando os quentes…
        </div>
      ) : error ? (
        <p className="text-muted-foreground py-6 text-sm">
          Não deu para carregar os produtos agora. Tente de novo em instantes.
        </p>
      ) : produtos.length === 0 ? (
        <p className="text-muted-foreground py-6 text-sm">
          A equipe ainda não publicou produtos quentes. Assim que publicar, eles aparecem aqui.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {produtos.map((p) => (
            <li key={p.id} className="flex gap-3 rounded-xl border p-3">
              {p.imagem_url ? (
                <img
                  src={p.imagem_url}
                  alt={p.nome}
                  loading="lazy"
                  className="h-16 w-16 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="bg-muted text-muted-foreground flex h-16 w-16 shrink-0 items-center justify-center rounded-lg">
                  <ShoppingBag className="h-5 w-5" aria-hidden="true" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-medium" title={p.nome}>
                    {p.nome}
                  </p>
                  {p.destaque && (
                    <Badge variant="secondary" className="shrink-0">
                      Destaque
                    </Badge>
                  )}
                </div>

                <p className="text-muted-foreground text-xs">
                  {p.preco > 0 ? brl(Number(p.preco)) : "Preço não informado"}
                  {p.comissao_pct > 0 ? ` · ${Number(p.comissao_pct)}% de comissão` : ""}
                </p>

                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!p.link}
                    onClick={() => p.link && copiarLink(p.id, p.link)}
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    {copiado === p.id ? "Copiado!" : "Copiar link"}
                  </Button>
                  {p.link && (
                    <Button asChild size="sm" variant="ghost">
                      <a href={p.link} target="_blank" rel="noreferrer nofollow">
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        Abrir
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
