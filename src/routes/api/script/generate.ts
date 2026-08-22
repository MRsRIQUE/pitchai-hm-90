import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { guardAiRequest, recordAiUsageTokens } from "@/lib/live/api-auth.server";
import { AI_MODELS } from "@/lib/live/ai-models";
import { throttle } from "@/lib/live/rate-limit.server";
import { buildScriptPrompt, SCRIPT_STYLE_IDS } from "@/lib/live/script-generation";
import { validateContentForPublish } from "@/lib/live/validation.server";

const ProductSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(240),
  description: z.string().max(2_500).default(""),
  aiKnowledge: z.string().max(2_000).optional(),
  price: z.string().max(100).default(""),
  active: z.boolean().default(false),
});

const AiContextSchema = z.object({
  brandName: z.string().max(160).default(""),
  niche: z.string().max(160).default(""),
  tone: z.string().max(240).default("amigável"),
  targetAudience: z.string().max(500).default(""),
  differentials: z.string().max(2_000).default(""),
  policies: z.string().max(2_000).default(""),
  frequentQuestions: z.string().max(3_000).default(""),
  salesPlaybook: z.string().max(2_000).default(""),
  rules: z.string().max(2_000).default(""),
  extraContext: z.string().max(2_000).default(""),
});

const BodySchema = z.object({
  config: z.object({
    produtos: z.array(ProductSchema).max(100),
    aiContext: AiContextSchema,
  }),
  duracaoMin: z.number().int().min(1).max(15).default(3),
  objetivo: z.string().trim().min(3).max(240),
  productId: z.string().max(120),
  style: z.enum(SCRIPT_STYLE_IDS),
  cta: z.string().trim().max(240).optional(),
});

function jsonError(status: number, error: string) {
  return Response.json({ error }, { status });
}

export const Route = createFileRoute("/api/script/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const guard = await guardAiRequest(request, "chat_reply");
        if (!guard.ok) return jsonError(guard.status || 403, guard.message || "Acesso negado.");

        const apiKey = process.env.GEMINI_API_KEY || process.env.GCP_API_KEY;
        if (!apiKey) return jsonError(503, "Gerador de roteiro temporariamente indisponível.");

        const contentLength = Number(request.headers.get("content-length") || 0);
        if (contentLength > 256_000) return jsonError(413, "O catálogo enviado é muito grande.");

        const rawBody = await request.text();
        if (rawBody.length > 256_000) return jsonError(413, "O catálogo enviado é muito grande.");
        let rawJson: unknown = null;
        try {
          rawJson = JSON.parse(rawBody);
        } catch {
          return jsonError(400, "Requisição inválida.");
        }
        const parsed = BodySchema.safeParse(rawJson);
        if (!parsed.success) return jsonError(400, "Confira o produto e as opções do roteiro.");
        const body = parsed.data;
        const product = body.config.produtos.find((item) => item.id === body.productId);
        if (!product) return jsonError(400, "Selecione um produto válido para o roteiro.");

        const gate = throttle(`script_generate:${guard.userId}`, {
          limit: 20,
          windowMs: 60_000,
        });
        if (!gate.ok) {
          return new Response(
            JSON.stringify({ error: "Aguarde um pouco antes de gerar novamente." }),
            {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "Retry-After": String(gate.retryAfter),
              },
            },
          );
        }

        const prompt = buildScriptPrompt({
          aiContext: body.config.aiContext,
          product,
          objective: body.objetivo,
          durationMin: body.duracaoMin,
          style: body.style,
          cta: body.cta,
        });

        try {
          const ai = new GoogleGenAI({ apiKey });
          const response = await ai.models.generateContent({
            // Roteiro é uma geração longa e criativa; priorizamos o modelo
            // geral, enquanto o modelo lite continua reservado a tarefas curtas.
            model: AI_MODELS.general,
            contents: prompt.userPrompt,
            config: {
              systemInstruction: prompt.systemInstruction,
              temperature: 0.75,
            },
          });
          const validation = validateContentForPublish(response.text || "");
          if (!validation.valid)
            return jsonError(502, "A IA devolveu um roteiro vazio. Tente novamente.");

          const usage = response.usageMetadata;
          const tokensInput = Math.max(
            1,
            Number(usage?.promptTokenCount) ||
              Math.ceil((prompt.userPrompt.length + prompt.systemInstruction.length) / 4),
          );
          const tokensOutput = Math.max(
            1,
            Number(usage?.candidatesTokenCount) || Math.ceil(validation.content.length / 4),
          );
          const quota = await recordAiUsageTokens(guard, tokensInput, tokensOutput);

          return Response.json({
            script: validation.content,
            productId: product.id,
            targetWords: prompt.targetWords,
            tokenRemaining: quota.remaining,
          });
        } catch (error) {
          console.error("[script/generate]", error);
          return jsonError(502, "Não foi possível gerar o roteiro agora. Tente novamente.");
        }
      },
    },
  },
});
