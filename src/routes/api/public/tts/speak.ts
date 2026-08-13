import { createFileRoute } from "@tanstack/react-router";
import { guardApiRequest } from "@/lib/live/api-auth.server";
import { corsHeaders } from "@/lib/live/cors.server";
import { validateContentForPublish } from "@/lib/live/validation.server";

export const Route = createFileRoute("/api/public/tts/speak")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request) }),
      POST: async ({ request }) => {
        const CORS = corsHeaders(request);
        const jsonError = (status: number, message: string, code = "error") =>
          new Response(JSON.stringify({ error: code, message, remaining: 0, locked: true }), {
            status,
            headers: { ...CORS, "Content-Type": "application/json" },
          });

        const guard = await guardApiRequest(request, "tts_speak");
        if (!guard.ok) {
          return jsonError(
            guard.status ?? 500,
            guard.message ?? "Acesso negado",
            guard.status === 429 ? "quota_exceeded" : "invalid_token",
          );
        }

        const key = process.env.LOVABLE_API_KEY || process.env.GEMINI_API_KEY;
        if (!key)
          return jsonError(500, "Missing LOVABLE_API_KEY or GEMINI_API_KEY", "missing_api_key");

        let body: { text?: string; voice?: string; speed?: number };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400, headers: CORS });
        }

        const rawText = (body.text ?? "").toString().slice(0, 500);
        const validation = validateContentForPublish(rawText);
        if (!validation.valid) {
          return new Response("Empty or whitespace text", { status: 400, headers: CORS });
        }
        const text = validation.content;
        const voice = (body.voice ?? "nova").toString();
        const speed = Math.max(0.7, Math.min(1.2, Number(body.speed) || 1.0));

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-4o-mini-tts",
            input: text,
            voice,
            speed,
            response_format: "mp3",
          }),
        });

        if (!upstream.ok) {
          const err = await upstream.text().catch(() => "");
          return new Response(err || "TTS failed", {
            status: upstream.status,
            headers: CORS,
          });
        }

        return new Response(upstream.body, {
          headers: {
            ...CORS,
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
            "x-pitchai-remaining": String(guard.remaining ?? 0),
            "x-pitchai-plan": guard.plan ?? "",
          },
        });
      },
    },
  },
});
