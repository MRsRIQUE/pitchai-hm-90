import {
  CreditCard,
  Database,
  Flame,
  LayoutDashboard,
  Receipt,
  UserCog,
  Users,
} from "lucide-react";
import type { AppSection } from "@/components/app/AppShell";

/**
 * As seções do /admin na ordem em que sempre estiveram — os ids são os mesmos
 * das antigas abas horizontais, então links e memória muscular continuam valendo.
 */
export type AdminSectionId =
  "overview" | "ranking" | "indicacoes" | "usuarios" | "usage_firestore" | "planos" | "custos";

export const ADMIN_SECTIONS: (AppSection & { id: AdminSectionId })[] = [
  {
    id: "overview",
    label: "Visão geral",
    icon: LayoutDashboard,
    title: "Visão geral do negócio",
    subtitle: "Indicadores operacionais para decidir o próximo movimento.",
  },
  {
    id: "ranking",
    label: "Produtos quentes",
    icon: Flame,
    title: "Produtos quentes",
    subtitle: "Catálogo que alimenta a página pública /quentes.",
  },
  {
    id: "indicacoes",
    label: "Indicações",
    icon: Users,
    title: "Programa de afiliados",
    subtitle: "Comissões e pagamentos aos indicadores.",
  },
  {
    id: "usuarios",
    label: "Usuários e custos",
    icon: UserCog,
    title: "Usuários, custos e cotas",
    subtitle: "Consumo de IA e margem líquida por conta.",
  },
  {
    id: "usage_firestore",
    label: "Uso IA em tempo real",
    icon: Database,
    title: "Uso de IA em tempo real",
    subtitle: "Firestore ao vivo · /ai_usage_stats.",
  },
  {
    id: "planos",
    label: "Planos e receita",
    icon: CreditCard,
    title: "Planos e receita",
    subtitle: "Stripe como fonte financeira real.",
  },
  {
    id: "custos",
    label: "Custos globais de IA",
    icon: Receipt,
    title: "Custos globais de IA",
    subtitle: "Preços do provedor, uso estimado e câmbio.",
  },
];
