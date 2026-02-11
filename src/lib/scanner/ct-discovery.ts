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

    const entries: Array<{ name_value: string }> = await response.json();
    const subdomains = new Set<string>();

    for (const entry of entries) {
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
