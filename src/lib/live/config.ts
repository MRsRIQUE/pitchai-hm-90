import { DEFAULT_VOICE, type VoiceId } from "./voices";

export type Product = {
  id: string;
  name: string;
  description: string;
  price: string;
  active: boolean;
};

export type AIContext = {
  brandName: string;
  niche: string;
  tone: string;
  targetAudience: string;
  rules: string;
  extraContext: string;
};

export type VoiceCtxKey = "default" | "greeting" | "offer" | "farewell";
export type VoiceSetting = { id: VoiceId; speed: number };

export type UiMode = "simples" | "avancado";

export type LiveConfig = {
  /** Modo de interface — "simples" mostra só o essencial. */
  uiMode: UiMode;
  /** Preset de nicho aplicado no contexto da IA. */
  preset?: string;
  /** Assistente de primeira vez já concluído. */
  onboardingDone: boolean;

  protecaoGeral: boolean;
  violacao: boolean;
  autoMod: boolean;
  autoFixar: {
    enabled: boolean;
    query: string;
    minSec: number;
    maxSec: number;
    /** Produtos selecionados para o rodízio; vazio = nenhum. */
    ids?: string[];
    /** Nomes acompanham os ids porque a extensão pode recriar os ids ao ler a vitrine. */
    names?: string[];
  };
  encerrarTempo: { enabled: boolean; minutes: number };
  respostasIA: boolean;
  /** Envia a resposta gerada também como texto no chat do TikTok. */
  responderNoChat: boolean;
  notificacoesVenda: boolean;
  /** Som de caixa registradora a cada venda detectada. */
  somVenda: { enabled: boolean; volume: number };

  voz: {
    id: VoiceId;
    speed: number;
    gain: number;
    outputDeviceId?: string;
    outputDeviceLabel?: string;
    /** Retorno: duplica a voz da IA no fone do usuário. */
    monitor?: { enabled: boolean; volume: number };
    pushToTalk: { enabled: boolean; key: string };
  };

  /** Voz por contexto — usada quando definida, senão cai para `voz`. */
  vozContextos: Record<VoiceCtxKey, VoiceSetting | null>;

  /** Filtros custom por seller — aplicados antes de bater na IA. */
  filtros: {
    blacklist: string[]; // palavras banidas — bloqueia mensagem
    whitelist: string[]; // se não-vazio, só responde se bater
    /**
     * Soma a lista padrão do Pitch AI (palavrões, ódio, sexual e termos que
     * derrubam a live) à blacklist do usuário. Ligado por padrão para a live
     * nunca ir ao ar desprotegida — ver `@/lib/live/blocklist`.
     */
    usarListaPadrao: boolean;
  };

  /** Seletores custom (fallback antes dos heurísticos). */
  selectors: {
    chatContainer: string[];
    productCard: string[];
  };

  /** Modo revisar-antes-de-falar — replies vão pra fila de aprovação. */
  revisarAntesDeEnviar: boolean;

  /** Token de sincronização com a extensão do navegador. */
  syncToken?: string;

  produtos: Product[];
  aiContext: AIContext;
  ultimoRoteiro: string;
  roteirosPorProduto: Record<string, string>;
};

export const DEFAULT_AI_CONTEXT: AIContext = {
  brandName: "",
  niche: "",
  tone: "empolgado e amigável",
  targetAudience: "",
  rules:
    "Nunca prometa resultados irreais. Não fale de política ou religião. Nunca invente preços ou promoções que não estejam cadastradas.",
  extraContext: "",
};

export const DEFAULT_CONFIG: LiveConfig = {
  uiMode: "simples",
  onboardingDone: false,
  protecaoGeral: false,
  violacao: true,
  autoMod: true,
  autoFixar: { enabled: false, query: "", minSec: 20, maxSec: 60, ids: [], names: [] },
  encerrarTempo: { enabled: false, minutes: 120 },
  respostasIA: true,
  responderNoChat: false,
  notificacoesVenda: true,
  somVenda: { enabled: true, volume: 0.8 },

  voz: {
    id: DEFAULT_VOICE,
    speed: 1.0,
    gain: 1.0,
    monitor: { enabled: false, volume: 0.6 },
    pushToTalk: { enabled: false, key: "Space" },
  },
  vozContextos: { default: null, greeting: null, offer: null, farewell: null },
  filtros: { blacklist: [], whitelist: [], usarListaPadrao: true },
  selectors: { chatContainer: [], productCard: [] },
  revisarAntesDeEnviar: false,
  produtos: [],
  aiContext: DEFAULT_AI_CONTEXT,
  ultimoRoteiro: "",
  roteirosPorProduto: {},
};

const STORAGE_KEY = "pitchai.config.v1";

