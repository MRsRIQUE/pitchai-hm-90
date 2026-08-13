/**
 * Tipos para o módulo de mapeamento do DOM (dom-map.ts)
 */

// ============================================================================
// IDs dos Alvos
// ============================================================================

/** IDs dos alvos de mapeamento */
export type TargetID = "chat" | "products" | "sales" | "violation" | "endLive";

// ============================================================================
// Configuração dos Alvos
// ============================================================================

/** Configuração de um alvo */
export interface TargetConfig {
  pool: string;
  min: number;
  region?: TargetID | TargetID[];
  sample?: boolean;
  loose?: boolean;
}

// ============================================================================
// Estado dos Alvos
// ============================================================================

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

// ============================================================================
// Saúde dos Alvos
// ============================================================================

/** Saúde de um alvo */
export interface TargetHealth {
  ok: boolean;
  score: number;
  reason: string;
}

// ============================================================================
// Assinatura de Elemento
// ============================================================================

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
