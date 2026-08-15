/**
 * Lista padrão de palavras bloqueadas do Pitch AI — versão do painel web.
 *
 * ⚠️ CÓPIA ESPELHADA: os mesmos 109 termos, as mesmas 4 categorias e a mesma
 * lógica de `match` também vivem em `extension/blocklist.js`. São dois arquivos
 * porque a extensão carrega o dela como script clássico (expõe
 * `window.PitchAIBlocklist`) e o painel precisa de um módulo ESM tipado —
 * importar do diretório da extensão quebraria o build do Vite.
 * Ao alterar um, altere o outro.
 *
 * O usuário soma termos próprios em `cfg.filtros.blacklist` e pode desligar a
 * lista padrão em `cfg.filtros.usarListaPadrao`.
 */

/** Ofensas e palavrões diretos (pt-BR). */
const PALAVROES = [
  "arrombado",
  "babaca",
  "bosta",
  "buceta",
  "burro",
  "caralho",
  "corno",
  "cuzao",
  "cuzão",
  "desgracado",
  "desgraçado",
  "escroto",
  "fdp",
  "filha da puta",
  "filho da puta",
  "foda-se",
  "foda se",
  "fodase",
  "idiota",
  "imbecil",
  "lixo",
  "merda",
  "otario",
  "otário",
  "pau no cu",
  "porra",
  "pqp",
  "puta",
  "puto",
  "retardado",
  "safada",
  "safado",
  "vagabunda",
  "vagabundo",
  "vai se foder",
  "vai tomar no cu",
  "viadinho",
  "viado",
];

/** Discurso de ódio / ataques a grupos — bloqueio duro. */
const ODIO = [
  "macaco",
  "macaca",
  "preto imundo",
  "volta pra senzala",
  "nazista",
  "hitler",
  "supremacia branca",
  "morte aos",
  "bicha",
  "sapatao",
  "sapatão",
  "traveco",
  "aleijado",
  "mongoloide",
  "mongolóide",
  "retardada",
];

/** Conteúdo sexual explícito — a IA nunca deve responder nem repetir. */
const SEXUAL = [
  "nudes",
  "pornografia",
  "pornô",
  "porno",
  "sexo",
  "transar",
  "pelada",
  "pelado",
  "gostosa",
  "gostoso",
  "tesao",
  "tesão",
  "punheta",
  "siririca",
];

/**
 * Termos que quebram as políticas do TikTok Shop LIVE.
 * Não são ofensas — são promessas e desvios de venda que derrubam a live.
 */
const RISCO_TIKTOK = [
  "cura",
  "cura garantida",
  "curar cancer",
  "curar câncer",
  "milagroso",
  "milagrosa",
  "remedio caseiro",
  "remédio caseiro",
  "emagrece sem dieta",
  "perde peso rapido",
  "perde peso rápido",
  "100% garantido",
  "resultado garantido",
  "aprovado pela anvisa",
  "substitui medicamento",
  "chama no whats",
  "chama no zap",
  "whatsapp",
  "zap zap",
  "meu pix",
  "pix direto",
  "fora da plataforma",
  "compra por fora",
  "link na bio",
  "manda dm",
  "chama no direct",
  "cassino",
  "aposta",
  "bet365",
  "jogo do tigrinho",
  "criptomoeda",
  "renda extra garantida",
  "dinheiro facil",
  "dinheiro fácil",
  "arma",
  "municao",
  "munição",
  "cigarro",
  "vape",
  "bebida alcoolica",
  "bebida alcoólica",
];

export const CATEGORIAS = {
  palavroes: PALAVROES,
  odio: ODIO,
  sexual: SEXUAL,
  risco_tiktok: RISCO_TIKTOK,
} as const;

export type BlocklistCategory = keyof typeof CATEGORIAS;

/** Rótulo e explicação de cada categoria — usados no painel. */
export const CATEGORIA_INFO: Record<BlocklistCategory, { label: string; hint: string }> = {
  palavroes: {
    label: "Palavrões e ofensas",
    hint: "Xingamentos diretos ao vendedor ou a outros espectadores.",
  },
  odio: {
    label: "Discurso de ódio",
    hint: "Ataques a raça, gênero, orientação sexual ou deficiência.",
  },
  sexual: {
    label: "Conteúdo sexual",
    hint: "Cantadas pesadas e termos explícitos que a IA nunca deve repetir.",
  },
  risco_tiktok: {
    label: "Risco de derrubar a live",
    hint: "Promessas milagrosas, venda por fora, apostas e outros termos que violam as regras do TikTok Shop.",
  },
};

export const TODAS: readonly string[] = [...PALAVROES, ...ODIO, ...SEXUAL, ...RISCO_TIKTOK];

/** Remove acento, caixa e pontuação para comparar "não" com "nao". */
export function normalize(text: string): string {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Casa por palavra inteira, não por substring.
 * Sem isso "cu" bloqueia "curso" e "pau" bloqueia "Paulo" — o filtro antigo
 * usava `includes()` e derrubava pergunta legítima de cliente.
 */
export function matchesTerm(normalizedText: string, term: string): boolean {
  const t = normalize(term);
  if (!t) return false;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`, "i").test(normalizedText);
}

export type BlocklistMatch =
  { blocked: false } | { blocked: true; term: string; category: BlocklistCategory | "usuario" };

export type BlocklistOptions = {
  /** Termos próprios do usuário — somam com a lista padrão. */
  extra?: string[];
  /** Quando `false`, só os termos do usuário são considerados. */
  usarListaPadrao?: boolean;
};

export function match(text: string, opts?: BlocklistOptions): BlocklistMatch {
  const normalized = normalize(text);
  if (!normalized) return { blocked: false };

  const extra = Array.isArray(opts?.extra) ? opts.extra : [];
  for (const term of extra) {
    if (matchesTerm(normalized, term)) {
      return { blocked: true, term: String(term), category: "usuario" };
    }
  }

  if (opts?.usarListaPadrao === false) return { blocked: false };

  for (const [category, termos] of Object.entries(CATEGORIAS)) {
    for (const term of termos) {
      if (matchesTerm(normalized, term)) {
        return { blocked: true, term, category: category as BlocklistCategory };
      }
    }
  }
  return { blocked: false };
}

/**
 * Transforma o texto livre do painel (uma linha ou vírgula por termo) na lista
 * salva na config. Descarta vazios e duplicatas, preservando a ordem digitada.
 */
export function parseTermosDoUsuario(raw: string): string[] {
  const vistos = new Set<string>();
  const termos: string[] = [];
  for (const parte of String(raw || "").split(/[\n,;]+/)) {
    const termo = parte.trim();
    if (!termo) continue;
    const chave = normalize(termo);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    termos.push(termo);
  }
  return termos;
}
