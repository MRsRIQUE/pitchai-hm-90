/**
 * Validações para dados da vitrine do TikTok Shop
 */
import { z } from "zod";

/**
 * Schema para um item da vitrine
 */
export const VitrineItemSchema = z.object({
  name: z.string().min(1, "O nome do produto é obrigatório"),
  price: z.string().optional(),
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
