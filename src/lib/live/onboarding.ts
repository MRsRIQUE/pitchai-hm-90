export type OnboardingStep =
  "extensao" | "vbcable" | "roteamento" | "catalogo" | "roteiros" | "iniciar";

export const ONBOARDING_STEPS: {
  id: OnboardingStep;
  title: string;
  description: string;
}[] = [
  {
    id: "extensao",
    title: "Instalar a extensão do Pitch AI",
    description:
      "Baixe o zip, descompacte e carregue em chrome://extensions com Modo desenvolvedor.",
  },
  {
    id: "vbcable",
    title: "Instalar o VB-Cable (Windows) ou BlackHole (Mac)",
    description: "Cria um cabo virtual pra levar a voz da IA até o TikTok Live Studio ou OBS.",
  },
  {
    id: "roteamento",
    title: "Testar roteamento de áudio",
    description:
      "Escolha o CABLE Input como saída no Pitch AI e clique em Testar voz — o VU meter deve reagir.",
  },
  {
    id: "catalogo",
    title: "Importar catálogo de produtos",
    description:
      "Na página da live, use o botão Importar do catálogo pra puxar os produtos automaticamente.",
  },
  {
    id: "roteiros",
    title: "Gerar roteiros",
    description:
      "Gere pitches para cada produto — a IA vai rotacionar essas frases enquanto a live acontece.",
  },
  {
    id: "iniciar",
    title: "Iniciar Ouvir chat na live",
    description: "Abra o Streamer Center do TikTok, clique em 🎙️ Ouvir chat e comece a live.",
  },
];

const KEY = "pitchai.onboarding.v1";

export type OnboardingState = Record<OnboardingStep, boolean>;

export function loadOnboarding(): OnboardingState {
  const empty: OnboardingState = {
    extensao: false,
    vbcable: false,
    roteamento: false,
    catalogo: false,
    roteiros: false,
    iniciar: false,
  };
  if (typeof window === "undefined") return empty;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty;
    return { ...empty, ...(JSON.parse(raw) as OnboardingState) };
  } catch {
    return empty;
  }
}

export function saveOnboarding(state: OnboardingState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(state));
}
