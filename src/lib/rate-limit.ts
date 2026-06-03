const stores = new Map<string, Map<string, { count: number; resetAt: number }>>();

export function checkRateLimit(
  namespace: string,
  key: string,
  maxRequests: number,
  windowMs: number,
): { ok: boolean; retryAfterMs: number } {
  let store = stores.get(namespace);
  if (!store) {
    store = new Map();
    stores.set(namespace, store);
  }
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterMs: 0 };
  }
  entry.count++;
  if (entry.count > maxRequests) {
    return { ok: false, retryAfterMs: entry.resetAt - now };
  }
  return { ok: true, retryAfterMs: 0 };
}
