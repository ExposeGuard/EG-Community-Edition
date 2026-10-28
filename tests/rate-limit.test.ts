import { beforeEach, describe, expect, it, vi } from "vitest";

// The limiter keeps module-level state, so each test gets a fresh copy
async function loadRateLimit() {
  vi.resetModules();
  return import("@/lib/utils/rate-limit");
}

describe("getClientIp", () => {
  it("uses the entry appended by the trusted proxy, not the client-supplied one", async () => {
    const { getClientIp } = await loadRateLimit();
    expect(getClientIp("6.6.6.6, 203.0.113.5", 1)).toBe("203.0.113.5");
  });

  it("supports multiple trusted proxies", async () => {
    const { getClientIp } = await loadRateLimit();
    expect(getClientIp("6.6.6.6, 203.0.113.5, 10.0.0.2", 2)).toBe("203.0.113.5");
  });

  it("falls back to the leftmost entry when there are fewer entries than hops", async () => {
    const { getClientIp } = await loadRateLimit();
    expect(getClientIp("203.0.113.5", 3)).toBe("203.0.113.5");
  });

  it("returns 'unknown' when the header is missing or empty", async () => {
    const { getClientIp } = await loadRateLimit();
    expect(getClientIp(null, 1)).toBe("unknown");
    expect(getClientIp(" , ", 1)).toBe("unknown");
  });

  it("caps the key length", async () => {
    const { getClientIp } = await loadRateLimit();
    expect(getClientIp("x".repeat(500), 1)).toHaveLength(64);
  });
});

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("allows 5 scans per client per hour", async () => {
    const { checkRateLimit } = await loadRateLimit();
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("1.2.3.4").allowed).toBe(true);
    }
    const blocked = checkRateLimit("1.2.3.4");
    expect(blocked).toMatchObject({ allowed: false, scope: "client" });

    // Other clients are unaffected
    expect(checkRateLimit("5.6.7.8").allowed).toBe(true);
  });

  it("enforces a global cap even when clients rotate IPs", async () => {
    const { checkRateLimit } = await loadRateLimit();
    for (let i = 0; i < 30; i++) {
      expect(checkRateLimit(`198.51.100.${i}`).allowed).toBe(true);
    }
    expect(checkRateLimit("198.51.100.200")).toMatchObject({ allowed: false, scope: "global" });
  });

  it("resets after the window expires", async () => {
    vi.useFakeTimers();
    const { checkRateLimit } = await loadRateLimit();
    for (let i = 0; i < 5; i++) checkRateLimit("1.2.3.4");
    expect(checkRateLimit("1.2.3.4").allowed).toBe(false);

    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(checkRateLimit("1.2.3.4").allowed).toBe(true);
  });
});
