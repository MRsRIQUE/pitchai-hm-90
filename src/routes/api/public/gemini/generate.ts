import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { corsHeaders } from "@/lib/live/cors.server";
import { guardAiRequest, recordAiUsageTokens } from "@/lib/live/api-auth.server";
import { throttle } from "@/lib/live/rate-limit.server";
import { resolveChatModel } from "@/lib/live/ai-models";
import { validateContentForPublish } from "@/lib/live/validation.server";

const MAX_PROMPT_CHARS = 20_000;
const MAX_SYSTEM_INSTRUCTION_CHARS = 8_000;

const BodySchema = z.object({
  prompt: z.string().max(MAX_PROMPT_CHARS),
  mode: z.enum(["general", "complex", "fast"]).default("general"),
  systemInstruction: z.string().max(MAX_SYSTEM_INSTRUCTION_CHARS).optional(),
  enableHighThinking: z.boolean().default(false),
});

export const Route = createFileRoute("/api/public/gemini/generate")({
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

        const guard = await guardAiRequest(request, "chat_reply");
        if (!guard.ok) {
          return json(guard.status ?? 401, {
            error: guard.status === 429 ? "quota_exceeded" : "unauthorized",
            message: guard.message,
            locked: guard.status === 429,
            plan: guard.plan,
            tokenUsed: guard.tokenUsed,
            tokenLimit: guard.tokenLimit,
            tokenRemaining: guard.tokenRemaining,
            quotaResetAt: guard.quotaResetAt,
            upgrade: guard.upgrade,
          });
        }

        const gate = throttle(`ai_generate:${guard.userId ?? "anon"}`, {
          limit: 60,
          windowMs: 60_000,
        });
        if (!gate.ok)
          return new Response(
            JSON.stringify({ error: "rate_limited", retryAfter: gate.retryAfter }),
            {
              status: 429,
              headers: {
                ...CORS,
                "Content-Type": "application/json",
                "Retry-After": String(gate.retryAfter),
              },
            },
          );

        const apiKey = process.env.GEMINI_API_KEY || process.env.GCP_API_KEY;
        if (!apiKey) {
          return json(500, {
            error: "missing_api_key",
            message: "GEMINI_API_KEY environment variable is required",
          });
        }

        try {
          const parsed = BodySchema.safeParse(await request.json().catch(() => null));
          if (!parsed.success) {
            const tooLarge = parsed.error.issues.some(
              (i) => i.code === "too_big" || i.code === "invalid_string",
            );
            return json(tooLarge ? 413 : 400, {
              error: tooLarge ? "payload_too_large" : "invalid_body",
              message: tooLarge
                ? "Prompt ou instrução excede o limite de tamanho"
                : "Corpo da requisição inválido",
            });
          }
          const { prompt, mode, systemInstruction, enableHighThinking } = parsed.data;

          const promptValidation = validateContentForPublish(prompt);
          if (!promptValidation.valid) {
            return json(400, {
              error: "invalid_prompt",
              message: "Prompt is required and cannot be empty or composed only of whitespace",
            });
          }
          if (prompt.length > MAX_PROMPT_CHARS) {
            return json(413, { error: "prompt_too_large", message: "Prompt exceeds size limit" });
          }
          if (systemInstruction && systemInstruction.length > MAX_SYSTEM_INSTRUCTION_CHARS) {
            return json(413, {
              error: "system_instruction_too_large",
              message: "System instruction exceeds size limit",
            });
          }

          const ai = new GoogleGenAI({
            apiKey,
            httpOptions: {
              headers: {
                "User-Agent": "aistudio-build",
              },
            },
          });

          // Model selection strategy:
          // - complex / high thinking: AI_MODELS.complex
          // - fast / low-latency: AI_MODELS.fast
          // - general: AI_MODELS.general
          const model = resolveChatModel(mode, enableHighThinking);

          const config: Record<string, unknown> = {};
          if (systemInstruction) {
            config.systemInstruction = systemInstruction;
          }

          if (enableHighThinking || mode === "complex") {
            config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
          }

          const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: Object.keys(config).length > 0 ? config : undefined,
          });

          const generatedText = response.text ?? "";
          const outputValidation = validateContentForPublish(generatedText);
          if (!outputValidation.valid) {
            return json(502, {
              error: "empty_content",
              message: "Generated content is empty or composed only of whitespace",
            });
          }

          const usage = response.usageMetadata;
          const tokensInput =
            usage?.promptTokenCount ??
            Math.ceil((prompt.length + (systemInstruction?.length ?? 0)) / 4);
          const tokensOutput = usage?.candidatesTokenCount ?? Math.ceil(generatedText.length / 4);
          const tokenQuota = await recordAiUsageTokens(guard, tokensInput, tokensOutput);

          return json(200, {
            text: outputValidation.content,
            modelUsed: model,
            thinkingEnabled: !!config.thinkingConfig,
            tokenUsed: tokenQuota.used,
            tokenLimit: tokenQuota.limit,
            tokenRemaining: tokenQuota.remaining,
            quotaReached: tokenQuota.exceeded,
            quotaResetAt: tokenQuota.resetAt,
            upgrade: tokenQuota.upgrade,
          });
        } catch (err: unknown) {
          console.error("[gemini/generate]", err);
          return json(500, {
            error: "gemini_error",
            message: "Não foi possível gerar a resposta. Tente novamente em instantes.",
          });
        }
      },
    },
  },
});
