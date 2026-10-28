// crt.sh returns every certificate ever logged for the domain; very large
// domains can produce hundreds of MB of JSON, so the body is capped.
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

export async function discoverSubdomains(domain: string): Promise<string[]> {
  const url = `https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "ExposeGuard-Community/1.0" },
    });

    if (!response.ok) {
      return [];
    }

    const body = await readBodyWithLimit(response, MAX_RESPONSE_BYTES);
    if (body === null) {
      return [];
    }

    const entries: Array<{ name_value?: unknown }> = JSON.parse(body);
    const subdomains = new Set<string>();

    for (const entry of entries) {
      if (typeof entry?.name_value !== "string") continue;

      const names = entry.name_value.split("\n");
      for (const name of names) {
        const cleaned = name.trim().toLowerCase();

        if (!cleaned) continue;
        if (cleaned.startsWith("*.")) continue;
        if (!cleaned.endsWith(`.${domain}`) && cleaned !== domain) continue;
        if (!/^[a-z0-9.-]+$/.test(cleaned)) continue;

        subdomains.add(cleaned);
      }
    }

    return Array.from(subdomains);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function readBodyWithLimit(response: Response, limit: number): Promise<string | null> {
  if (!response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks).toString("utf8");
}
