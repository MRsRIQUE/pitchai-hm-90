import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { aiHeaders } from "@/lib/live/ai-headers";
import { toast } from "sonner";
import {
  FlaskConical,
  ShoppingBag,
  MessageSquare,
  ShoppingCart,
  AlertTriangle,
  Volume2,
  Plus,
  Square,
  Loader2,
  Sparkles,
} from "lucide-react";
import { playSaleSound, unlockSaleSound } from "@/lib/live/sale-sound";
import { newProduct, type LiveConfig, type Product } from "@/lib/live/config";
import { ensureMyLiveConfig } from "@/lib/live/sync";

type FeedItem = {
  id: string;
  kind: "chat" | "ia" | "venda" | "violacao" | "sistema";
  text: string;
  author?: string;
  at: number;
};

const DEMO_PRODUCTS: Array<Pick<Product, "name" | "price" | "description">> = [
  {
    name: "Kit Skincare Vitamina C",
    price: "R$ 89,90",
    description: "Sérum + hidratante + protetor. Uso diário, pele oleosa e mista.",
  },
  {
    name: "Fone Bluetooth Pro Bass",
    price: "R$ 129,00",
    description: "Cancelamento de ruído, 30h de bateria, à prova de suor.",
  },
  {
    name: "Tênis Running Leve",
    price: "R$ 199,90",
    description: "Amortecimento em gel, numeração 34 ao 44, 3 cores.",
  },
  {
    name: "Garrafa Térmica 1L",
    price: "R$ 59,90",
    description: "Gela 24h, esquenta 12h. Inox, tampa antivazamento.",
  },
];

const DEMO_MESSAGES: Array<{
  author: string;
  text: string;
  tipo: "pergunta" | "offtopic" | "ofensa";
}> = [
  { author: "ana.souza", text: "quanto custa o kit de skincare?", tipo: "pergunta" },
  { author: "carlos_m", text: "o fone é bom pra academia?", tipo: "pergunta" },
  { author: "juliana", text: "tem o tênis no 38?", tipo: "pergunta" },
  { author: "mari", text: "alguém sabe que horas passa o jogo hoje", tipo: "offtopic" },
  { author: "pedro.lima", text: "qual o prazo de entrega pro nordeste?", tipo: "pergunta" },
  { author: "tone_br", text: "que porcaria, vocês são uns idiotas", tipo: "ofensa" },
  { author: "bia.costa", text: "tem cupom de desconto?", tipo: "pergunta" },
  { author: "lucas", text: "o frete é grátis?", tipo: "pergunta" },
];

const COMPRADORES = ["ana.souza", "carlos_m", "juliana", "pedro.lima", "bia.costa", "lucas"];

const uid = () => Math.random().toString(36).slice(2, 10);

function respostaSimulada(msg: string, produto?: Product) {
  const nome = produto?.name ?? "esse produto";
  const preco = produto?.price ?? "um preço especial";
  const t = msg.toLowerCase();
  if (t.includes("custa") || t.includes("preço") || t.includes("preco"))
    return `${nome} está saindo por ${preco} aqui na live, só hoje.`;
  if (t.includes("frete") || t.includes("entrega"))
    return `A entrega sai em até 7 dias úteis, e acima de cem reais o frete fica por nossa conta.`;
  if (t.includes("cupom") || t.includes("desconto"))
    return `Tem sim! O cupom da live já aparece no carrinho quando você clica na sacolinha.`;
  if (t.includes("tamanho") || t.includes("38") || t.includes("numer"))
    return `Temos do 34 ao 44, e o 38 ainda está disponível — mas o estoque é limitado.`;
  return `Ótima pergunta! ${nome} resolve exatamente isso, e hoje está por ${preco}.`;
}

