/**
 * Tipos globais para a extensão Pitch AI
 * Centraliza todas as interfaces e schemas usados na extensão
 */

import { z } from "zod";
import { MAX_IMAGE_URL_LEN, MAX_PRODUCT_NAME_LEN } from "../utils/string";

// ============================================================================
// Schemas para dados do TikTok
// ============================================================================

/**
 * Schema para um produto do TikTok Shop.
 *
 * `price` é o texto que a vitrine escreveu ("R$ 89,90"); `priceCents` é o mesmo
 * valor em centavos, que é o que o painel formata. Os dois convivem: o texto
 * atende o catálogo antigo, já gravado, que não tem os campos numéricos.
 */
export const ProductSchema = z.object({
  pid: z.string().max(64).optional(),
  id: z.string().max(64).optional(),
  name: z.string().min(4).max(MAX_PRODUCT_NAME_LEN),
  price: z.string().max(40).optional(),
  /** Menor preço em CENTAVOS. Ausente = preço desconhecido; 0 seria "de graça". */
  priceCents: z.number().int().nonnegative().optional(),
  /** Maior preço da faixa, em centavos. Só existe quando o produto tem faixa. */
  priceMaxCents: z.number().int().nonnegative().optional(),
  /** ISO 4217. Ausente = o painel assume BRL. */
  currency: z.string().max(3).optional(),
  description: z.string().max(400).optional(),
  stock: z.number().optional(),
  /** URL absoluta http(s) da foto. Ver `isUsableImageUrl`. */
  imageUrl: z.string().max(MAX_IMAGE_URL_LEN).optional(),
  active: z.boolean().optional(),
  fromVitrine: z.boolean().optional(),
  demo: z.boolean().optional(),
});

export type Product = z.infer<typeof ProductSchema>;

/** Schema para uma mensagem do chat */
export const MessageSchema = z.object({
  author: z.string().min(2).max(40),
  text: z.string().min(2).max(300),
  timestamp: z.number().optional(),
});

export type Message = z.infer<typeof MessageSchema>;

// ============================================================================
// Schemas para configuração da extensão
// ============================================================================

/** Schema para configuração de voz */
export const VoiceConfigSchema = z.object({
  id: z.string().default("nova"),
  speed: z.number().min(0.7).max(1.2).default(1.0),
  gain: z.number().min(0.2).max(2).default(1.0),
  monitor: z
    .object({
      enabled: z.boolean().default(false),
      volume: z.number().min(0).max(1).default(0.6),
    })
    .default({}),
  pushToTalk: z
    .object({
      enabled: z.boolean().default(false),
      key: z.string().default("Space"),
    })
    .default({}),
});

export type VoiceConfig = z.infer<typeof VoiceConfigSchema>;

/** Schema para configuração de auto-fixar */
export const AutoFixarConfigSchema = z.object({
  enabled: z.boolean().default(false),
  query: z.string().optional(),
  minSec: z.number().min(5).max(600).default(20),
  maxSec: z.number().min(10).max(1200).default(60),
  ids: z.array(z.string()).default([]),
  names: z.array(z.string()).default([]),
});

export type AutoFixarConfig = z.infer<typeof AutoFixarConfigSchema>;

/** Schema para configuração de encerramento por tempo */
export const EncerrarTempoConfigSchema = z.object({
  enabled: z.boolean().default(false),
  minutes: z.number().min(1).max(1440).default(120),
});

export type EncerrarTempoConfig = z.infer<typeof EncerrarTempoConfigSchema>;

/** Schema para configuração de agendamento */
export const AgendarConfigSchema = z.object({
  enabled: z.boolean().default(false),
  at: z.string().optional(),
});

export type AgendarConfig = z.infer<typeof AgendarConfigSchema>;

/** Schema para configuração de filtros */
export const FiltrosConfigSchema = z.object({
  blacklist: z.array(z.string()).default([]),
  whitelist: z.array(z.string()).default([]),
});

export type FiltrosConfig = z.infer<typeof FiltrosConfigSchema>;

/** Schema para configuração de voz por contexto */
export const VozContextosConfigSchema = z.record(
  z
    .object({
      id: z.string().optional(),
      speed: z.number().optional(),
    })
    .partial()
    .nullable(),
);

export type VozContextosConfig = z.infer<typeof VozContextosConfigSchema>;

/** Schema para configuração de demo */
export const DemoConfigSchema = z.object({
  enabled: z.boolean().default(false),
  velocidade: z.number().min(1).max(10).default(1),
  comChat: z.boolean().default(true),
  comVendas: z.boolean().default(true),
  comViolacao: z.boolean().default(false),
});

export type DemoConfig = z.infer<typeof DemoConfigSchema>;

