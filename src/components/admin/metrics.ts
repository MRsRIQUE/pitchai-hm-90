/**
 * Métricas financeiras unificadas — fórmula única de custo e margem.
 * Usada por OverviewSection e CustosSection para evitar duplicação.
 */

export interface CostData {
  tokens_in_mes: number | string;
  tokens_out_mes: number | string;
  chat_per_1k_in: number | string;
  chat_per_1k_out: number | string;
  minutos_tts_mes: number | string;
  tts_per_min: number | string;
  usd_brl: number | string;
}

/**
 * Calcula o custo total em BRL a partir dos dados de uso e preços do provedor.
 *
 * Fórmula:
 *   totalUSD = (tokens_in/1000)*chat_in + (tokens_out/1000)*chat_out + minutos_tts*tts_per_min
 *   totalBRL = totalUSD * usd_brl
 */
export function calculateTotalCostBrl(data: CostData | null | undefined): number {
  if (!data) return 0;
  const tokensIn = Number(data.tokens_in_mes);
  const tokensOut = Number(data.tokens_out_mes);
  const chatIn = Number(data.chat_per_1k_in);
  const chatOut = Number(data.chat_per_1k_out);
  const ttsMinutes = Number(data.minutos_tts_mes);
  const ttsPerMin = Number(data.tts_per_min);
  const usdBrl = Number(data.usd_brl);

  const totalUsd =
    (tokensIn / 1000) * chatIn + (tokensOut / 1000) * chatOut + ttsMinutes * ttsPerMin;
  return totalUsd * usdBrl;
}

/**
 * Calcula a margem percentual vs MRR.
 *
 * Fórmula:
 *   marginPct = ((mrr - costTotal) / mrr) * 100
 *   Se mrr <= 0 → 0
 */
export function calculateMarginPct(mrr: number, costTotalBrl: number): number {
  if (mrr <= 0) return 0;
  return ((mrr - costTotalBrl) / mrr) * 100;
}

/**
 * Calcula o custo apenas de chat em USD.
 */
export function calculateChatCostUsd(data: CostData | null | undefined): number {
  if (!data) return 0;
  return (
    (Number(data.tokens_in_mes) / 1000) * Number(data.chat_per_1k_in) +
    (Number(data.tokens_out_mes) / 1000) * Number(data.chat_per_1k_out)
  );
}

/**
 * Calcula o custo apenas de TTS em USD.
 */
export function calculateTtsCostUsd(data: CostData | null | undefined): number {
  if (!data) return 0;
  return Number(data.minutos_tts_mes) * Number(data.tts_per_min);
}

/**
 * Converte USD para BRL usando a taxa de câmbio informada.
 */
export function convertUsdToBrl(usd: number, usdBrl: number | string): number {
  return usd * Number(usdBrl);
}
