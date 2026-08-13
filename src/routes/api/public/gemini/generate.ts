import { createFileRoute } from "@tanstack/react-router";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { corsHeaders } from "@/lib/live/cors.server";
import { guardAiRequest } from "@/lib/live/api-auth.server";
import { validateContentForPublish } from "@/lib/live/validation.server";

const MAX_PROMPT_CHARS = 20_000;
const MAX_SYSTEM_INSTRUCTION_CHARS = 8_000;

export const Route = createFileRoute("/api/public/gemini/generate")({
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

        const guard = await guardAiRequest(request, "chat_reply");
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
          const {
            prompt,
            mode = "general", // "general" | "complex" | "fast"
            systemInstruction,
            enableHighThinking = false,
          } = body as {
            prompt: string;
            mode?: "general" | "complex" | "fast";
            systemInstruction?: string;
            enableHighThinking?: boolean;
          };

          const promptValidation = validateContentForPublish(prompt);
          if (!promptValidation.valid) {
            return json(400, {
              error: "invalid_prompt",
              message: "Prompt is required and cannot be empty or composed only of whitespace",
            });
          }
          if (prompt.length > MAX_PROMPT_CHARS) {
            return json(413, { error: "prompt_too_large", message: "Prompt exceeds size limit" });
          }
          if (systemInstruction && systemInstruction.length > MAX_SYSTEM_INSTRUCTION_CHARS) {
            return json(413, {
              error: "system_instruction_too_large",
              message: "System instruction exceeds size limit",
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

          // Model selection strategy:
          // - complex / high thinking: gemini-3.1-pro-preview
          // - fast / low-latency: gemini-3.1-flash-lite
          // - general: gemini-3.5-flash
          let model = "gemini-3.5-flash";
          if (mode === "complex" || enableHighThinking) {
            model = "gemini-3.1-pro-preview";
          } else if (mode === "fast") {
            model = "gemini-3.1-flash-lite";
          }

          const config: Record<string, unknown> = {};
          if (systemInstruction) {
            config.systemInstruction = systemInstruction;
          }

          if (enableHighThinking || mode === "complex") {
            config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
          }

          const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: Object.keys(config).length > 0 ? config : undefined,
          });

          const generatedText = response.text ?? "";
          const outputValidation = validateContentForPublish(generatedText);
          if (!outputValidation.valid) {
            return json(502, {
              error: "empty_content",
              message: "Generated content is empty or composed only of whitespace",
            });
          }

          return json(200, {
            text: outputValidation.content,
            modelUsed: model,
            thinkingEnabled: !!config.thinkingConfig,
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return json(500, { error: "gemini_error", message });
        }
      },
    },
  },
});
