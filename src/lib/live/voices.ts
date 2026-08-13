export type VoiceId = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" | "coral" | "sage";

export const VOICES: { id: VoiceId; label: string; description: string }[] = [
  { id: "alloy", label: "Alloy", description: "Neutra, versátil" },
  { id: "nova", label: "Nova", description: "Feminina, jovem, enérgica" },
  { id: "shimmer", label: "Shimmer", description: "Feminina, calorosa" },
  { id: "coral", label: "Coral", description: "Feminina, expressiva" },
  { id: "echo", label: "Echo", description: "Masculina, séria" },
  { id: "onyx", label: "Onyx", description: "Masculina, grave" },
  { id: "fable", label: "Fable", description: "Narrador, britânico" },
  { id: "sage", label: "Sage", description: "Neutra, tranquila" },
];

export const DEFAULT_VOICE: VoiceId = "nova";

export const SAMPLE_PHRASE =
  "Olá pessoal! Bem-vindos à live. Confira o produto fixado e aproveite a oferta!";
