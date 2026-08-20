import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { guardApiRequest, recordAiUsageTokens } from "@/lib/live/api-auth.server";
import { throttle } from "@/lib/live/rate-limit.server";
import { corsHeaders } from "@/lib/live/cors.server";
import {
  isNonEmptyText,
  sanitizeReplyForPublish,
  validateContentForPublish,
} from "@/lib/live/validation.server";

const ReplyBodySchema = z.object({
  message: z.string().max(4000),
  author: z.string().max(120).optional(),
  systemPrompt: z.string().max(8000).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      }),
    )
    .max(40)
    .optional(),
  blacklist: z.array(z.string().max(120)).max(100).optional(),
  whitelist: z.array(z.string().max(120)).max(100).optional(),
  /** Resposta curta: instrução de no máximo 20 palavras em uma única frase. */
  brief: z.boolean().optional(),
});

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
import { AI_MODELS, chatModelCascade } from "@/lib/live/ai-models";

async function callModel(
  apiKey: string,
  system: string,
  messages: { role: string; content: string }[],
  options?: { model?: string; highThinking?: boolean },
) {
  const modelName = options?.model || AI_MODELS.general;
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { "User-Agent": "pitchai" } },
  });
  const conversationPrompt = messages
    .map((m) => (m.role === "assistant" ? "Assistente: " : "Usuário: ") + m.content)
    .join("\n");
  const config: Record<string, unknown> = { systemInstruction: system };
  if (options?.highThinking || modelName === AI_MODELS.complex) {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
  } else {
    // Respostas breves de chat: criatividade moderada com teto curto de saída.
    // (Modelos com thinkingConfig não aceitam temperature/maxOutputTokens.)
    config.generationConfig = { temperature: 0.8, maxOutputTokens: 120 };
  }

  let response;
  let lastError: unknown;
  const models = chatModelCascade(modelName);
  for (const model of models) {
    try {
      response = await ai.models.generateContent({ model, contents: conversationPrompt, config });
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!response) throw lastError || new Error("Nenhum modelo Gemini disponível");

  const usage = response.usageMetadata;
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: response.text || "" } }],
      usage: {
        prompt_tokens: usage?.promptTokenCount ?? 0,
        completion_tokens: usage?.candidatesTokenCount ?? 0,
        total_tokens: usage?.totalTokenCount ?? 0,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
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
            // Aditivo: `error` continua o mesmo para a extensão antiga. `reason`
            // é o motivo preciso (hoje só "device_mismatch") — sem ele, uma
            // recusa de vínculo chegaria rotulada como token inválido.
            reason: guard.reason,
            message: guard.message,
            remaining: 0,
            locked: true,
            plan: guard.plan,
            tokenUsed: guard.tokenUsed,
            tokenLimit: guard.tokenLimit,
            tokenRemaining: guard.tokenRemaining,
            quotaPeriod: guard.quotaPeriod,
            quotaResetAt: guard.quotaResetAt,
            quotaScope: guard.quotaScope,
            upgrade: guard.upgrade,
          });
        }

        const modelKey = process.env.GEMINI_API_KEY || process.env.GCP_API_KEY;
        if (!modelKey)
          return json(500, {
            error: "missing_api_key",
            message: "Missing GEMINI_API_KEY or GCP_API_KEY",
          });

        let body: z.infer<typeof ReplyBodySchema>;
        try {
          const parsed = ReplyBodySchema.safeParse(await request.json());
          if (!parsed.success) {
            return new Response("Invalid body", { status: 400, headers: CORS });
          }
          body = parsed.data;
        } catch {
          return new Response("Invalid JSON", { status: 400, headers: CORS });
        }

        const gate = throttle(`chat_reply:${guard.userId ?? "anon"}`, {
          limit: 120,
          windowMs: 60_000,
        });
        if (!gate.ok) {
          return new Response(JSON.stringify({ error: "rate_limited" }), {
            status: 429,
            headers: {
              ...CORS,
              "Content-Type": "application/json",
              "Retry-After": String(gate.retryAfter),
            },
          });
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

        // Modo breve: resposta de no máximo 20 palavras, uma frase só.
        const brief = body.brief === true;

        const filterRules = [
          "",
          "REGRAS DE RESPOSTA (obrigatórias):",
          "- Responda SEMPRE que a mensagem tiver qualquer relação com a compra: produto, preço, desconto, cupom, frete, prazo de entrega, pagamento, parcelamento, estoque, tamanho, cor, material, garantia, troca, durabilidade, como usar, comparação entre produtos ou pedido de link.",
          "- Também responda saudação, elogio, dúvida vaga ('serve pra mim?', 'vale a pena?') e pedido de repetição de informação.",
          "- Na dúvida, RESPONDA. Só ignore palavrão, xingamento, spam, corrente, divulgação de outro vendedor ou assunto totalmente fora da live.",
          "- Se não souber o dado exato (frete, cupom, prazo), responda mesmo assim de forma honesta e curta, orientando a conferir no carrinho/checkout — nunca invente valor.",
          `- Para ignorar, responda EXATAMENTE e somente: ${IGNORE_TAG}`,
          "- Responda em 1 frase curta e natural, como se estivesse falando ao vivo.",
          brief
            ? "- Esta é uma resposta BREVE: use NO MÁXIMO 20 palavras, em uma única frase."
            : "",
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

        let upstream = await callModel(modelKey, system, messages);
        if (!upstream.ok) {
          const err = await upstream.text().catch(() => "");
          return new Response(err || "AI failed", {
            status: upstream.status,
            headers: CORS,
          });
        }

        let data = (await upstream.json().catch(() => ({}))) as {
          choices?: { message?: { content?: string } }[];
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
          };
        };
        let raw = data.choices?.[0]?.message?.content?.trim().slice(0, 500) ?? "";
        let tokensInput = Math.max(0, Number(data.usage?.prompt_tokens) || 0);
        let tokensOutput = Math.max(0, Number(data.usage?.completion_tokens) || 0);

        // Resposta vazia NÃO é "ignorar" — é falha. Faz uma segunda tentativa
        // antes de desistir, e se ainda vier vazio devolve erro (a extensão
        // reenfileira) em vez de marcar a pergunta como ignorada.
        if (!isNonEmptyText(raw)) {
          upstream = await callModel(modelKey, system, messages);
          if (upstream.ok) {
            data = (await upstream.json().catch(() => ({}))) as typeof data;
            raw = data.choices?.[0]?.message?.content?.trim().slice(0, 500) ?? "";
            tokensInput += Math.max(0, Number(data.usage?.prompt_tokens) || 0);
            tokensOutput += Math.max(0, Number(data.usage?.completion_tokens) || 0);
          }
        }
        if (!isNonEmptyText(raw)) {
          return new Response("Empty AI response", { status: 502, headers: CORS });
        }

        const ignore = raw.replace(/[\s"'.]/g, "").toUpperCase() === "[[IGNORAR]]";
        // Se o marcador aparecer no meio de um texto, limpa e mantém a resposta.
        // Sanitização server-side: emojis, asteriscos e quebras duplicadas saem
        // antes de qualquer validação/publicação.
        const rawReply = ignore ? "" : sanitizeReplyForPublish(raw.split(IGNORE_TAG).join(""));
        const validation = validateContentForPublish(rawReply);

        if (!ignore && !validation.valid) {
          return new Response("Empty or whitespace AI response", { status: 502, headers: CORS });
        }

        const finalReply = ignore ? "" : validation.content;

        // Alguns gateways antigos não devolvem usage; nesses casos usamos uma
        // estimativa conservadora por caracteres para nunca deixar uso sem cobrança.
        if (tokensInput === 0) {
          tokensInput = Math.ceil(
            (system.length + messages.reduce((sum, item) => sum + item.content.length, 0)) / 4,
          );
        }
        if (tokensOutput === 0) tokensOutput = Math.ceil(raw.length / 4);

        let tokenQuota;
        try {
          tokenQuota = await recordAiUsageTokens(guard, tokensInput, tokensOutput);
        } catch (error) {
          console.error("[chat/reply] Falha ao registrar tokens:", error);
          return json(503, {
            error: "usage_unavailable",
            message: "Não foi possível registrar o consumo. Tente novamente em instantes.",
          });
        }

        return json(200, {
          reply: finalReply,
          ignore,
          reason: ignore ? "off_topic" : null,
          prioritized,
          remaining: guard.remaining,
          plan: guard.plan,
          tokenUsed: tokenQuota.used,
          tokenLimit: tokenQuota.limit,
          tokenRemaining: tokenQuota.remaining,
          quotaPeriod: tokenQuota.period,
          quotaResetAt: tokenQuota.resetAt,
          quotaScope: tokenQuota.scope,
          quotaReached: tokenQuota.exceeded,
          upgrade: tokenQuota.upgrade,
          upgradeMessage: tokenQuota.exceeded
            ? `Sua franquia ${tokenQuota.scope === "daily" ? "diária" : "mensal"} de tokens chegou ao limite. ${tokenQuota.upgrade.message}`
            : null,
        });
      },
    },
  },
});
