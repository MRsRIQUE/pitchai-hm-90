import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { guardAiRequest } from "@/lib/live/api-auth.server";
import { throttle } from "@/lib/live/rate-limit.server";
import { validateContentForPublish } from "@/lib/live/validation.server";
import {
  TTS_MAX_CHARS,
  synthesizeSpeech,
  ttsAudioResponse,
  ttsErrorResponse,
} from "@/lib/live/tts.server";

const BodySchema = z.object({
  text: z.string().max(TTS_MAX_CHARS),
  voice: z.string().max(80).optional(),
  speed: z.number().min(0.5).max(2).optional(),
});

/**
 * Prévia de voz do painel web (botão "Testar voz").
 * A síntese em si vive em `@/lib/live/tts.server` — a rota só cuida de auth,
 * validação de entrada e formato de resposta.
 */
export const Route = createFileRoute("/api/tts/preview")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const json = (status: number, body: unknown) =>
          new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          });

        const guard = await guardAiRequest(request, "tts_speak");
        if (!guard.ok) {
          return json(guard.status ?? 401, {
            error: guard.status === 429 ? "quota_exceeded" : "unauthorized",
            message: guard.message ?? "Acesso negado.",
          });
        }

        const gate = throttle(`tts_preview:${guard.userId ?? "anon"}`, {
          limit: 30,
          windowMs: 60_000,
        });
        if (!gate.ok) {
          return json(429, {
            error: "rate_limited",
            message: "Muitas prévias seguidas. Aguarde um instante.",
            retryAfter: gate.retryAfter,
          });
        }

        const parsed = BodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return json(400, {
            error: "invalid_body",
            message: "Texto, voz ou velocidade inválidos.",
          });
        }
        const body = parsed.data;

        const rawText = body.text;
        const validation = validateContentForPublish(rawText);
        if (!validation.valid) {
          return json(400, {
            error: "empty_text",
            message: "Escreva um texto para ouvir a prévia da voz.",
          });
        }

        const result = await synthesizeSpeech({
          text: validation.content,
          voice: body.voice,
          speed: body.speed,
        });

        if (!result.ok) return ttsErrorResponse(result);
        return ttsAudioResponse(result);
      },
    },
  },
});
