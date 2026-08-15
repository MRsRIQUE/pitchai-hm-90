import { GoogleGenAI } from "@google/genai";

/**
 * Núcleo compartilhado de síntese de voz (TTS).
 *
 * Consumido por /api/tts/preview (painel web) e /api/public/tts/speak (extensão).
 * As duas rotas eram cópias uma da outra e divergiram; toda a lógica de provedor,
 * voz, formato de áudio e mensagem de erro mora aqui.
 *
 * Fonte primária: Gemini TTS nativo (@google/genai + GEMINI_API_KEY), a mesma
 * credencial já usada em /api/public/gemini/generate.
 *
 * Fallback: gateway da Lovable (compatível com a API de speech da OpenAI), usado
 * SOMENTE se LOVABLE_API_KEY existir e tiver o formato que o gateway aceita.
 * O gateway rejeita qualquer chave sem o prefixo `sk_` com 401 — era por isso que
 * o antigo fallback `process.env.LOVABLE_API_KEY || process.env.GEMINI_API_KEY`
 * nunca funcionava: uma chave do Google (`AIza...`) jamais autentica lá.
 */

export const TTS_MAX_CHARS = 500;
export const TTS_MIN_SPEED = 0.7;
export const TTS_MAX_SPEED = 1.2;

const LOVABLE_SPEECH_URL = "https://ai.gateway.lovable.dev/v1/audio/speech";
const LOVABLE_KEY_PREFIX = "sk_";

/**
 * Modelos TTS do Gemini, tentados em ordem. O primeiro que responder com áudio
 * vence; um modelo desconhecido/removido (404) apenas passa a vez ao próximo.
 * `GEMINI_TTS_MODEL` força um modelo específico e pula a cascata.
 */
const GEMINI_TTS_MODELS = [
  "gemini-3.1-flash-tts-preview",
  "gemini-2.5-flash-preview-tts",
  "gemini-2.5-pro-preview-tts",
];

/** Formato nativo do Gemini TTS: PCM 16 bits, mono, 24 kHz. */
const PCM_DEFAULT_SAMPLE_RATE = 24_000;
const PCM_CHANNELS = 1;
const PCM_BITS_PER_SAMPLE = 16;

// ---------------------------------------------------------------------------
// Vozes
// ---------------------------------------------------------------------------

/**
 * `src/lib/live/voices.ts` (front) usa os ids da OpenAI e é a fonte da verdade do
 * que fica salvo na config do usuário. O Gemini usa outro conjunto de vozes, então
 * traduzimos aqui — o id salvo continua valendo sem migração de dados.
 *
 * A escolha segue a descrição de cada voz em voices.ts.
 */
const OPENAI_TO_GEMINI_VOICE: Record<string, string> = {
  alloy: "Zephyr", // Neutra, versátil
  nova: "Leda", // Feminina, jovem, enérgica
  shimmer: "Sulafat", // Feminina, calorosa
  coral: "Aoede", // Feminina, expressiva
  echo: "Charon", // Masculina, séria
  onyx: "Algenib", // Masculina, grave
  fable: "Rasalgethi", // Narrador
  sage: "Umbriel", // Neutra, tranquila
};

const GEMINI_TO_OPENAI_VOICE: Record<string, string> = Object.fromEntries(
  Object.entries(OPENAI_TO_GEMINI_VOICE).map(([openai, gemini]) => [gemini.toLowerCase(), openai]),
);

/** Vozes prebuilt aceitas pelo Gemini TTS. */
const GEMINI_VOICES = [
  "Zephyr",
  "Puck",
  "Charon",
  "Kore",
  "Fenrir",
  "Leda",
  "Orus",
  "Aoede",
  "Callirrhoe",
  "Autonoe",
  "Enceladus",
  "Iapetus",
  "Umbriel",
  "Algieba",
  "Despina",
  "Erinome",
  "Algenib",
  "Rasalgethi",
  "Laomedeia",
  "Achernar",
  "Alnilam",
  "Schedar",
  "Gacrux",
  "Pulcherrima",
  "Achird",
  "Zubenelgenubi",
  "Vindemiatrix",
  "Sadachbia",
  "Sadaltager",
  "Sulafat",
];

const GEMINI_VOICE_BY_LOWER = new Map(GEMINI_VOICES.map((name) => [name.toLowerCase(), name]));

/** Equivalente a `nova`, o DEFAULT_VOICE do front. */
const DEFAULT_GEMINI_VOICE = "Leda";
const DEFAULT_OPENAI_VOICE = "nova";

