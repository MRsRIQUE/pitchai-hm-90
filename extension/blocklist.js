/**
 * Lista padrão de palavras bloqueadas do Pitch AI.
 *
 * Carregada tanto pelo content script (sidebar da live) quanto pelo painel,
 * para que a IA já nasça protegida contra xingamentos, discurso de ódio e
 * termos que violam as diretrizes do TikTok Shop — sem o usuário precisar
 * digitar nada.
 *
 * O usuário continua podendo adicionar termos próprios em `cfg.filtros.blacklist`
 * e desligar a lista padrão em `cfg.filtros.usarListaPadrao`.
 */
(function () {
  "use strict";

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

  const CATEGORIAS = {
    palavroes: PALAVROES,
    odio: ODIO,
    sexual: SEXUAL,
    risco_tiktok: RISCO_TIKTOK,
  };

  const TODAS = [...PALAVROES, ...ODIO, ...SEXUAL, ...RISCO_TIKTOK];

  /** Remove acento, caixa e pontuação para comparar "não" com "nao". */
  function normalize(text) {
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
  function matchesTerm(normalizedText, term) {
    const t = normalize(term);
    if (!t) return false;
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\s)${escaped}(\\s|$)`, "i").test(normalizedText);
  }

  /**
   * @param {string} text texto do espectador (ou resposta da IA)
   * @param {{extra?: string[], usarListaPadrao?: boolean}} [opts]
   * @returns {{blocked: boolean, term?: string, category?: string}}
   */
  function match(text, opts) {
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
        if (matchesTerm(normalized, term)) return { blocked: true, term, category };
      }
    }
    return { blocked: false };
  }

  const api = { CATEGORIAS, TODAS, normalize, matchesTerm, match };

  if (typeof window !== "undefined") window.PitchAIBlocklist = api;
  if (typeof globalThis !== "undefined") globalThis.PitchAIBlocklist = api;
})();
