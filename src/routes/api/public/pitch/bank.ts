import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { guardApiRequest, recordAiUsageTokens } from "@/lib/live/api-auth.server";
import { throttle } from "@/lib/live/rate-limit.server";
import { AI_MODELS } from "@/lib/live/ai-models";
import { corsHeaders } from "@/lib/live/cors.server";
import { finalizeLiveReply, validateContentForPublish } from "@/lib/live/validation.server";

const BodySchema = z.object({
  count: z.number().int().min(10).max(15).optional(),
  product: z
    .object({
      name: z.string().max(240),
      price: z.string().max(80).optional(),
      description: z.string().max(1200).optional(),
      aiKnowledge: z.string().max(2000).optional(),
      aiSalesContext: z
        .object({
          hook: z.string().max(4_000).default(""),
          painDesire: z.string().max(4_000).default(""),
          benefits: z.string().max(4_000).default(""),
          objectionResponse: z.string().max(4_000).default(""),
          chatInteraction: z.string().max(4_000).default(""),
          cta: z.string().max(4_000).default(""),
        })
        .optional(),
    })
    .optional(),
  systemPrompt: z.string().max(12_000).optional(),
});

const PitchStageSchema = z.enum([
  "discovery",
  "consideration",
  "trust",
  "engagement",
  "conversion",
]);
const PitchAngleSchema = z.enum([
  "hook",
  "benefit",
  "use_case",
  "demonstration",
  "objection",
  "faq",
  "proof",
  "comparison",
  "cta",
]);
const PitchItemSchema = z.object({
  text: z.string(),
  stage: PitchStageSchema,
  angle: PitchAngleSchema,
  cta: z.boolean().default(false),
});
type PitchItem = z.infer<typeof PitchItemSchema>;

const FALLBACK_STAGES = [
  "discovery",
  "consideration",
  "trust",
  "engagement",
  "conversion",
] as const;

function parsePitchItems(raw: string, count: number): PitchItem[] {
  let candidates: unknown[] = [];
  try {
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/gi, ""));
    candidates = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.items)
        ? parsed.items
        : Array.isArray(parsed?.pitches)
          ? parsed.pitches
          : [];
  } catch {
    candidates = raw.split(/\n+/).map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, ""));
  }

  const seen = new Set<string>();
  const items: PitchItem[] = [];
  for (const [index, value] of candidates.entries()) {
    const candidate =
      value && typeof value === "object"
        ? PitchItemSchema.safeParse(value)
        : PitchItemSchema.safeParse({
            text: value,
            stage: FALLBACK_STAGES[index % FALLBACK_STAGES.length],
            angle: index % 4 === 3 ? "cta" : "benefit",
            cta: index % 4 === 3,
          });
    if (!candidate.success) continue;
    const validation = validateContentForPublish(finalizeLiveReply(candidate.data.text, 180));
    if (!validation.valid || validation.content.length < 35) continue;
    const key = validation.content
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push({ ...candidate.data, text: validation.content });
    if (items.length >= count) break;
  }
  return items;
}

export const Route = createFileRoute("/api/public/pitch/bank")({
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
        if (!guard.ok) return json(guard.status ?? 500, { error: guard.message });

        const gate = throttle(`pitch_bank:${guard.userId ?? "anon"}`, {
          limit: 20,
          windowMs: 60_000,
        });
        if (!gate.ok) {
          return json(429, {
            error: "rate_limited",
            message: "Muitas gerações seguidas. Aguarde um instante.",
            retryAfter: gate.retryAfter,
          });
        }

        let body: z.infer<typeof BodySchema>;
        try {
          const parsed = BodySchema.safeParse(await request.json());
          if (!parsed.success) return json(400, { error: "Corpo inválido." });
          body = parsed.data;
        } catch {
          return json(400, { error: "Corpo inválido." });
        }

        const productName = String(body.product?.name ?? "")
          .trim()
          .slice(0, 240);
        if (!productName) return json(400, { error: "Produto não informado." });

        const count = Math.round(body.count ?? 12);
        const systemInstruction = String(body.systemPrompt ?? "")
          .trim()
          .slice(0, 12_000);
        const prompt = [
          `Crie exatamente ${count} variações independentes de pitch para uma live de vendas.`,
          `Produto: ${productName}.`,
          body.product?.price
            ? `Preço cadastrado: ${String(body.product.price).slice(0, 80)}.`
            : "",
          body.product?.description
            ? `Descrição: ${String(body.product.description).slice(0, 1200)}.`
            : "",
          body.product?.aiKnowledge
            ? `Conhecimento aprendido: ${String(body.product.aiKnowledge).slice(0, 2000)}.`
            : "",
          body.product?.aiSalesContext
            ? `Estratégia específica deste produto: ${JSON.stringify(body.product.aiSalesContext).slice(0, 6000)}.`
            : "",
          "Cada item deve ter entre 45 e 180 caracteres, formar uma frase completa, soar natural quando falado e funcionar isoladamente.",
          "Monte um mini funil equilibrado: descoberta desperta curiosidade; consideração explica benefício e uso; confiança responde objeção/FAQ sem inventar; engagement faz uma pergunta simples; conversion usa CTA curto.",
          "Cubra vários ângulos: hook, benefit, use_case, demonstration, objection, faq, proof, comparison e cta. Não repita a mesma abertura, benefício ou CTA.",
          "Marque cta=true somente quando houver convite explícito para clicar no produto fixado ou comprar; no máximo 30% dos itens devem ter CTA.",
          "Nunca invente preço, desconto, estoque, garantia ou resultado.",
          "Não use emojis, markdown, numeração, reticências nem instruções de câmera.",
          'Responda somente JSON válido: {"items":[{"text":"...","stage":"discovery|consideration|trust|engagement|conversion","angle":"hook|benefit|use_case|demonstration|objection|faq|proof|comparison|cta","cta":false}]}.',
        ]
          .filter(Boolean)
          .join("\n");

        const apiKey = process.env.GEMINI_API_KEY || process.env.GCP_API_KEY;
        if (!apiKey) return json(500, { error: "IA indisponível." });

        try {
          const ai = new GoogleGenAI({ apiKey });
          const response = await ai.models.generateContent({
            model: AI_MODELS.fast,
            contents: prompt,
            config: {
              systemInstruction: systemInstruction || undefined,
              responseMimeType: "application/json",
            },
          });
          const items = parsePitchItems(response.text || "", count);
          if (items.length < 5) return json(502, { error: "Banco de pitches incompleto." });
          const pitches = items.map((item) => item.text);

          const usage = response.usageMetadata;
          const tokensInput = Math.max(
            1,
            Number(usage?.promptTokenCount) ||
              Math.ceil((prompt.length + systemInstruction.length) / 4),
          );
          const tokensOutput = Math.max(
            1,
            Number(usage?.candidatesTokenCount) || Math.ceil((response.text || "").length / 4),
          );
          const quota = await recordAiUsageTokens(guard, tokensInput, tokensOutput);

          return json(200, {
            pitches,
            items,
            generatedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            tokenRemaining: quota.remaining,
          });
        } catch (error) {
          console.error("[pitch/bank]", error);
          return json(502, { error: "Não foi possível preparar os pitches." });
        }
      },
    },
  },
});
