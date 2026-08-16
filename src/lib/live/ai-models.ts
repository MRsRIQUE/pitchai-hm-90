/**
 * Modelos Gemini usados pelo backend — fonte única de verdade.
 * Trocar/evoluir modelo deve exigir alteração apenas aqui.
 */
export const AI_MODELS = {
  /** Uso geral (chat/transcrição). */
  general: "gemini-3.5-flash",
  /** Tarefas complexas / alto raciocínio. */
  complex: "gemini-3.1-pro-preview",
  /** Baixa latência (fallback e tarefas simples). */
  fast: "gemini-3.1-flash-lite",
  /** Fallback legado da cascata de chat. */
  legacy: "gemini-2.5-flash",
  /** TTS nativo. */
  tts: "gemini-3.1-flash-tts-preview",
  /** Live API (voz em tempo real). */
  live: "gemini-3.1-flash-live-preview",
} as const;

export type ChatMode = "general" | "complex" | "fast";

/** Resolve o modelo de chat a partir do modo pedido e da flag de thinking. */
export function resolveChatModel(mode: string | undefined, enableHighThinking = false): string {
  if (mode === "complex" || enableHighThinking) return AI_MODELS.complex;
  if (mode === "fast") return AI_MODELS.fast;
  return AI_MODELS.general;
}

/** Cascata de fallback do chat: modelo escolhido → fast → legado (sem duplicar). */
export function chatModelCascade(modelName: string): string[] {
  return [modelName, AI_MODELS.fast, AI_MODELS.legacy].filter(
    (model, index, all) => all.indexOf(model) === index,
  );
}
