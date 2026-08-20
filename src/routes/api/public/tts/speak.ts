import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { guardApiRequest } from "@/lib/live/api-auth.server";
import { throttle } from "@/lib/live/rate-limit.server";
import { corsHeaders } from "@/lib/live/cors.server";
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
 * Voz da IA consumida pela extensão durante a live.
 * Compartilha o núcleo de síntese com /api/tts/preview via `@/lib/live/tts.server`
 * — antes as duas rotas eram cópias e divergiram.
 */
export const Route = createFileRoute("/api/public/tts/speak")({
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

        const guard = await guardApiRequest(request, "tts_speak");
        if (!guard.ok) {
          return json(guard.status ?? 500, {
            error: guard.status === 429 ? "quota_exceeded" : "invalid_token",
            message: guard.message ?? "Acesso negado",
            remaining: 0,
            locked: true,
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

        const gate = throttle(`tts_speak:${guard.userId ?? "anon"}`, {
          limit: 60,
          windowMs: 60_000,
        });
        if (!gate.ok) {
          return json(429, {
            error: "rate_limited",
            message: "Muitas sínteses seguidas. Aguarde um instante.",
            retryAfter: gate.retryAfter,
          });
        }

        const rawText = body.text;
        const validation = validateContentForPublish(rawText);
        if (!validation.valid) {
          return json(400, { error: "empty_text", message: "Nenhum texto para falar." });
        }

        const result = await synthesizeSpeech({
          text: validation.content,
          voice: body.voice,
          speed: body.speed,
        });

        if (!result.ok) return ttsErrorResponse(result, CORS);

        return ttsAudioResponse(result, {
          ...CORS,
          "x-pitchai-remaining": String(guard.remaining ?? 0),
          "x-pitchai-plan": guard.plan ?? "",
        });
      },
    },
  },
});
