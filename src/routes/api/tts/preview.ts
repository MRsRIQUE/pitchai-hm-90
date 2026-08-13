import { createFileRoute } from "@tanstack/react-router";
import { guardAiRequest } from "@/lib/live/api-auth.server";
import { validateContentForPublish } from "@/lib/live/validation.server";

export const Route = createFileRoute("/api/tts/preview")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const guard = await guardAiRequest(request, "tts_speak");
        if (!guard.ok) return new Response(guard.message, { status: guard.status });

        const key = process.env.LOVABLE_API_KEY;
        if (!key) {
          return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        }
        let body: { text?: string; voice?: string; speed?: number };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const rawText = (body.text ?? "").toString().slice(0, 500);
        const validation = validateContentForPublish(rawText);
        if (!validation.valid) {
          return new Response("Empty or whitespace text", { status: 400 });
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
          const errBody = await upstream.text().catch(() => "");
          return new Response(errBody || "TTS failed", {
            status: upstream.status,
          });
        }

        return new Response(upstream.body, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
