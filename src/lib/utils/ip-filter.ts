export function isPrivateIP(ip: string): boolean {
  if (isIPv4(ip)) {
    return isPrivateIPv4(ip);
  }
  if (isIPv6(ip)) {
    return isPrivateIPv6(ip);
  }
  return false;
}

function isIPv4(ip: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
}

function isIPv6(ip: string): boolean {
  return ip.includes(":");
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true;
  }

  const [a, b] = parts;

  // 10.0.0.0/8
  if (a === 10) return true;

  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;

  // 127.0.0.0/8 loopback
  if (a === 127) return true;

  // 169.254.0.0/16 link-local
  if (a === 169 && b === 254) return true;

  // 0.0.0.0
  if (parts.every((p) => p === 0)) return true;

  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  // Loopback ::1
  if (normalized === "::1" || normalized === "0000:0000:0000:0000:0000:0000:0000:0001") {
    return true;
  }

  // Link-local fe80::/10
  if (normalized.startsWith("fe80:") || normalized.startsWith("fe80")) {
    return true;
  }

  // RFC4193 unique local fc00::/7
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }

  // IPv4-mapped ::ffff:private
  if (normalized.startsWith("::ffff:")) {
    const ipv4Part = normalized.slice(7);
    if (isIPv4(ipv4Part)) {
      return isPrivateIPv4(ipv4Part);
    }
  }

  return false;
}
