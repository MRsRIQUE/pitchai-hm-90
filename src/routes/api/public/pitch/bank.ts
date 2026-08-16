import { createFileRoute } from "@tanstack/react-router";
import { GoogleGenAI } from "@google/genai";
import { guardApiRequest, recordAiUsageTokens } from "@/lib/live/api-auth.server";
import { corsHeaders } from "@/lib/live/cors.server";
import { validateContentForPublish } from "@/lib/live/validation.server";

type PitchBankBody = {
  count?: number;
  product?: { name?: string; price?: string; description?: string };
  systemPrompt?: string;
};

function parsePitches(raw: string, count: number): string[] {
  let candidates: unknown[] = [];
  try {
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/gi, ""));
    candidates = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.pitches)
        ? parsed.pitches
        : [];
  } catch {
    candidates = raw.split(/\n+/).map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, ""));
  }

  const seen = new Set<string>();
  const pitches: string[] = [];
  for (const value of candidates) {
    const validation = validateContentForPublish(
      String(value ?? "")
        .trim()
        .slice(0, 280),
    );
    if (!validation.valid || validation.content.length < 35) continue;
    const key = validation.content
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    pitches.push(validation.content);
    if (pitches.length >= count) break;
  }
  return pitches;
}

export const Route = createFileRoute("/api/public/pitch/bank")({
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

        const guard = await guardApiRequest(request, "chat_reply");
        if (!guard.ok) return json(guard.status ?? 500, { error: guard.message });

        let body: PitchBankBody;
        try {
          body = (await request.json()) as PitchBankBody;
        } catch {
          return json(400, { error: "Corpo inválido." });
        }

        const productName = String(body.product?.name ?? "")
          .trim()
          .slice(0, 240);
        if (!productName) return json(400, { error: "Produto não informado." });

        const count = Math.max(10, Math.min(15, Math.round(Number(body.count) || 12)));
        const systemInstruction = String(body.systemPrompt ?? "")
          .trim()
          .slice(0, 5000);
        const prompt = [
          `Crie exatamente ${count} variações independentes de pitch para uma live de vendas.`,
          `Produto: ${productName}.`,
          body.product?.price
            ? `Preço cadastrado: ${String(body.product.price).slice(0, 80)}.`
            : "",
          body.product?.description
            ? `Descrição: ${String(body.product.description).slice(0, 1200)}.`
            : "",
          "Cada variação deve ter entre 45 e 180 caracteres, soar natural quando falada e funcionar isoladamente.",
          "Alterne ganchos, benefícios, objeções e chamadas para clicar no produto fixado.",
          "Nunca invente preço, desconto, estoque, garantia ou resultado.",
          "Não use emojis, markdown, numeração nem instruções de câmera.",
          'Responda somente JSON válido no formato: {"pitches":["...","..."]}.',
        ]
          .filter(Boolean)
          .join("\n");

        const apiKey = process.env.GEMINI_API_KEY || process.env.GCP_API_KEY;
        if (!apiKey) return json(500, { error: "IA indisponível." });

        try {
          const ai = new GoogleGenAI({ apiKey });
          const response = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite",
            contents: prompt,
            config: {
              systemInstruction: systemInstruction || undefined,
              responseMimeType: "application/json",
            },
          });
          const pitches = parsePitches(response.text || "", count);
          if (pitches.length < 5) return json(502, { error: "Banco de pitches incompleto." });

          const usage = response.usageMetadata;
          const tokensInput = Math.max(
            1,
            Number(usage?.promptTokenCount) ||
              Math.ceil((prompt.length + systemInstruction.length) / 4),
          );
          const tokensOutput = Math.max(
            1,
            Number(usage?.candidatesTokenCount) || Math.ceil((response.text || "").length / 4),
          );
          const quota = await recordAiUsageTokens(guard, tokensInput, tokensOutput);

          return json(200, {
            pitches,
            generatedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            tokenRemaining: quota.remaining,
          });
        } catch (error) {
          console.error("[pitch/bank]", error);
          return json(502, { error: "Não foi possível preparar os pitches." });
        }
      },
    },
  },
});
