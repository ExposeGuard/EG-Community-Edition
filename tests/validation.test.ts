import { describe, expect, it } from "vitest";
import { normalizeDomain, validateDomain } from "@/lib/utils/validation";

describe("normalizeDomain", () => {
  it.each([
    ["Example.COM", "example.com"],
    ["  example.com  ", "example.com"],
    ["https://example.com/path?q=1", "example.com"],
    ["http://www.example.com", "example.com"],
    ["sub.example.com/", "sub.example.com"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });
});

describe("validateDomain", () => {
  it.each(["example.com", "sub.example.co.uk", "my-site.io", "a.b.c.example.org"])(
    "accepts %s",
    (domain) => {
      expect(validateDomain(domain)).toEqual({ valid: true });
    }
  );

  it.each([
    ["", "Domain is required."],
    ["192.168.1.1", "IP addresses are not accepted"],
    ["8.8.8.8", "IP addresses are not accepted"],
    ["::1", "IP addresses are not accepted"],
    ["https://example.com", "without the protocol"],
    ["localhost", "Invalid domain format."],
    ["-bad.com", "Invalid domain format."],
    ["exa mple.com", "Invalid domain format."],
    ["example.com:8080", "Invalid domain format."],
    ["whitehouse.gov", "not permitted"],
    ["army.mil", "not permitted"],
  ])("rejects %j", (domain, message) => {
    const result = validateDomain(domain);
    expect(result.valid).toBe(false);
    expect(result.error).toContain(message);
  });
});
