import { createFileRoute } from "@tanstack/react-router";
import { guardApiRequest } from "@/lib/live/api-auth.server";
import { corsHeaders } from "@/lib/live/cors.server";
import { validateContentForPublish } from "@/lib/live/validation.server";
import {
  TTS_MAX_CHARS,
  synthesizeSpeech,
  ttsAudioResponse,
  ttsErrorResponse,
} from "@/lib/live/tts.server";

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
            // Aditivo: `error` segue igual para a extensão antiga. `reason` diz
            // o motivo preciso (hoje só "device_mismatch").
            reason: guard.reason,
            message: guard.message ?? "Acesso negado",
            remaining: 0,
            locked: true,
          });
        }

        let body: { text?: string; voice?: string; speed?: number };
        try {
          body = await request.json();
        } catch {
          return json(400, { error: "invalid_json", message: "Corpo da requisição inválido." });
        }

        const rawText = (body.text ?? "").toString().slice(0, TTS_MAX_CHARS);
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
