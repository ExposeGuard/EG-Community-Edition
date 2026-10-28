interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

const MAX_REQUESTS = 5;
// Backstop across all clients: when the app is exposed without a reverse
// proxy, X-Forwarded-For is client-controlled and per-IP limits can be evaded.
const GLOBAL_MAX_REQUESTS = 30;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

const globalEntry: RateLimitEntry = { count: 0, resetAt: 0 };

const parsedHops = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "1", 10);
const TRUSTED_PROXY_HOPS = Number.isNaN(parsedHops) ? 1 : parsedHops;

/**
 * Derives the client IP from X-Forwarded-For. Proxies append to the header,
 * so the trustworthy entry is counted from the right: with N trusted proxies
 * it is the Nth entry from the end. Entries to its left are client-supplied.
 * With no proxy, Next.js sets the header to the socket address itself.
 */
export function getClientIp(forwardedFor: string | null, trustedHops = TRUSTED_PROXY_HOPS): string {
  const entries = (forwardedFor ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const index = Math.max(entries.length - Math.max(trustedHops, 1), 0);
  return entries[index]?.slice(0, 64) || "unknown";
}

export function checkRateLimit(clientIp: string): {
  allowed: boolean;
  scope?: "client" | "global";
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();

  if (now >= globalEntry.resetAt) {
    globalEntry.count = 0;
    globalEntry.resetAt = now + WINDOW_MS;
  }

  // Checked first so rejected requests never add entries to the store
  if (globalEntry.count >= GLOBAL_MAX_REQUESTS) {
    return { allowed: false, scope: "global", remaining: 0, resetAt: globalEntry.resetAt };
  }

  let entry = store.get(clientIp);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    store.set(clientIp, entry);
  }

  if (entry.count >= MAX_REQUESTS) {
    return { allowed: false, scope: "client", remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  globalEntry.count++;
  return { allowed: true, remaining: MAX_REQUESTS - entry.count, resetAt: entry.resetAt };
}

// Periodic cleanup of expired entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now >= entry.resetAt) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();
