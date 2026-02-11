import { HttpResult } from "./types";

const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;

export async function checkHttp(hostname: string, protocol: "http" | "https"): Promise<HttpResult> {
  const url = `${protocol}://${hostname}`;

  // Try HEAD first
  let result = await attemptRequest(url, "HEAD");
  if (result.reachable) return result;

  // Fallback to GET
  result = await attemptRequest(url, "GET");
  return result;
}

async function attemptRequest(url: string, method: string): Promise<HttpResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "ExposeGuard-Community/1.0" },
      // @ts-expect-error Node.js fetch options
      follow: MAX_REDIRECTS,
    });

    return {
      reachable: true,
      statusCode: response.status,
      finalUrl: response.url || url,
      server: response.headers.get("server") || undefined,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      reachable: false,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}
