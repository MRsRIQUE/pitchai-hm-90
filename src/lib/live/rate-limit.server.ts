// Throttle simples por token para os endpoints de sync (config/mapping/session),
// que não passam pelo contador diário de IA. Janela deslizante em memória:
// não é global entre workers, mas corta abuso/loop de um cliente só.
type Bucket = { hits: number[] };
const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000;

export function throttle(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    if (buckets.size >= MAX_KEYS) {
      // LRU eviction: remove the oldest 25% of buckets instead of clearing all.
      // Clearing all would let a burst of new keys bypass throttling entirely.
      const entries = [...buckets.entries()].sort((a, b) => {
        const aLast = a[1].hits.length ? a[1].hits[a[1].hits.length - 1] : 0;
        const bLast = b[1].hits.length ? b[1].hits[b[1].hits.length - 1] : 0;
        return aLast - bLast;
      });
      const evictCount = Math.ceil(MAX_KEYS * 0.25);
      for (let i = 0; i < evictCount && i < entries.length; i++) {
        buckets.delete(entries[i][0]);
      }
    }
    b = { hits: [] };
    buckets.set(key, b);
  }
  b.hits = b.hits.filter((t) => now - t < windowMs);
  if (b.hits.length >= limit) {
    const retryAfter = Math.ceil((windowMs - (now - b.hits[0])) / 1000);
    return { ok: false, retryAfter: Math.max(1, retryAfter) };
  }
  b.hits.push(now);
  return { ok: true };
}
