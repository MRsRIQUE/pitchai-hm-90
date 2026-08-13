import { createFileRoute } from "@tanstack/react-router";
import { buildSystemPrompt, type LiveConfig } from "@/lib/live/config";
import { guardAiRequest } from "@/lib/live/api-auth.server";
import { validateContentForPublish } from "@/lib/live/validation.server";

type Body = {
  config: LiveConfig;
  duracaoMin?: number;
  objetivo?: string;
  productId?: string; // se presente, roteiro focado neste produto
};

export const Route = createFileRoute("/api/script/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const guard = await guardAiRequest(request, "chat_reply");
        if (!guard.ok) return new Response(guard.message, { status: guard.status });

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        if (!body?.config) return new Response("Missing config", { status: 400 });

        const objetivo = (body.objetivo || "pitch do produto ativo").slice(0, 200);
        const duracao = Math.max(1, Math.min(15, Number(body.duracaoMin) || 3));
        const system = buildSystemPrompt(body.config);

        const target = body.productId
          ? (body.config.produtos.find((p) => p.id === body.productId) ?? null)
          : null;

        const userPrompt = [
          `Gere um ROTEIRO DE LIVE para o objetivo: "${objetivo}".`,
          `Duração alvo: ~${duracao} minuto(s) falado.`,
          target
            ? `FOQUE 100% no produto: "${target.name}"${target.price ? ` — ${target.price}` : ""}. Descrição: ${target.description || "(sem descrição)"}`
            : `Fale sobre o produto ATIVO (se houver). Se não houver, escolha o primeiro do catálogo.`,
          `Formato do roteiro (use markdown):`,
          `## Gancho (5-10s)`,
          `## Apresentação do produto`,
          `## Prova / benefícios`,
          `## Objeção comum + resposta`,
          `## Chamada para clicar no produto fixado`,
          `## Encerramento com CTA`,
          ``,
          `Regras:`,
          `- Use o tom e as regras da marca definidos no system.`,
          `- Sem asteriscos de "ação de câmera", só a fala.`,
          `- Frases curtas, oralidade natural, sem jargão corporativo.`,
        ].join("\n");

        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: system },
              { role: "user", content: userPrompt },
            ],
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          return new Response(errText || "Gateway error", {
            status: res.status,
          });
        }

        const json = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const rawContent = json.choices?.[0]?.message?.content ?? "";
        const validation = validateContentForPublish(rawContent);
        if (!validation.valid) {
          return new Response("Generated script is empty or whitespace only", { status: 502 });
        }
        return Response.json({ script: validation.content });
      },
    },
  },
});
