import { createFileRoute } from "@tanstack/react-router";
import { GoogleGenAI } from "@google/genai";
import { corsHeaders } from "@/lib/live/cors.server";
import { guardAiRequest } from "@/lib/live/api-auth.server";

// 10MB base64 (~7.5MB binario) — limite suficiente para transcrever curtos clips ao vivo.
const MAX_AUDIO_BASE64_LENGTH = 10 * 1024 * 1024;

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
          return json(guard.status ?? 401, { error: "unauthorized", message: guard.message });
        }

        const apiKey = process.env.GEMINI_API_KEY || process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return json(500, {
            error: "missing_api_key",
            message: "GEMINI_API_KEY environment variable is required",
          });
        }

        try {
          const body = await request.json();
          const { audioBase64, mimeType = "audio/webm" } = body as {
            audioBase64: string;
            mimeType?: string;
          };

          if (!audioBase64) {
            return json(400, { error: "missing_audio", message: "audioBase64 is required" });
          }
          if (audioBase64.length > MAX_AUDIO_BASE64_LENGTH) {
            return json(413, {
              error: "audio_too_large",
              message: "Audio payload exceeds size limit",
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

          // Transcribe audio using gemini-3.5-flash
          const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
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

          return json(200, {
            transcription: response.text ?? "",
            modelUsed: "gemini-3.5-flash",
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return json(500, { error: "transcription_error", message });
        }
      },
    },
  },
});
