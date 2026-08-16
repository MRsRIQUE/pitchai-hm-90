import type { LiveConfig } from "@/lib/live/config";
import type { SectionId } from "./sections";

/**
 * O passo a passo do Início.
 *
 * Cada passo é derivado do estado real da config — nada de checkbox que o
 * usuário marca à mão e depois mente para ele mesmo. Por isso dois candidatos
 * óbvios ficaram de fora: "escolher voz" e "gerar o token" já nascem prontos
 * (`DEFAULT_CONFIG.voz.id` e `ensureMyLiveConfig()`), então marcariam como
 * feitos sem o usuário ter feito nada. O que vale mesmo é o roteamento da voz
 * e a extensão realmente detectada no navegador.
 */

export type PassoId = "extensao" | "produtos" | "ativo" | "marca" | "voz" | "protecao";

export type Passo = {
  id: PassoId;
  titulo: string;
  descricao: string;
  feito: boolean;
  destino: SectionId;
};

export function derivarPassos(
  config: LiveConfig,
  contexto: { extensaoInstalada: boolean; syncToken: string | null },
): Passo[] {
  const { extensaoInstalada, syncToken } = contexto;

  return [
    {
      id: "extensao",
      titulo: "Conectar a extensão",
      descricao: "É ela que lê o chat e fixa os produtos dentro do TikTok Shop.",
      feito: extensaoInstalada && Boolean(syncToken),
      destino: "conta",
    },
    {
      id: "produtos",
      titulo: "Trazer seus produtos",
      descricao: "Importe a vitrine do TikTok ou cadastre um produto à mão.",
      feito: config.produtos.length > 0,
      destino: "produtos",
    },
    {
      id: "ativo",
      titulo: "Escolher o produto que a IA vende",
      descricao: "Só um fica ativo por vez — é sobre ele que a IA responde.",
      feito: config.produtos.some((p) => p.active),
      destino: "produtos",
    },
    {
      id: "marca",
      titulo: "Ensinar a marca para a IA",
      descricao: "Nome e nicho já mudam o tom de toda resposta e de todo roteiro.",
      feito:
        config.aiContext.brandName.trim().length > 0 && config.aiContext.niche.trim().length > 0,
      destino: "ia",
    },
    {
      id: "voz",
      titulo: "Mandar a voz para a live",
      descricao: "Escolha o cabo virtual como saída, senão a IA fala só na sua caixa de som.",
      feito: Boolean(config.voz.outputDeviceId),
      destino: "voz",
    },
    {
      id: "protecao",
      titulo: "Ligar a proteção",
      descricao: "Vigia a tela, filtra o chat e evita que a live caia por violação.",
      feito: config.protecaoGeral,
      destino: "protecao",
    },
  ];
}

/** Índice do passo em que o usuário está — o primeiro que ainda não foi feito. */
export function passoAtual(passos: Passo[]): number {
  return passos.findIndex((p) => !p.feito);
}
