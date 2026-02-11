const BLOCKED_TLDS = [".gov", ".mil"];

const VALID_DOMAIN_REGEX = /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.[a-zA-Z0-9-]{1,63})*\.[a-zA-Z]{2,}$/;

const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_REGEX = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;

export function validateDomain(input: string): { valid: boolean; error?: string } {
  const domain = input.trim().toLowerCase();

  if (!domain) {
    return { valid: false, error: "Domain is required." };
  }

  if (IP_REGEX.test(domain) || IPV6_REGEX.test(domain)) {
    return { valid: false, error: "IP addresses are not accepted. Please enter a domain name." };
  }

  if (domain.startsWith("http://") || domain.startsWith("https://")) {
    return { valid: false, error: "Enter a domain name without the protocol (e.g., example.com)." };
  }

  if (!VALID_DOMAIN_REGEX.test(domain)) {
    return { valid: false, error: "Invalid domain format." };
  }

  const parts = domain.split(".");
  if (parts.length < 2) {
    return { valid: false, error: "Invalid domain format." };
  }

  const tld = "." + parts[parts.length - 1];
  if (BLOCKED_TLDS.includes(tld)) {
    return { valid: false, error: `Scanning ${tld} domains is not permitted.` };
  }

  return { valid: true };
}

export function normalizeDomain(input: string): string {
  let domain = input.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, "");
  domain = domain.replace(/\/.*$/, "");
  domain = domain.replace(/^www\./, "");
  return domain;
}
