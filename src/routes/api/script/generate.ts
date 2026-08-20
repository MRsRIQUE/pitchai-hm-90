import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { buildSystemPrompt, type LiveConfig } from "@/lib/live/config";
import { guardAiRequest } from "@/lib/live/api-auth.server";
import { throttle } from "@/lib/live/rate-limit.server";
import { validateContentForPublish } from "@/lib/live/validation.server";

const BodySchema = z.object({
  config: z.record(z.string(), z.unknown()),
  duracaoMin: z.number().min(1).max(15).optional(),
  objetivo: z.string().max(200).optional(),
  productId: z.string().max(120).optional(),
});

export const Route = createFileRoute("/api/script/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const guard = await guardAiRequest(request, "chat_reply");
        if (!guard.ok) return new Response(guard.message, { status: guard.status });

        const apiKey = process.env.GEMINI_API_KEY || process.env.GCP_API_KEY;
        if (!apiKey) return new Response("Missing GEMINI_API_KEY", { status: 500 });

        let body: z.infer<typeof BodySchema>;
        try {
          const parsed = BodySchema.safeParse(await request.json());
          if (!parsed.success) return new Response("Invalid body", { status: 400 });
          body = parsed.data;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const gate = throttle(`script_generate:${guard.userId ?? "anon"}`, {
          limit: 20,
          windowMs: 60_000,
        });
        if (!gate.ok) {
          return new Response(JSON.stringify({ error: "rate_limited" }), {
            status: 429,
            headers: { "Content-Type": "application/json", "Retry-After": String(gate.retryAfter) },
          });
        }

        const objetivo = body.objetivo || "pitch do produto ativo";
        const duracao = body.duracaoMin ?? 3;
        const systemInstruction = buildSystemPrompt(body.config as unknown as LiveConfig);
        const configProdutos = (body.config as { produtos?: { id: string }[] }).produtos ?? [];
        const target = body.productId
          ? ((configProdutos.find((p) => p.id === body.productId) as
              LiveConfig["produtos"][number] | undefined) ?? null)
          : null;
        const userPrompt = [
          'Gere um ROTEIRO DE LIVE para o objetivo: "' + objetivo + '".',
          "Duração alvo: ~" + duracao + " minuto(s) falado.",
          target
            ? 'FOQUE 100% no produto: "' +
              target.name +
              '"' +
              (target.price ? " — " + target.price : "") +
              ". Descrição: " +
              (target.description || "(sem descrição)")
            : "Fale sobre o produto ATIVO (se houver). Se não houver, escolha o primeiro do catálogo.",
          "Formato do roteiro (use markdown):",
          "## Gancho (5-10s)",
          "## Apresentação do produto",
          "## Prova / benefícios",
          "## Objeção comum + resposta",
          "## Chamada para clicar no produto fixado",
          "## Encerramento com CTA",
          "",
          "Use o tom e as regras da marca. Sem asteriscos de ação de câmera. Use frases curtas e oralidade natural.",
        ].join("\n");

        try {
          const ai = new GoogleGenAI({ apiKey });
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: userPrompt,
            config: { systemInstruction },
          });
          const validation = validateContentForPublish(response.text || "");
          if (!validation.valid) {
            return new Response("Generated script is empty or whitespace only", { status: 502 });
          }
          return Response.json({ script: validation.content });
        } catch (error) {
          console.error("[script/generate]", error);
          return new Response("Gemini unavailable", { status: 502 });
        }
      },
    },
  },
});
