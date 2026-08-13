import { createFileRoute } from "@tanstack/react-router";
import { guardApiRequest } from "@/lib/live/api-auth.server";
import { corsHeaders } from "@/lib/live/cors.server";
import { isNonEmptyText, validateContentForPublish } from "@/lib/live/validation.server";

type ReplyBody = {
  message?: string;
  author?: string;
  systemPrompt?: string;
  history?: { role: "user" | "assistant"; content: string }[];
  blacklist?: string[];
  whitelist?: string[];
};

// Marcador estruturado — o modelo devolve isto sozinho quando decide ignorar.
// Antes era a palavra "IGNORAR" solta, que vazava pro cliente quando o modelo
// escrevia algo antes dela.
const IGNORE_TAG = "[[IGNORAR]]";

/**
 * Casamento com limite de palavra. `includes()` puro fazia "cor" bloquear
 * "correios"/"socorro" e derrubar pergunta legítima de comprador.
 */
function escapeRx(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesAny(text: string, words: string[]) {
  if (!words?.length) return false;
  const t = ` ${text.toLowerCase()} `;
  return words.some((w) => {
    const s = String(w || "")
      .toLowerCase()
      .trim();
    if (!s) return false;
    // Termo com espaço/frase → substring; palavra única → limite de palavra.
    if (/\s/.test(s)) return t.includes(s);
    const rx = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRx(s)}([^\\p{L}\\p{N}]|$)`, "iu");
    return rx.test(t);
  });
}

import { GoogleGenAI, ThinkingLevel } from "@google/genai";

async function callModel(
  key: string,
  system: string,
  messages: { role: string; content: string }[],
  options?: { model?: string; highThinking?: boolean },
) {
  const modelName = options?.model || "gemini-3.5-flash";

  if (process.env.GEMINI_API_KEY) {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });

    const conversationPrompt = messages
      .map((m) => `${m.role === "assistant" ? "Assistente" : "Usuário"}: ${m.content}`)
      .join("\n");

    const config: Record<string, unknown> = {
      systemInstruction: system,
    };

    if (options?.highThinking || modelName === "gemini-3.1-pro-preview") {
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
    }

    const response = await ai.models.generateContent({
      model: modelName,
      contents: conversationPrompt,
      config,
    });

    const text = response.text || "";
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: text } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "system", content: system }, ...messages],
      max_tokens: 160,
    }),
  });
}

export const Route = createFileRoute("/api/public/chat/reply")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request) }),
      POST: async ({ request }) => {
        const CORS = corsHeaders(request);
        const json = (status: number, body: unknown) =>
          new Response(JSON.stringify(body), {
            status,
            headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
          });

        const guard = await guardApiRequest(request, "chat_reply");
        if (!guard.ok) {
          return json(guard.status ?? 500, {
            error: guard.status === 429 ? "quota_exceeded" : "invalid_token",
            message: guard.message,
            remaining: 0,
            locked: true,
          });
        }

        const key = process.env.LOVABLE_API_KEY || process.env.GEMINI_API_KEY;
        if (!key)
          return json(500, {
            error: "missing_api_key",
            message: "Missing LOVABLE_API_KEY or GEMINI_API_KEY",
          });

        let body: ReplyBody;
        try {
          body = (await request.json()) as ReplyBody;
        } catch {
          return new Response("Invalid JSON", { status: 400, headers: CORS });
        }

        const message = (body.message ?? "").toString().slice(0, 1000).trim();
        if (!isNonEmptyText(message)) {
          return new Response("Empty or whitespace message", { status: 400, headers: CORS });
        }

        const blacklist = Array.isArray(body.blacklist)
          ? body.blacklist.slice(0, 100).map(String)
          : [];
        const whitelist = Array.isArray(body.whitelist)
          ? body.whitelist.slice(0, 100).map(String)
          : [];

        // Blacklist continua bloqueando de verdade (é a lista de ofensa/spam).
        if (matchesAny(message, blacklist)) {
          return json(200, { reply: "", ignore: true, reason: "blacklist" });
        }

        // Whitelist virou PRIORIDADE, não exclusividade. Antes, qualquer
        // whitelist mal preenchida descartava toda pergunta boa.
        const prioritized = whitelist.length > 0 && matchesAny(message, whitelist);

        const baseSystem =
          (body.systemPrompt ?? "").toString().slice(0, 4000) ||
          "Você é a IA vendedora de uma live no TikTok Shop.";

        const author = String(body.author ?? "")
          .slice(0, 40)
          .trim();

        const filterRules = [
          "",
          "REGRAS DE RESPOSTA (obrigatórias):",
          "- Responda SEMPRE que a mensagem tiver qualquer relação com a compra: produto, preço, desconto, cupom, frete, prazo de entrega, pagamento, parcelamento, estoque, tamanho, cor, material, garantia, troca, durabilidade, como usar, comparação entre produtos ou pedido de link.",
          "- Também responda saudação, elogio, dúvida vaga ('serve pra mim?', 'vale a pena?') e pedido de repetição de informação.",
          "- Na dúvida, RESPONDA. Só ignore palavrão, xingamento, spam, corrente, divulgação de outro vendedor ou assunto totalmente fora da live.",
          "- Se não souber o dado exato (frete, cupom, prazo), responda mesmo assim de forma honesta e curta, orientando a conferir no carrinho/checkout — nunca invente valor.",
          `- Para ignorar, responda EXATAMENTE e somente: ${IGNORE_TAG}`,
          "- Responda em 1 frase curta e natural, como se estivesse falando ao vivo.",
          author
            ? `- Comece a resposta cumprimentando pelo primeiro nome: "${author.split(/\s+/)[0]}, ...".`
            : "- Comece a resposta chamando o espectador de forma amigável (ex: 'oi, ...').",
          "- Nunca use emojis nem asteriscos. Nunca invente preço ou promoção.",
          prioritized
            ? "- ATENÇÃO: esta mensagem foi marcada como prioritária pelo vendedor. Responda obrigatoriamente."
            : "",
        ]
          .filter(Boolean)
          .join("\n");

        const system = `${baseSystem}\n${filterRules}`;

        // Histórico maior: 12 turnos, 800 chars cada (antes 6 / 500),
        // pra não perder contexto de negociação longa.
        const history = Array.isArray(body.history)
          ? body.history.slice(-12).map((h) => ({
              role: h.role === "assistant" ? "assistant" : "user",
              content: String(h.content ?? "").slice(0, 800),
            }))
          : [];

        const userLine = author ? `${author}: ${message}` : message;
        const messages = [...history, { role: "user", content: userLine }];

        let upstream = await callModel(key, system, messages);
        if (!upstream.ok) {
          const err = await upstream.text().catch(() => "");
          return new Response(err || "AI failed", {
            status: upstream.status,
            headers: CORS,
          });
        }

        let data = (await upstream.json().catch(() => ({}))) as {
          choices?: { message?: { content?: string } }[];
        };
        let raw = data.choices?.[0]?.message?.content?.trim().slice(0, 500) ?? "";

        // Resposta vazia NÃO é "ignorar" — é falha. Faz uma segunda tentativa
        // antes de desistir, e se ainda vier vazio devolve erro (a extensão
        // reenfileira) em vez de marcar a pergunta como ignorada.
        if (!isNonEmptyText(raw)) {
          upstream = await callModel(key, system, messages);
          if (upstream.ok) {
            data = (await upstream.json().catch(() => ({}))) as typeof data;
            raw = data.choices?.[0]?.message?.content?.trim().slice(0, 500) ?? "";
          }
        }
        if (!isNonEmptyText(raw)) {
          return new Response("Empty AI response", { status: 502, headers: CORS });
        }

        const ignore = raw.replace(/[\s"'.]/g, "").toUpperCase() === "[[IGNORAR]]";
        // Se o marcador aparecer no meio de um texto, limpa e mantém a resposta.
        const rawReply = ignore ? "" : raw.split(IGNORE_TAG).join("");
        const validation = validateContentForPublish(rawReply);

        if (!ignore && !validation.valid) {
          return new Response("Empty or whitespace AI response", { status: 502, headers: CORS });
        }

        const finalReply = ignore ? "" : validation.content;

        return json(200, {
          reply: finalReply,
          ignore,
          reason: ignore ? "off_topic" : null,
          prioritized,
          remaining: guard.remaining,
          plan: guard.plan,
        });
      },
    },
  },
});
