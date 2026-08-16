import { describe, expect, it } from "vitest";
import { AI_MODELS, resolveChatModel, chatModelCascade } from "@/lib/live/ai-models";

describe("resolveChatModel", () => {
  it("returns general model when mode is undefined", () => {
    expect(resolveChatModel(undefined)).toBe(AI_MODELS.general);
  });

  it("returns general model when mode is 'general'", () => {
    expect(resolveChatModel("general")).toBe(AI_MODELS.general);
  });

  it("returns complex model when mode is 'complex'", () => {
    expect(resolveChatModel("complex")).toBe(AI_MODELS.complex);
  });

  it("returns fast model when mode is 'fast'", () => {
    expect(resolveChatModel("fast")).toBe(AI_MODELS.fast);
  });

  it("returns complex model when enableHighThinking is true regardless of mode", () => {
    expect(resolveChatModel(undefined, true)).toBe(AI_MODELS.complex);
    expect(resolveChatModel("general", true)).toBe(AI_MODELS.complex);
    expect(resolveChatModel("fast", true)).toBe(AI_MODELS.complex);
  });

  it("returns complex model when mode is 'complex' and enableHighThinking is true", () => {
    expect(resolveChatModel("complex", true)).toBe(AI_MODELS.complex);
  });

  it("returns general model when enableHighThinking is false and mode is not complex/fast", () => {
    expect(resolveChatModel("unknown", false)).toBe(AI_MODELS.general);
    expect(resolveChatModel("", false)).toBe(AI_MODELS.general);
  });
});

describe("chatModelCascade", () => {
  it("returns [chosen, fast, legacy] when no duplicates", () => {
    const result = chatModelCascade(AI_MODELS.general);
    expect(result).toEqual([AI_MODELS.general, AI_MODELS.fast, AI_MODELS.legacy]);
  });

  it("deduplicates when modelName equals fast", () => {
    const result = chatModelCascade(AI_MODELS.fast);
    expect(result).toEqual([AI_MODELS.fast, AI_MODELS.legacy]);
  });

  it("deduplicates when modelName equals legacy", () => {
    const result = chatModelCascade(AI_MODELS.legacy);
    expect(result).toEqual([AI_MODELS.legacy, AI_MODELS.fast]);
  });

  it("deduplicates when modelName equals both fast and legacy", () => {
    // edge case: custom name matching fast
    const result = chatModelCascade(AI_MODELS.complex);
    expect(result).toEqual([AI_MODELS.complex, AI_MODELS.fast, AI_MODELS.legacy]);
  });

  it("preserves order: chosen first, then fast, then legacy", () => {
    const result = chatModelCascade("custom-model");
    expect(result).toEqual(["custom-model", AI_MODELS.fast, AI_MODELS.legacy]);
  });

  it("never contains duplicate entries", () => {
    const allModels = Object.values(AI_MODELS);
    for (const model of allModels) {
      const cascade = chatModelCascade(model);
      const unique = [...new Set(cascade)];
      expect(cascade).toEqual(unique);
    }
  });
});