export function loadConfig(): LiveConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      aiContext: { ...DEFAULT_AI_CONTEXT, ...(parsed.aiContext ?? {}) },
      vozContextos: { ...DEFAULT_CONFIG.vozContextos, ...(parsed.vozContextos ?? {}) },
      filtros: {
        ...DEFAULT_CONFIG.filtros,
        ...(parsed.filtros ?? {}),
        // Config salva antes da lista padrão existir não tem a chave — nesse
        // caso a proteção entra ligada, que é o padrão seguro.
        usarListaPadrao: parsed.filtros?.usarListaPadrao ?? DEFAULT_CONFIG.filtros.usarListaPadrao,
      },
      autoFixar: { ...DEFAULT_CONFIG.autoFixar, ...(parsed.autoFixar ?? {}) },
      selectors: { ...DEFAULT_CONFIG.selectors, ...(parsed.selectors ?? {}) },
      somVenda: { ...DEFAULT_CONFIG.somVenda, ...(parsed.somVenda ?? {}) },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: LiveConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function newProduct(): Product {
  return {
    id: crypto.randomUUID(),
    name: "Novo produto",
    description: "",
    price: "",
    active: true,
  };
}

/**
 * Converte itens vindos da vitrine do TikTok em produtos, descartando os que já
 * existem na lista. O nome (sem espaços e sem diferenciar maiúsculas) é o que
 * identifica a duplicata — mesma regra usada na importação pelo catálogo.
 */
export function vitrineItemsToNewProducts(
  produtosAtuais: Product[],
  items: { name?: string; price?: string; description?: string }[],
): Product[] {
  const existentes = new Set(produtosAtuais.map((p) => p.name.toLowerCase().trim()));
  const novos: Product[] = [];

  for (const item of items) {
    const name = String(item?.name ?? "").trim();
    const key = name.toLowerCase();
    if (!name || existentes.has(key)) continue;

    existentes.add(key);
    novos.push({
      id: crypto.randomUUID(),
      name,
      price: String(item.price ?? "").trim(),
      description: String(item.description ?? "").trim(),
      active: false,
    });
  }

  return novos;
}

/**
 * Promove a vitrine sincronizada para a lista que alimenta IA, roteiros e
 * automações. Também garante um produto ativo na primeira importação.
 */
export function mergeVitrineProducts(
  produtosAtuais: Product[],
  items: { name?: string; price?: string; description?: string }[],
): { produtos: Product[]; addedCount: number } {
  const novos = vitrineItemsToNewProducts(produtosAtuais, items);
  const hasActive = produtosAtuais.some((produto) => produto.active);

  if (hasActive) {
    return {
      produtos: novos.length > 0 ? [...produtosAtuais, ...novos] : produtosAtuais,
      addedCount: novos.length,
    };
  }

  if (produtosAtuais.length > 0) {
    return {
      produtos: [{ ...produtosAtuais[0], active: true }, ...produtosAtuais.slice(1), ...novos],
      addedCount: novos.length,
    };
  }

  if (novos.length > 0) novos[0] = { ...novos[0], active: true };
  return { produtos: novos, addedCount: novos.length };
}

/** Classifica uma frase por contexto para escolher a voz certa. */
export function classifyVoiceContext(text: string): VoiceCtxKey {
  const t = (text || "").toLowerCase();
  if (/\b(oi|olá|ola|opa|salve|ea[ií]|bem[- ]vind[oa]s?|boas vindas|saudações)\b/.test(t))
    return "greeting";
  if (
    /(obrigad|até (mais|logo|amanhã)|tchau|beij[oa]s|abraç|nos vemos|até (a )?próxima|volto (já|logo))/.test(
      t,
    )
  )
    return "farewell";
  if (
    /(oferta|promo|desconto|aproveit|últim[oa]s?|leva|cupom|frete|r\$\s?\d|preço|valor|melhor preço|imperd[íi]vel)/.test(
      t,
    )
  )
    return "offer";
  return "default";
}

/** Monta o system prompt que a IA usa. */
export function buildSystemPrompt(cfg: LiveConfig): string {
  const { aiContext, produtos } = cfg;
  const active = produtos.find((p) => p.active);
  const catalog = produtos
    .map(
      (p, i) =>
        `${i + 1}. ${p.name}${p.price ? ` — ${p.price}` : ""}${p.active ? " [ATIVO]" : ""}\n   ${p.description || "(sem descrição)"}`,
    )
    .join("\n");

  return [
    `Você é a IA vendedora da live do Pitch AI.`,
    aiContext.brandName && `Marca: ${aiContext.brandName}.`,
    aiContext.niche && `Nicho: ${aiContext.niche}.`,
    aiContext.targetAudience && `Público-alvo: ${aiContext.targetAudience}.`,
    `Tom de voz: ${aiContext.tone || "amigável"}.`,
    aiContext.extraContext && `Contexto extra: ${aiContext.extraContext}`,
    `Regras obrigatórias: ${aiContext.rules}`,
    catalog ? `Catálogo:\n${catalog}` : "Catálogo vazio.",
    active
      ? `Produto ATIVO no momento: "${active.name}". Priorize responder sobre ele quando fizer sentido.`
      : "Nenhum produto marcado como ativo.",
    `Responda de forma curta (1-2 frases), natural, como se estivesse falando ao vivo.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