/** Aceita tanto o id da OpenAI salvo na config quanto um nome nativo do Gemini. */
export function resolveGeminiVoice(voice: string | undefined): string {
  const raw = (voice ?? "").trim().toLowerCase();
  if (!raw) return DEFAULT_GEMINI_VOICE;
  return OPENAI_TO_GEMINI_VOICE[raw] ?? GEMINI_VOICE_BY_LOWER.get(raw) ?? DEFAULT_GEMINI_VOICE;
}

/** Caminho inverso, para o fallback da Lovable (que fala OpenAI). */
export function resolveOpenAiVoice(voice: string | undefined): string {
  const raw = (voice ?? "").trim().toLowerCase();
  if (!raw) return DEFAULT_OPENAI_VOICE;
  if (raw in OPENAI_TO_GEMINI_VOICE) return raw;
  return GEMINI_TO_OPENAI_VOICE[raw] ?? DEFAULT_OPENAI_VOICE;
}

// ---------------------------------------------------------------------------
// Tipos de retorno
// ---------------------------------------------------------------------------

export type TtsErrorCode =
  | "missing_api_key"
  | "empty_text"
  | "quota_exceeded"
  | "upstream_unavailable"
  | "upstream_rejected"
  | "no_audio"
  | "tts_failed";

export type TtsSuccess = {
  ok: true;
  audio: Uint8Array;
  contentType: string;
  provider: "gemini" | "lovable";
  model: string;
  voice: string;
};

export type TtsFailure = {
  ok: false;
  status: number;
  code: TtsErrorCode;
  /** Mensagem em português, pronta para ser exibida ao usuário. */
  message: string;
  /** Detalhe técnico para log — nunca contém credenciais. */
  detail?: string;
};

export type TtsResult = TtsSuccess | TtsFailure;

export interface TtsInput {
  text: string;
  voice?: string;
  speed?: number;
}

// ---------------------------------------------------------------------------
// PCM -> WAV
// ---------------------------------------------------------------------------

/**
 * O Gemini devolve PCM cru (`audio/L16;codec=pcm;rate=24000`), que nenhum
 * `<audio>` toca sozinho. Empacotamos em WAV — 44 bytes de cabeçalho RIFF, sem
 * recodificar — e o Content-Type passa a ser `audio/wav`.
 */
function pcmToWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const blockAlign = (PCM_CHANNELS * PCM_BITS_PER_SAMPLE) / 8;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // tamanho do bloco fmt
  header.writeUInt16LE(1, 20); // 1 = PCM sem compressão
  header.writeUInt16LE(PCM_CHANNELS, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(PCM_BITS_PER_SAMPLE, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

/** `audio/L16;codec=pcm;rate=24000` -> 24000 */
function sampleRateFromMime(mimeType: string | undefined): number {
  const match = /rate=(\d+)/i.exec(mimeType ?? "");
  const rate = match ? Number(match[1]) : NaN;
  return Number.isFinite(rate) && rate > 0 ? rate : PCM_DEFAULT_SAMPLE_RATE;
}

function isAlreadyContainerized(bytes: Uint8Array, mimeType: string | undefined): boolean {
  const mime = (mimeType ?? "").toLowerCase();
  if (mime.includes("wav") || mime.includes("mpeg") || mime.includes("mp3")) return true;
  // "RIFF" — alguns modelos já devolvem WAV pronto, mesmo anunciando L16.
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46
  );
}

// ---------------------------------------------------------------------------
// Prompt de estilo
// ---------------------------------------------------------------------------

/**
 * O Gemini TTS não tem parâmetro numérico de velocidade — o ritmo é pedido em
 * linguagem natural, como prefixo. O modelo executa a instrução sem lê-la em voz
 * alta. Assim o `speed` que o front já envia continua tendo efeito.
 */
function buildStyledPrompt(text: string, speed: number): string {
  const pace =
    speed <= 0.85
      ? "em ritmo pausado e calmo"
      : speed >= 1.15
        ? "em ritmo acelerado e enérgico"
        : "em ritmo natural";
  return `Fale em português do Brasil, ${pace}, com entonação de apresentador de live vendendo um produto. Fale apenas o texto a seguir, sem comentar nem repetir esta instrução:\n\n${text}`;
}

// ---------------------------------------------------------------------------
// Classificação de erro
// ---------------------------------------------------------------------------

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function statusFromError(error: unknown): number | null {
  if (error && typeof error === "object") {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") return status;
    const code = (error as { code?: unknown }).code;
    if (typeof code === "number") return code;
  }
  return null;
}

function isQuotaError(error: unknown): boolean {
  if (statusFromError(error) === 429) return true;
  const text = errorText(error).toUpperCase();
  return (
    text.includes("RESOURCE_EXHAUSTED") || text.includes("QUOTA") || text.includes("RATE LIMIT")
  );
}

/** Modelo inexistente/sem permissão: apenas passa a vez ao próximo candidato. */
function isModelUnavailableError(error: unknown): boolean {
  const status = statusFromError(error);
  if (status === 404 || status === 400) return true;
  const text = errorText(error).toUpperCase();
  return (
    text.includes("NOT_FOUND") ||
    text.includes("IS NOT FOUND") ||
    text.includes("NOT SUPPORTED") ||
    text.includes("INVALID_ARGUMENT")
  );
}

function isAuthError(error: unknown): boolean {
  const status = statusFromError(error);
  if (status === 401 || status === 403) return true;
  const text = errorText(error).toUpperCase();
  return (
    text.includes("API KEY") ||
    text.includes("PERMISSION_DENIED") ||
    text.includes("UNAUTHENTICATED")
  );
}

// ---------------------------------------------------------------------------
// Provedor: Gemini
// ---------------------------------------------------------------------------

async function synthesizeWithGemini(
  apiKey: string,
  input: { text: string; voice: string; speed: number },
): Promise<TtsResult> {
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });

  const configured = process.env.GEMINI_TTS_MODEL?.trim();
  const models = configured ? [configured] : GEMINI_TTS_MODELS;
  const prompt = buildStyledPrompt(input.text, input.speed);

  let lastFailure: TtsFailure | null = null;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: input.voice } },
          },
        },
      });

      const part = response.candidates?.[0]?.content?.parts?.find((item) => item.inlineData?.data);
      const base64 = part?.inlineData?.data;
      if (!base64) {
        lastFailure = {
          ok: false,
          status: 502,
          code: "no_audio",
          message: "O serviço de voz respondeu sem áudio. Tente novamente em alguns segundos.",
          detail: `model=${model} sem inlineData`,
        };
        continue;
      }

      const raw = new Uint8Array(Buffer.from(base64, "base64"));
      const mimeType = part?.inlineData?.mimeType;

      if (isAlreadyContainerized(raw, mimeType)) {
        const isMp3 = (mimeType ?? "").toLowerCase().includes("mpeg");
        return {
          ok: true,
          audio: raw,
          contentType: isMp3 ? "audio/mpeg" : "audio/wav",
          provider: "gemini",
          model,
          voice: input.voice,
        };
      }

      return {
        ok: true,
        audio: pcmToWav(raw, sampleRateFromMime(mimeType)),
        contentType: "audio/wav",
        provider: "gemini",
        model,
        voice: input.voice,
      };
    } catch (error) {
      const detail = `model=${model}: ${errorText(error)}`;

      if (isQuotaError(error)) {
        return {
          ok: false,
          status: 429,
          code: "quota_exceeded",
          message:
            "A cota da API de voz do Google foi excedida. Aguarde alguns minutos ou revise o limite do projeto no Google AI Studio.",
          detail,
        };
      }

      if (isAuthError(error)) {
        return {
          ok: false,
          status: 502,
          code: "upstream_rejected",
          message:
            "A chave GEMINI_API_KEY foi recusada pelo Google. Confira se ela é válida e tem acesso à API de geração de voz.",
          detail,
        };
      }

      // Modelo indisponível: tenta o próximo da cascata.
      lastFailure = {
        ok: false,
        status: isModelUnavailableError(error) ? 502 : 503,
        code: isModelUnavailableError(error) ? "upstream_rejected" : "upstream_unavailable",
        message: isModelUnavailableError(error)
          ? "Nenhum modelo de voz do Gemini está disponível para esta chave. Defina GEMINI_TTS_MODEL com um modelo válido."
          : "O serviço de voz do Google está indisponível no momento. Tente novamente em instantes.",
        detail,
      };
    }
  }

  return (
    lastFailure ?? {
      ok: false,
      status: 502,
      code: "tts_failed",
      message: "Não foi possível gerar o áudio com o Gemini.",
    }
  );
}

// ---------------------------------------------------------------------------
// Provedor: gateway da Lovable (fallback)
// ---------------------------------------------------------------------------