export function DemoModeCard({
  cfg,
  setCfg,
}: {
  cfg: LiveConfig;
  setCfg: (updater: (prev: LiveConfig) => LiveConfig) => void;
}) {
  const [on, setOn] = useState(false);
  const [comChat, setComChat] = useState(true);
  const [comVendas, setComVendas] = useState(true);
  const [comViolacao, setComViolacao] = useState(false);
  const [violacaoAtiva, setViolacaoAtiva] = useState(false);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [vendas, setVendas] = useState(0);
  const [falando, setFalando] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const msgIdx = useRef(0);
  const chatTimer = useRef<number | null>(null);
  const saleTimer = useRef<number | null>(null);
  const violTimer = useRef<number | null>(null);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  const push = (item: Omit<FeedItem, "id" | "at">) =>
    setFeed((prev) => [{ ...item, id: uid(), at: Date.now() }, ...prev].slice(0, 40));

  const produtoAtivo = () =>
    cfgRef.current.produtos.find((p) => p.active) ?? cfgRef.current.produtos[0];

  const falar = async (texto: string) => {
    const c = cfgRef.current;
    setFalando(true);
    try {
      const res = await fetch("/api/tts/preview", {
        method: "POST",
        headers: await aiHeaders(),
        body: JSON.stringify({ text: texto, voice: c.voz.id, speed: c.voz.speed }),
      });
      if (!res.ok) throw new Error(await res.text());
      const url = URL.createObjectURL(await res.blob());
      const el = audioRef.current;
      if (!el) return;
      el.pause();
      el.src = url;
      el.volume = Math.min(1, Math.max(0, c.voz.gain));
      const withSink = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
      if (c.voz.outputDeviceId && typeof withSink.setSinkId === "function") {
        try {
          await withSink.setSinkId(c.voz.outputDeviceId);
        } catch {
          /* dispositivo indisponível — toca no padrão */
        }
      }
      await el.play();
    } catch (e) {
      toast.error("Falha ao gerar a voz da demo", {
        description: e instanceof Error ? e.message : "Erro desconhecido",
      });
    } finally {
      setFalando(false);
    }
  };

  const simularVitrine = () => {
    let adicionados = 0;
    setCfg((prev) => {
      const existentes = new Set(prev.produtos.map((p) => p.name.toLowerCase().trim()));
      const novos = DEMO_PRODUCTS.filter((p) => !existentes.has(p.name.toLowerCase())).map((p) => ({
        ...newProduct(),
        name: p.name,
        price: p.price,
        description: p.description,
        active: false,
      }));
      adicionados = novos.length;
      const produtos = [...prev.produtos, ...novos];
      if (produtos.length && !produtos.some((p) => p.active)) produtos[0].active = true;
      return { ...prev, produtos };
    });
    push({
      kind: "sistema",
      text: adicionados
        ? `Vitrine simulada: ${adicionados} produto(s) importado(s).`
        : "Vitrine simulada já estava carregada.",
    });
  };

  const adicionarProdutoFake = () => {
    const n = Math.floor(Math.random() * 900 + 100);
    setCfg((prev) => ({
      ...prev,
      produtos: [
        ...prev.produtos,
        {
          ...newProduct(),
          name: `Produto Demo #${n}`,
          price: `R$ ${(Math.random() * 200 + 30).toFixed(2).replace(".", ",")}`,
          description: "Produto de teste criado pelo Modo Demo.",
        },
      ],
    }));
    push({ kind: "sistema", text: `Produto fake adicionado: Produto Demo #${n}.` });
  };

  const simularMensagem = async () => {
    const m = DEMO_MESSAGES[msgIdx.current % DEMO_MESSAGES.length];
    msgIdx.current += 1;
    push({ kind: "chat", author: m.author, text: m.text });

    if (m.tipo !== "pergunta") {
      push({
        kind: "sistema",
        text:
          m.tipo === "ofensa"
            ? `Auto-moderação: ofensa de @${m.author} ignorada.`
            : `Fora de contexto: mensagem de @${m.author} ignorada.`,
      });
      return;
    }
    if (violacaoAtiva && cfgRef.current.protecaoGeral) {
      push({ kind: "sistema", text: "Proteção geral ativa — IA em silêncio." });
      return;
    }
    const resposta = `${m.author}, ${respostaSimulada(m.text, produtoAtivo())}`;
    push({ kind: "ia", text: resposta });
    await falar(resposta);
  };

  const simularVenda = async () => {
    const comprador = COMPRADORES[Math.floor(Math.random() * COMPRADORES.length)];
    const prod = produtoAtivo();
    setVendas((v) => v + 1);
    push({
      kind: "venda",
      text: `${comprador} comprou ${prod?.name ?? "um produto"} · ${prod?.price ?? ""}`,
    });
    if (cfgRef.current.somVenda.enabled) {
      await playSaleSound(cfgRef.current.somVenda.volume).catch(() => undefined);
    }
    if (cfgRef.current.notificacoesVenda) {
      await falar(`Valeu ${comprador}, obrigado pela compra!`);
    }
  };

  const simularViolacao = () => {
    setViolacaoAtiva(true);
    push({
      kind: "violacao",
      text: "Aviso de integridade: possível violação de conteúdo (simulado).",
    });
    if (cfgRef.current.protecaoGeral)
      push({ kind: "sistema", text: "Proteção geral: IA pausada." });
    if (violTimer.current) window.clearTimeout(violTimer.current);
    violTimer.current = window.setTimeout(() => {
      setViolacaoAtiva(false);
      push({ kind: "sistema", text: "Violação simulada encerrada." });
    }, 20000);
  };

  const testarVoz = async () => {
    const p = produtoAtivo();
    await falar(
      `Teste de voz do Pitch AI. Estou apresentando ${p?.name ?? "o produto em destaque"} por ${p?.price ?? "um super preço"}. Aproveita que o estoque é limitado!`,
    );
  };

  /** Manda uma pergunta real pra IA e toca a resposta — testa o cérebro + a voz juntos. */
  const ouvirIA = async () => {
    const c = cfgRef.current;
    const m = DEMO_MESSAGES.filter((x) => x.tipo === "pergunta")[
      Math.floor(Math.random() * DEMO_MESSAGES.filter((x) => x.tipo === "pergunta").length)
    ];
    push({ kind: "chat", author: m.author, text: m.text });
    try {
      const cred = await ensureMyLiveConfig();
      if (!cred?.sync_token) {
        toast.error("Faça login para ouvir a IA real", {
          description: "A resposta com IA usa o seu token de sincronização.",
        });
        return;
      }
      const catalogo = c.produtos
        .slice(0, 12)
        .map(
          (p) =>
            `- ${p.name}${p.price ? ` (${p.price})` : ""}${p.description ? `: ${p.description}` : ""}`,
        )
        .join("\n");
      const res = await fetch("/api/public/chat/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cred.sync_token}` },
        body: JSON.stringify({
          message: m.text,
          author: m.author,
          systemPrompt: `Você é a IA vendedora de uma live no TikTok Shop.\nCatálogo:\n${catalogo || "(vazio)"}`,
          blacklist: c.filtros?.blacklist ?? [],
          whitelist: c.filtros?.whitelist ?? [],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { reply?: string; ignore?: boolean; reason?: string };
      if (!data.reply || data.ignore) {
        push({
          kind: "sistema",
          text: `IA decidiu ignorar (${data.reason ?? "fora de contexto"}).`,
        });
        return;
      }
      push({ kind: "ia", text: data.reply });
      await falar(data.reply);
    } catch (e) {
      toast.error("Falha ao consultar a IA", {
        description: e instanceof Error ? e.message : "Erro desconhecido",
      });
    }
  };

  const limparTimers = () => {
    if (chatTimer.current) window.clearInterval(chatTimer.current);
    if (saleTimer.current) window.clearInterval(saleTimer.current);
    if (violTimer.current) window.clearTimeout(violTimer.current);
    chatTimer.current = null;
    saleTimer.current = null;
    violTimer.current = null;
  };

  const toggle = async (next: boolean) => {
    setOn(next);
    if (!next) {
      limparTimers();
      setViolacaoAtiva(false);
      audioRef.current?.pause();
      push({ kind: "sistema", text: "Modo Demo desligado." });
      return;
    }
    unlockSaleSound();
    setFeed([]);
    setVendas(0);
    push({ kind: "sistema", text: "Modo Demo ligado — nada aqui vem de uma live real." });
    simularVitrine();
    if (comChat) {
      window.setTimeout(() => void simularMensagem(), 1500);
      chatTimer.current = window.setInterval(() => void simularMensagem(), 14000);
    }
    if (comVendas) saleTimer.current = window.setInterval(() => void simularVenda(), 32000);
    if (comViolacao) window.setTimeout(() => simularViolacao(), 40000);
  };

  useEffect(() => limparTimers, []);

  const acoes = [
    { label: "Vitrine", icon: ShoppingBag, fn: simularVitrine },
    { label: "Produto", icon: Plus, fn: adicionarProdutoFake },
    { label: "Mensagem", icon: MessageSquare, fn: () => void simularMensagem() },
    { label: "Venda", icon: ShoppingCart, fn: () => void simularVenda() },
    { label: "Violação", icon: AlertTriangle, fn: simularViolacao },
    { label: "Testar voz", icon: Volume2, fn: () => void testarVoz() },
    { label: "Ouvir IA", icon: Sparkles, fn: () => void ouvirIA() },
  ];

  return (
    <Card id="sec-demo" className="scroll-mt-24 border-secondary/40 p-5">
      <audio ref={audioRef} hidden />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-secondary" />
          <div>
            <h2 className="text-base font-semibold">Modo Demo</h2>
            <p className="text-sm text-muted-foreground">
              Simula vitrine, chat, vendas, violação e a voz da IA — sem precisar de live real.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {on && <Badge variant="secondary">simulação ativa</Badge>}
          <Switch
            checked={on}
            onCheckedChange={(v) => void toggle(v)}
            aria-label="Ligar modo demo"
          />
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
          Chat automático
          <Switch checked={comChat} onCheckedChange={setComChat} />
        </label>
        <label className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
          Vendas automáticas
          <Switch checked={comVendas} onCheckedChange={setComVendas} />
        </label>
        <label className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
          Violação automática
          <Switch checked={comViolacao} onCheckedChange={setComViolacao} />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {acoes.map(({ label, icon: Icon, fn }) => (
          <Button key={label} size="sm" variant="outline" onClick={fn}>
            <Icon className="mr-1.5 h-4 w-4" />
            {label}
          </Button>
        ))}
        {on && (
          <Button size="sm" variant="ghost" onClick={() => void toggle(false)}>
            <Square className="mr-1.5 h-4 w-4" />
            Encerrar demo
          </Button>
        )}
        {falando && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> falando…
          </span>
        )}
      </div>

      {violacaoAtiva && (
        <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Violação simulada em andamento — a IA responde em modo seguro.
        </div>
      )}

      <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
        <span>
          Vendas simuladas: <strong className="text-foreground">{vendas}</strong>
        </span>
        <span>
          Produtos: <strong className="text-foreground">{cfg.produtos.length}</strong>
        </span>
      </div>

      <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto rounded-lg border border-border/60 bg-muted/30 p-3">
        {feed.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ligue o Modo Demo ou use os botões acima para ver a simulação acontecendo aqui.
          </p>
        ) : (
          feed.map((f) => (
            <div key={f.id} className="text-sm">
              <span className="mr-2 font-mono text-xs text-muted-foreground">
                {new Date(f.at).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
              {f.kind === "chat" && (
                <span className="text-foreground">
                  💬 @{f.author}: {f.text}
                </span>
              )}
              {f.kind === "ia" && <span className="text-primary">🎙 IA: {f.text}</span>}
              {f.kind === "venda" && <span className="text-secondary">🛒 {f.text}</span>}
              {f.kind === "violacao" && <span className="text-destructive">⚠ {f.text}</span>}
              {f.kind === "sistema" && <span className="text-muted-foreground">• {f.text}</span>}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
