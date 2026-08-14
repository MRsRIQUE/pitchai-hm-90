/**
 * Funções de criptografia para armazenamento seguro de dados
 * Usa AES-GCM 256-bit para criptografar dados sensíveis no chrome.storage
 *
 * O salt é gerado aleatoriamente por instalação e persistido em chrome.storage.local
 * (chave `_crypto_salt_v2`). Antes era hardcoded, o que tornava a chave AES-GCM
 * idêntica em todas as instalações (rainbow table trivial).
 *
 * PBKDF2 iteracões = 600_000 (recomendação OWASP 2023).
 */

const SALT_STORAGE_KEY = "_crypto_salt_v2";
const PBKDF2_ITERATIONS = 600_000;

async function getOrCreateSalt(): Promise<Uint8Array> {
  // Verifica se já existe um salt persistido nesta instalação.
  const stored = await new Promise<unknown>((resolve) => {
    try {
      chrome.storage.local.get([SALT_STORAGE_KEY], (res) => resolve(res?.[SALT_STORAGE_KEY]));
    } catch {
      resolve(null);
    }
  });
  if (stored && typeof stored === "string") {
    // Converte hex string de volta para bytes.
    const bytes = new Uint8Array(stored.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? []);
    if (bytes.length === 16) return bytes;
  }
  // Gera um novo salt aleatório de 16 bytes (128 bits).
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(salt)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  try {
    chrome.storage.local.set({ [SALT_STORAGE_KEY]: hex });
  } catch {
    /* storage indisponível —Derivation usará o salt efêmero nesta sessão. */
  }
  return salt;
}

/**
 * Obtém a chave de criptografia baseada no origin da página + salt persistido.
 */
async function getStorageKey(seed?: string): Promise<CryptoKey | null> {
  try {
    const enc = new TextEncoder();
    const extensionId = chrome.runtime?.id || "pitchai";
    const keySeed = seed || `pitchai-extension:${extensionId}`;
    const salt = await getOrCreateSalt();
    // Cópia backed por ArrayBuffer (não SharedArrayBuffer), exigida pelo Web Crypto.
    const saltBytes = Uint8Array.from(salt);

    // Importa a key material (origin + salt de instalação como material).
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(keySeed),
      { name: "PBKDF2" },
      false,
      ["deriveKey"],
    );

    // Deriva a chave AES-GCM
    return await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: saltBytes,
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } catch (error) {
    console.error("[crypto] Failed to derive key:", error);
    return null;
  }
}

/**
 * Criptografa um objeto usando AES-GCM
 */
export async function encryptConfigObj(obj: unknown): Promise<unknown> {
  try {
    const raw = JSON.stringify(obj);
    const cryptoKey = await getStorageKey();

    if (!cryptoKey) {
      return obj; // Retorna o objeto original se não conseguir criptografar
    }

    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const buf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, enc.encode(raw));

    return {
      __enc: Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
      __iv: Array.from(iv)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
      __v: 2, // Versão do formato
    };
  } catch (error) {
    console.error("[crypto] Failed to encrypt:", error);
    return obj;
  }
}

/**
 * Descriptografa um objeto criptografado
 */
export async function decryptConfigObj(data: unknown): Promise<unknown> {
  if (!data || typeof data !== "object") {
    return data;
  }

  const obj = data as Record<string, unknown>;

  if (!obj.__enc || !obj.__iv) {
    return data;
  }

  const extensionId = chrome.runtime?.id || "pitchai";
  const seeds = [
    `pitchai-extension:${extensionId}`,
    window.location?.origin,
    `chrome-extension://${extensionId}`,
    "https://shop.tiktok.com",
  ].filter((seed, index, all): seed is string => Boolean(seed) && all.indexOf(seed) === index);

  for (let index = 0; index < seeds.length; index += 1) {
    try {
      const cryptoKey = await getStorageKey(seeds[index]);
      if (!cryptoKey) continue;
      const iv = new Uint8Array(
        (obj.__iv as string).match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) || [],
      );
      const encBuf = new Uint8Array(
        (obj.__enc as string).match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) || [],
      );
      const decBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, encBuf);
      const decoded = JSON.parse(new TextDecoder().decode(decBuf));
      if (index > 0) {
        const migrated = await encryptConfigObj(decoded);
        chrome.storage.local.set({ "pitchai.config.v1": migrated });
      }
      return decoded;
    } catch {
      // Tenta o proximo seed legado.
    }
  }

  console.error("[crypto] Failed to decrypt config with current or legacy keys");
  return {};
}

/**
 * Assina uma requisição com HMAC-SHA256
 */
export async function signRequest(
  token: string | undefined,
  endpoint: string,
): Promise<Record<string, string>> {
  if (!token) {
    return {};
  }

  const ts = Date.now().toString();
  const nonce = Math.random().toString(36).substring(2, 10);

  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(token),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}:${nonce}:${endpoint}`));

    const sigHex = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return {
      "X-PitchAI-Signature": sigHex,
      "X-PitchAI-Timestamp": ts,
      "X-PitchAI-Nonce": nonce,
      "X-PitchAI-Token": token,
      Authorization: `Bearer ${token}`,
    };
  } catch (error) {
    console.error("[crypto] Failed to sign request:", error);
    return { Authorization: `Bearer ${token}` };
  }
}