async function synthesizeWithLovable(
  apiKey: string,
  input: { text: string; voice: string; speed: number },
): Promise<TtsResult> {
  let upstream: Response;
  try {
    upstream = await fetch(LOVABLE_SPEECH_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini-tts",
        input: input.text,
        voice: input.voice,
        speed: input.speed,
        response_format: "mp3",
      }),
    });
  } catch (error) {
    return {
      ok: false,
      status: 503,
      code: "upstream_unavailable",
      message: "Não foi possível falar com o serviço de voz de reserva.",
      detail: errorText(error),
    };
  }

  if (!upstream.ok) {
    const body = await upstream.text().catch(() => "");
    if (upstream.status === 429) {
      return {
        ok: false,
        status: 429,
        code: "quota_exceeded",
        message: "A cota do serviço de voz de reserva foi excedida.",
        detail: body.slice(0, 500),
      };
    }
    return {
      ok: false,
      status: 502,
      code: "upstream_rejected",
      message:
        "O serviço de voz de reserva (Lovable) recusou a requisição. A LOVABLE_API_KEY provavelmente expirou.",
      detail: `HTTP ${upstream.status}: ${body.slice(0, 500)}`,
    };
  }

  const audio = new Uint8Array(await upstream.arrayBuffer());
  if (!audio.length) {
    return {
      ok: false,
      status: 502,
      code: "no_audio",
      message: "O serviço de voz de reserva respondeu sem áudio.",
    };
  }

  return {
    ok: true,
    audio,
    contentType: "audio/mpeg",
    provider: "lovable",
    model: "openai/gpt-4o-mini-tts",
    voice: input.voice,
  };
}

// ---------------------------------------------------------------------------
// Entrada pública
// ---------------------------------------------------------------------------

export async function synthesizeSpeech(input: TtsInput): Promise<TtsResult> {
  const text = (input.text ?? "").toString().trim().slice(0, TTS_MAX_CHARS);
  if (!text) {
    return {
      ok: false,
      status: 400,
      code: "empty_text",
      message: "Nenhum texto foi enviado para a geração de voz.",
    };
  }

  const speed = Math.max(TTS_MIN_SPEED, Math.min(TTS_MAX_SPEED, Number(input.speed) || 1.0));

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const lovableKey = process.env.LOVABLE_API_KEY?.trim();
  // O gateway da Lovable rejeita qualquer chave fora do formato `sk_...` com 401.
  const lovableUsable = !!lovableKey && lovableKey.startsWith(LOVABLE_KEY_PREFIX);

  if (!geminiKey && !lovableUsable) {
    return {
      ok: false,
      status: 500,
      code: "missing_api_key",
      message: lovableKey
        ? "O servidor não tem GEMINI_API_KEY configurada, e a LOVABLE_API_KEY presente está em formato inválido (precisa começar com 'sk_')."
        : "O servidor não tem GEMINI_API_KEY configurada. Sem ela a voz da IA não pode ser gerada.",
    };
  }

  if (geminiKey) {
    const result = await synthesizeWithGemini(geminiKey, {
      text,
      voice: resolveGeminiVoice(input.voice),
      speed,
    });
    if (result.ok) return result;

    if (!lovableUsable) return result;

    console.warn(
      "[tts] Gemini falhou, tentando o gateway da Lovable:",
      result.detail ?? result.message,
    );
    const fallback = await synthesizeWithLovable(lovableKey!, {
      text,
      voice: resolveOpenAiVoice(input.voice),
      speed,
    });
    // Se o fallback também falhar, o erro do provedor principal é mais útil.
    return fallback.ok ? fallback : result;
  }

  return synthesizeWithLovable(lovableKey!, {
    text,
    voice: resolveOpenAiVoice(input.voice),
    speed,
  });
}

// ---------------------------------------------------------------------------
// Respostas HTTP
// ---------------------------------------------------------------------------

/**
 * Erro em JSON com motivo legível. Antes as rotas devolviam o corpo cru do
 * upstream (ou "TTS failed"), e o usuário só via "Falha ao gerar áudio".
 *
 * O header `x-pitchai-error` repete a mensagem para clientes que não parseiam o
 * corpo — a extensão hoje descarta a resposta quando `!r.ok`.
 */
export function ttsErrorResponse(
  failure: TtsFailure,
  extraHeaders: Record<string, string> = {},
): Response {
  if (failure.detail) {
    console.error(`[tts] ${failure.code}: ${failure.detail}`);
  }
  return new Response(JSON.stringify({ error: failure.code, message: failure.message }), {
    status: failure.status,
    headers: {
      ...extraHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "x-pitchai-error": failure.code,
      "x-pitchai-error-message": encodeURIComponent(failure.message),
    },
  });
}

export function ttsAudioResponse(
  success: TtsSuccess,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(success.audio as unknown as BodyInit, {
    headers: {
      ...extraHeaders,
      "Content-Type": success.contentType,
      "Cache-Control": "no-store",
      "x-pitchai-tts-provider": success.provider,
      "x-pitchai-tts-model": success.model,
      "x-pitchai-tts-voice": success.voice,
    },
  });
}
