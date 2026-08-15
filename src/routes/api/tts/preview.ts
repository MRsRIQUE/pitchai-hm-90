import { createFileRoute } from "@tanstack/react-router";
import { guardAiRequest } from "@/lib/live/api-auth.server";
import { validateContentForPublish } from "@/lib/live/validation.server";
import {
  TTS_MAX_CHARS,
  synthesizeSpeech,
  ttsAudioResponse,
  ttsErrorResponse,
} from "@/lib/live/tts.server";

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

        let body: { text?: string; voice?: string; speed?: number };
        try {
          body = await request.json();
        } catch {
          return json(400, { error: "invalid_json", message: "Corpo da requisição inválido." });
        }

        const rawText = (body.text ?? "").toString().slice(0, TTS_MAX_CHARS);
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
