import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { corsHeaders } from "@/lib/live/cors.server";
import { guardAiRequest, recordAiUsageTokens } from "@/lib/live/api-auth.server";
import { throttle } from "@/lib/live/rate-limit.server";
import { AI_MODELS } from "@/lib/live/ai-models";

// 10MB base64 (~7.5MB binario) — limite suficiente para transcrever curtos clips ao vivo.
const MAX_AUDIO_BASE64_LENGTH = 10 * 1024 * 1024;

const BodySchema = z.object({
  audioBase64: z.string().min(1).max(MAX_AUDIO_BASE64_LENGTH),
  mimeType: z
    .string()
    .regex(/^audio\/[a-z0-9.+-]+$/i)
    .default("audio/webm"),
});

export const Route = createFileRoute("/api/public/gemini/transcribe")({
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

        const guard = await guardAiRequest(request, "tts_speak");
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

        const gate = throttle(`ai_transcribe:${guard.userId ?? "anon"}`, {
          limit: 30,
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
            const tooLarge = parsed.error.issues.some((i) => i.code === "too_big");
            return json(tooLarge ? 413 : 400, {
              error: tooLarge ? "audio_too_large" : "invalid_body",
              message: tooLarge ? "Audio payload exceeds size limit" : "audioBase64 é obrigatório",
            });
          }
          const { audioBase64, mimeType } = parsed.data;

          const ai = new GoogleGenAI({
            apiKey,
            httpOptions: {
              headers: {
                "User-Agent": "aistudio-build",
              },
            },
          });

          const response = await ai.models.generateContent({
            model: AI_MODELS.general,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: audioBase64.replace(/^data:audio\/[a-z0-9]+;base64,/, ""),
                  },
                },
                {
                  text: "Transcreva com precisão o áudio fornecido em português. Retorne apenas o texto falado, sem introduções ou explicações.",
                },
              ],
            },
          });

          const usage = response.usageMetadata;
          const tokensInput = usage?.promptTokenCount ?? Math.ceil(audioBase64.length / 16);
          const tokensOutput =
            usage?.candidatesTokenCount ?? Math.ceil((response.text?.length ?? 0) / 4);
          const tokenQuota = await recordAiUsageTokens(guard, tokensInput, tokensOutput);

          return json(200, {
            transcription: response.text ?? "",
            modelUsed: AI_MODELS.general,
            tokenUsed: tokenQuota.used,
            tokenLimit: tokenQuota.limit,
            tokenRemaining: tokenQuota.remaining,
            quotaReached: tokenQuota.exceeded,
            quotaResetAt: tokenQuota.resetAt,
            upgrade: tokenQuota.upgrade,
          });
        } catch (err: unknown) {
          console.error("[gemini/transcribe]", err);
          return json(500, {
            error: "transcription_error",
            message: "Não foi possível transcrever o áudio. Tente novamente em instantes.",
          });
        }
      },
    },
  },
});
