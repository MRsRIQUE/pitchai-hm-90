import {
  Activity,
  AudioLines,
  Brain,
  Home,
  KeyRound,
  Radio,
  ShieldCheck,
  ShoppingBag,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * As seções da sidebar do painel do usuário.
 *
 * `avancada` é o que o toggle Simples/Avançado controla: no Simples a sidebar
 * mostra só o caminho de quem quer subir a live e vender; no Avançado ela
 * revela as telas de ajuste fino. Nada some do produto — muda só a distância
 * até cada coisa.
 */

export type SectionId =
  | "inicio"
  | "live"
  | "desempenho"
  | "produtos"
  | "ia"
  | "voz"
  | "protecao"
  | "automacoes"
  | "conta";

export type SectionDef = {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  avancada?: boolean;
};

export const SECTIONS: SectionDef[] = [
  {
    id: "inicio",
    label: "Início",
    icon: Home,
    title: "Início",
    subtitle: "Seu progresso e os controles do dia a dia",
  },
  {
    id: "live",
    label: "Live",
    icon: Radio,
    title: "Live",
    subtitle: "Fonte de vídeo, duração e ensaio antes de subir",
  },
  {
    id: "desempenho",
    label: "Desempenho",
    icon: Activity,
    title: "Desempenho",
    subtitle: "Números lidos direto do Gerenciador de LIVE",
    avancada: true,
  },
  {
    id: "produtos",
    label: "Produtos",
    icon: ShoppingBag,
    title: "Produtos",
    subtitle: "Catálogo, produto ativo e rodízio automático",
  },
  {
    id: "ia",
    label: "IA",
    icon: Brain,
    title: "IA",
    subtitle: "Contexto da marca, roteiros e laboratório",
    avancada: true,
  },
  {
    id: "voz",
    label: "Voz",
    icon: AudioLines,
    title: "Voz",
    subtitle: "Escolha da voz e como ela chega na sua live",
  },
  {
    id: "protecao",
    label: "Proteção",
    icon: ShieldCheck,
    title: "Proteção",
    subtitle: "O que a IA nunca deve deixar passar",
    avancada: true,
  },
  {
    id: "automacoes",
    label: "Automações",
    icon: Zap,
    title: "Automações",
    subtitle: "O que a IA faz sozinha enquanto você vende",
    avancada: true,
  },
  {
    id: "conta",
    label: "Conta",
    icon: KeyRound,
    title: "Conta e sincronização",
    subtitle: "Token da extensão, cotas e backup",
  },
];

/** Seções visíveis no modo escolhido. */
export function sectionsDoModo(simples: boolean): SectionDef[] {
  return simples ? SECTIONS.filter((s) => !s.avancada) : SECTIONS;
}

/** Existe essa seção no modo atual? Usado para não deixar o painel numa tela órfã. */
export function sectionDisponivel(id: string, simples: boolean): boolean {
  return sectionsDoModo(simples).some((s) => s.id === id);
}
