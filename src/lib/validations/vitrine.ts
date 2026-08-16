/**
 * Validações para dados da vitrine do TikTok Shop
 */
import { z } from "zod";

/** Teto de URL combinado com o painel — acima disso a foto cai no fallback. */
const MAX_IMAGE_URL_LEN = 2048;

/**
 * Foto e preço numérico que a extensão manda junto com o produto.
 *
 * Todos com `.catch(undefined)`: uma foto malformada ou um preço estranho não
 * podem derrubar o produto inteiro na validação. O produto entra sem o campo, o
 * painel cai no fallback (iniciais / `price` como texto) e o usuário continua
 * vendo a vitrine — descartar o item seria um estrago maior que o defeito.
 */
const MidiaFields = {
  /** Menor preço em CENTAVOS. Ausente = desconhecido; 0 significaria "de graça". */
  priceCents: z.number().int().nonnegative().optional().catch(undefined),
  /** Maior preço da faixa, em centavos. Só existe quando o produto tem faixa. */
  priceMaxCents: z.number().int().nonnegative().optional().catch(undefined),
  /** ISO 4217. Ausente = o painel assume BRL. */
  currency: z.string().max(3).optional().catch(undefined),
  /**
   * URL absoluta da foto. Só http(s): o dado passa por Firestore e localStorage
   * antes de virar `<img src>`, então não pode depender de a origem estar certa.
   */
  imageUrl: z
    .string()
    .max(MAX_IMAGE_URL_LEN)
    .regex(/^https?:\/\//i, "A foto do produto precisa ser uma URL http(s)")
    .optional()
    .catch(undefined),
};

/**
 * Schema para um item da vitrine
 */
export const VitrineItemSchema = z.object({
  name: z.string().min(1, "O nome do produto é obrigatório"),
  price: z.string().optional(),
  ...MidiaFields,
  description: z.string().optional(),
  id: z.string().optional(),
  active: z.boolean().optional().default(false),
});

/**
 * Schema para a resposta da API de vitrine
 */
export const PullVitrineResponseSchema = z.object({
  items: z.array(VitrineItemSchema),
  updatedAt: z.string().nullable().optional(),
});

/**
 * Schema para a resposta de produtos sincronizados
 */
export const VitrineProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  price: z.string().optional(),
  ...MidiaFields,
  active: z.boolean().optional(),
  fromVitrine: z.boolean().optional(),
});

/**
 * Schema para a configuração sincronizada
 */
export const VitrineConfigSchema = z.object({
  config: z.record(z.any()).optional(),
  updated_at: z.string().optional(),
  sync_token: z.string().optional(),
});

/**
 * Tipos inferidos
 */
export type VitrineItem = z.infer<typeof VitrineItemSchema>;
export type PullVitrineResponse = z.infer<typeof PullVitrineResponseSchema>;
export type VitrineProduct = z.infer<typeof VitrineProductSchema>;
export type VitrineConfig = z.infer<typeof VitrineConfigSchema>;

/**
 * Função para validar e parsear dados da vitrine
 */
export function validateVitrineResponse(data: unknown): PullVitrineResponse {
  return PullVitrineResponseSchema.parse(data);
}

/**
 * Função para validar um único item da vitrine
 */
export function validateVitrineItem(item: unknown): VitrineItem {
  return VitrineItemSchema.parse(item);
}

/**
 * Função para validar e transformar produtos sincronizados
 */
export function validateVitrineProducts(data: unknown): VitrineProduct[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((item) => {
      try {
        return VitrineProductSchema.parse(item);
      } catch (error) {
        console.warn("Item de produto inválido:", error, item);
        return null;
      }
    })
    .filter((item): item is VitrineProduct => item !== null);
}

/**
 * Função para validar a configuração sincronizada
 */
export function validateVitrineConfig(data: unknown): VitrineConfig {
  return VitrineConfigSchema.parse(data);
}