/** Schema para configuração de som de venda */
export const SomVendaConfigSchema = z.object({
  enabled: z.boolean().default(true),
  volume: z.number().min(0).max(1).default(0.8),
});

export type SomVendaConfig = z.infer<typeof SomVendaConfigSchema>;

/** Schema para configuração de AI context */
export const AIContextSchema = z.object({
  brandName: z.string().optional(),
  niche: z.string().optional(),
  tone: z.string().default("empolgado e amigável"),
  targetAudience: z.string().optional(),
  rules: z
    .string()
    .default(
      "Nunca prometa resultados irreais. Não fale de política ou religião. Nunca invente preços ou promoções que não estejam cadastradas.",
    ),
  extraContext: z.string().optional(),
});

export type AIContext = z.infer<typeof AIContextSchema>;

export const PitchBankConfigSchema = z.object({
  enabled: z.boolean().default(true),
  variants: z.number().min(10).max(15).default(12),
  ttlMinutes: z.number().min(30).max(180).default(60),
  minIntervalSec: z.number().min(20).max(600).default(45),
  maxIntervalSec: z.number().min(20).max(900).default(75),
  cacheReplies: z.boolean().default(true),
});

// ============================================================================
// Schema principal da configuração
// ============================================================================

/** Schema completo para a configuração da extensão */
export const ConfigSchema = z.object({
  // Configurações principais
  syncToken: z.string().optional(),
  respostasIA: z.boolean().default(true),
  responderNoChat: z.boolean().default(false),
  pitchBank: PitchBankConfigSchema.default({}),
  revisarAntesDeEnviar: z.boolean().default(false),
  protecaoGeral: z.boolean().default(false),
  violacao: z.boolean().default(true),
  autoMod: z.boolean().default(true),
  notificacoesVenda: z.boolean().default(true),

  // Configurações específicas
  voz: VoiceConfigSchema.default({}),
  autoFixar: AutoFixarConfigSchema.default({}),
  encerrarTempo: EncerrarTempoConfigSchema.default({}),
  agendar: AgendarConfigSchema.default({}),
  filtros: FiltrosConfigSchema.default({}),
  vozContextos: VozContextosConfigSchema.default({}),
  demo: DemoConfigSchema.default({}),
  somVenda: SomVendaConfigSchema.default({}),
  aiContext: AIContextSchema.default({}),

  // Dados dinâmicos
  produtos: z.array(ProductSchema).default([]),
  roteirosPorProduto: z.record(z.string()).default({}),
  ultimoRoteiro: z.string().optional(),

  // Metadados
  version: z.string().optional(),
  lastUpdated: z.number().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

// ============================================================================
// Funções utilitárias
// ============================================================================

/** Configuração padrão */
export const DEFAULT_CONFIG: Config = {
  syncToken: "",
  respostasIA: true,
  responderNoChat: false,
  pitchBank: {
    enabled: true,
    variants: 12,
    ttlMinutes: 60,
    minIntervalSec: 45,
    maxIntervalSec: 75,
    cacheReplies: true,
  },
  revisarAntesDeEnviar: false,
  protecaoGeral: false,
  violacao: true,
  autoMod: true,
  notificacoesVenda: true,
  voz: {
    id: "nova",
    speed: 1.0,
    gain: 1.0,
    monitor: { enabled: false, volume: 0.6 },
    pushToTalk: { enabled: false, key: "Space" },
  },
  autoFixar: {
    enabled: false,
    query: "",
    minSec: 20,
    maxSec: 60,
    ids: [],
    names: [],
  },
  encerrarTempo: {
    enabled: false,
    minutes: 120,
  },
  agendar: {
    enabled: false,
    at: "",
  },
  filtros: {
    blacklist: [],
    whitelist: [],
  },
  vozContextos: {},
  demo: {
    enabled: false,
    velocidade: 1,
    comChat: true,
    comVendas: true,
    comViolacao: false,
  },
  somVenda: {
    enabled: true,
    volume: 0.8,
  },
  aiContext: {
    brandName: "",
    niche: "",
    tone: "empolgado e amigável",
    targetAudience: "",
    rules:
      "Nunca prometa resultados irreais. Não fale de política ou religião. Nunca invente preços ou promoções que não estejam cadastradas.",
    extraContext: "",
  },
  produtos: [],
  roteirosPorProduto: {},
  ultimoRoteiro: "",
  version: "0.16.5",
  lastUpdated: Date.now(),
};

/** Valida e parseia uma configuração */
export function parseConfig(data: unknown): Config {
  return ConfigSchema.parse(data);
}

/** Valida e parseia um produto */
export function parseProduct(data: unknown): Product {
  return ProductSchema.parse(data);
}

/** Valida e parseia uma mensagem */
export function parseMessage(data: unknown): Message {
  return MessageSchema.parse(data);
}

// ============================================================================
// Tipos para eventos
// ============================================================================

/** Tipos de eventos da extensão */
export type PitchAIEventType =
  | "products:update"
  | "messages:update"
  | "config:update"
  | "session:start"
  | "session:end"
  | "error"
  | "status:update"
  | "mapping:update";

/** Dados do evento */
export interface PitchAIEvent<T = unknown> {
  type: PitchAIEventType;
  data: T;
  timestamp: number;
}

// ============================================================================
// Tipos para o mapeamento de setores
// ============================================================================

/** Setores do TikTok Shop */
export type RegionId = "products" | "studio" | "chat" | "activity" | "analytics" | "topbar";

/** Status de um setor */
export interface RegionStatus {
  label: string;
  found: boolean;
  via: "manual" | "cache" | "âncora" | "hint-xpath" | null;
  score: number;
  at: number;
  anchors?: number;
}

/** Status de todos os setores */
export interface RegionsStatus {
  [key: string]: RegionStatus;
}

// ============================================================================
// Tipos para Regiões (do módulo regions.ts)
// ============================================================================

/** IDs das regiões */
export type RegionID = RegionId;

/** Configuração de geometria de uma região */
export interface RegionGeometry {
  x: [number, number];
  y: [number, number];
}

/** Configuração de uma região */
export interface RegionConfig {
  label: string;
  anchors: RegExp[];
  minAnchors: number;
  content: (el: Element) => boolean;
  geometry: RegionGeometry | undefined;
  hintXPath: string | null;
}

/** Estado interno de uma região */
export interface RegionState {
  label: string;
  found: boolean;
  via: string | null;
  score: number;
  at: number;
}

/** Métricas do setor Análise */
export interface RegionAnalytics {
  gmv?: string;
  itensVendidos?: string;
  espectadores?: string;
  duracaoMedia?: string;
  cliquesProduto?: string;
  percentVisitantes?: string;
}

// ============================================================================
// Tipos para DomMap (do módulo dom-map.ts)
// ============================================================================

/** IDs dos alvos de mapeamento */
export type TargetID = "chat" | "products" | "sales" | "violation" | "endLive";

/** Configuração de um alvo */
export interface TargetConfig {
  pool: string;
  min: number;
  region?: TargetID | TargetID[];
  sample?: boolean;
  loose?: boolean;
}

/** Estado de um alvo */
export interface TargetState {
  found: boolean;
  via: string | null;
  score: number;
  at: number;
  evidence: string;
  region: string | null;
  regionFound: boolean;
  healthy: boolean;
  hasManual: boolean;
}

/** Status de todos os alvos */
export type DomMapStatus = {
  [key in TargetID]: TargetState;
};

/** Saúde de um alvo */
export interface TargetHealth {
  ok: boolean;
  score: number;
  reason: string;
}

/** Âncora textual */
export interface TextAnchor {
  t: string;
  depth: number;
  tag: string;
}

/** Assinatura estrutural de um elemento */
export interface ElementSignature {
  selector: string;
  path: string;
  tag: string;
  anchors: TextAnchor[];
}

// ============================================================================
// Tipos para o storage
// ============================================================================

/** Chaves do storage */
export const STORAGE_KEYS = {
  CONFIG: "pitchai.config.v1",
  DEMO_CMD: "pitchai.demo.cmd",
  MAP_STATUS: "pitchai.dommap.status",
  DM_MANUAL: "pitchai_dommap_manual_v1",
  RG_MANUAL: "pitchai_regions_manual_v1",
  OFFLINE_CACHE: "pitchai.offline.cache",
  SALES_STATE: "pitchai.sales.state",
} as const;

// ============================================================================
// Re-exports de utilitários (para compat com importadores de "../types")
// ============================================================================

export {
  cleanName,
  normKey,
  isBadProductName,
  inferNameFromProductText,
  isHandleName,
  productKey,
  namesMatch,
  parsePriceCents,
  currencyFromPrice,
  isUsableImageUrl,
  pickBestSrcsetUrl,
  PRICE_RX,
  CTA_RX,
  BADGE_RX,
  JUNK_NAME_RX,
  MAX_IMAGE_URL_LEN,
  MAX_PRODUCT_NAME_LEN,
} from "../utils/string";

export type { PrecoCentavos } from "../utils/string";

export { encryptConfigObj, decryptConfigObj, signRequest } from "../utils/crypto";

export {
  getApiBase,
  safeFetch,
  FetchError,
  verifyToken,
  loadConfigFromBackend,
  pushConfigToBackend as pushConfigToBackendUtil,
  startSession,
  endSession,
  sendSessionEvent,
} from "../utils/network";

export type { SafeFetchOptions } from "../utils/network";
