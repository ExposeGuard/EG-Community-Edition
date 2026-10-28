import http from "http";
import https from "https";
import { resolveHost } from "./dns-resolver";
import { pinnedLookup } from "@/lib/utils/pinned-lookup";
import { HttpResult } from "./types";

const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;
const USER_AGENT = "ExposeGuard-Community/1.0";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

interface RawResponse {
  statusCode: number;
  location?: string;
  server?: string;
}

/**
 * Checks HTTP(S) reachability of a host. Connections are pinned to the
 * already-validated `addresses`, and every redirect hop is re-validated so a
 * public host cannot redirect the scanner to a private or reserved address.
 */
export async function checkHttp(
  hostname: string,
  protocol: "http" | "https",
  addresses: string[]
): Promise<HttpResult> {
  const url = new URL(`${protocol}://${hostname}/`);

  // Try HEAD first
  const result = await requestWithRedirects(url, addresses, "HEAD");
  if (result.reachable) return result;

  // Fallback to GET
  return requestWithRedirects(url, addresses, "GET");
}

export async function requestWithRedirects(
  startUrl: URL,
  startAddresses: string[],
  method: string
): Promise<HttpResult> {
  let url = startUrl;
  let addresses = startAddresses;
  let last: (RawResponse & { url: string }) | null = null;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let response: RawResponse;
    try {
      response = await request(url, addresses, method);
    } catch (err: unknown) {
      const message = errorMessage(err);
      // A failure on a later hop doesn't make the original host unreachable
      return last ? toResult(last, `Redirect to ${url.host} failed: ${message}`) : { reachable: false, error: message };
    }

    last = { ...response, url: url.href };

    if (!REDIRECT_STATUSES.has(response.statusCode) || !response.location) {
      return toResult(last);
    }

    let next: URL;
    try {
      next = new URL(response.location, url);
    } catch {
      return toResult(last, "Invalid redirect location");
    }

    if (next.protocol !== "http:" && next.protocol !== "https:") {
      return toResult(last, `Redirect to unsupported protocol ${next.protocol} not followed`);
    }

    if (next.hostname !== url.hostname) {
      const dns = await resolveHost(next.hostname);
      if (!dns.resolved) {
        return toResult(last, `Redirect to ${next.host} not followed (unresolved)`);
      }
      if (dns.blockedPrivate) {
        return toResult(last, `Redirect to ${next.host} blocked (private or reserved address)`);
      }
      addresses = dns.addresses;
    }

    url = next;
  }

  return toResult(last!, "Too many redirects");
}

function errorMessage(err: unknown): string {
  // Connecting to a host with several addresses fails with an AggregateError
  // whose own message is empty; report the per-address errors instead.
  if (err instanceof AggregateError && err.errors.length > 0) {
    return [...new Set(err.errors.map(errorMessage))].join("; ");
  }
  if (err instanceof Error) {
    return err.message || (err as NodeJS.ErrnoException).code || "Unknown error";
  }
  return "Unknown error";
}

function toResult(response: RawResponse & { url: string }, error?: string): HttpResult {
  return {
    reachable: true,
    statusCode: response.statusCode,
    finalUrl: response.url,
    server: response.server,
    error,
  };
}

function request(url: URL, addresses: string[], method: string): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      url,
      {
        method,
        agent: false,
        lookup: pinnedLookup(addresses),
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
      (res) => {
        resolve({
          statusCode: res.statusCode ?? 0,
          location: res.headers.location,
          server: [res.headers.server].flat().join(", ") || undefined,
        });
        // Only the status line and headers are needed; don't download the body
        res.destroy();
      }
    );
    req.on("error", reject);
    req.end();
  });
}
