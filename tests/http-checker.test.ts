import http from "http";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Simulate public hostnames whose DNS points somewhere private
vi.mock("@/lib/scanner/dns-resolver", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/scanner/dns-resolver")>();
  return {
    resolveHost: async (hostname: string) => {
      if (hostname === "rebind.example") {
        return { resolved: true, addresses: ["10.0.0.5"], blockedPrivate: true };
      }
      if (hostname === "nxdomain.example") {
        return { resolved: false, addresses: [], blockedPrivate: false };
      }
      return original.resolveHost(hostname);
    },
  };
});

const { requestWithRedirects } = await import("@/lib/scanner/http-checker");

// The scanner only ever connects to pinned addresses, so the test server is
// reached via a fake hostname pinned to 127.0.0.1.
const HOST = "scan-target.test";
const PINNED = ["127.0.0.1"];

let server: http.Server;
let port: number;
let hits: string[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    hits.push(req.url ?? "");
    const redirect = (location: string) => {
      res.writeHead(302, { Location: location });
      res.end();
    };

    switch (req.url) {
      case "/ok":
        res.writeHead(200, { Server: "test-server" });
        res.end("ok");
        break;
      case "/metadata":
        return redirect("http://169.254.169.254/latest/meta-data/");
      case "/loopback":
        return redirect(`http://127.0.0.1:${port}/ok`);
      case "/loopback-v6":
        return redirect(`http://[::1]:${port}/ok`);
      case "/rebind":
        return redirect("http://rebind.example/");
      case "/nxdomain":
        return redirect("http://nxdomain.example/");
      case "/relative":
        return redirect("/ok");
      case "/loop":
        return redirect("/loop");
      case "/file":
        return redirect("file:///etc/passwd");
      case "/stream":
        // Never-ending body: the checker must not wait for it
        res.writeHead(200);
        res.write("x".repeat(64 * 1024));
        break;
      default:
        res.writeHead(404);
        res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

const url = (path: string) => new URL(`http://${HOST}:${port}${path}`);

describe("requestWithRedirects", () => {
  it("connects to the pinned address instead of resolving the hostname", async () => {
    const result = await requestWithRedirects(url("/ok"), PINNED, "GET");
    expect(result).toMatchObject({ reachable: true, statusCode: 200, server: "test-server" });
  });

  it("follows same-host relative redirects", async () => {
    const result = await requestWithRedirects(url("/relative"), PINNED, "GET");
    expect(result.statusCode).toBe(200);
    expect(result.finalUrl).toBe(url("/ok").href);
    expect(result.error).toBeUndefined();
  });

  it.each([
    ["/metadata", "169.254.169.254"],
    ["/loopback", "127.0.0.1"],
    ["/loopback-v6", "[::1]"],
    ["/rebind", "rebind.example"],
  ])("blocks redirect from %s to private address %s", async (path, target) => {
    hits = [];
    const result = await requestWithRedirects(url(path), PINNED, "GET");
    expect(result.reachable).toBe(true);
    expect(result.statusCode).toBe(302);
    expect(result.finalUrl).toBe(url(path).href);
    expect(result.error).toMatch(/blocked \(private or reserved address\)/);
    expect(result.error).toContain(target);
    // The redirect target was never requested
    expect(hits).toEqual([path]);
  });

  it("does not follow redirects to unresolvable hosts", async () => {
    const result = await requestWithRedirects(url("/nxdomain"), PINNED, "GET");
    expect(result).toMatchObject({ reachable: true, statusCode: 302 });
    expect(result.error).toContain("unresolved");
  });

  it("does not follow redirects to non-HTTP protocols", async () => {
    const result = await requestWithRedirects(url("/file"), PINNED, "GET");
    expect(result).toMatchObject({ reachable: true, statusCode: 302 });
    expect(result.error).toContain("unsupported protocol");
  });

  it("stops after the redirect limit", async () => {
    hits = [];
    const result = await requestWithRedirects(url("/loop"), PINNED, "GET");
    expect(result).toMatchObject({ reachable: true, statusCode: 302, error: "Too many redirects" });
    expect(hits).toHaveLength(4); // initial request + 3 redirects
  });

  it("returns after headers without downloading the body", async () => {
    const start = Date.now();
    const result = await requestWithRedirects(url("/stream"), PINNED, "GET");
    expect(result).toMatchObject({ reachable: true, statusCode: 200 });
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it("reports unreachable when nothing is listening", async () => {
    const result = await requestWithRedirects(new URL(`http://${HOST}:1/`), PINNED, "GET");
    expect(result.reachable).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe("connection errors", () => {
  it("reports a useful message when every pinned address fails", async () => {
    const result = await requestWithRedirects(
      new URL(`http://${HOST}:1/`),
      ["127.0.0.1", "::1"],
      "GET"
    );
    expect(result.reachable).toBe(false);
    expect(result.error).toContain("ECONNREFUSED");
  });
});
