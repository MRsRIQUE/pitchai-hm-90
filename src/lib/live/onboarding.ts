export type OnboardingStep =
  "extensao" | "midiaVirtual" | "roteamento" | "catalogo" | "roteiros" | "iniciar";

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
    id: "midiaVirtual",
    title: "Ativar a mídia virtual do Pitch AI",
    description: "A extensão cria câmera e microfone virtuais automaticamente dentro do TikTok.",
  },
  {
    id: "roteamento",
    title: "Selecionar as fontes Pitch AI",
    description:
      "No TikTok, escolha Pitch AI — Câmera Virtual e Pitch AI — Microfone Virtual e teste a voz.",
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
      "Abra Roteiros, escolha o produto e gere uma fala completa no estilo e duração desejados.",
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
    midiaVirtual: false,
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
