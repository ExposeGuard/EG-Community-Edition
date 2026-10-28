import net from "net";

// Non-public address space (IANA special-purpose registries). Anything in
// these ranges is never scanned or connected to.
const BLOCKED_IPV4_SUBNETS: Array<[string, number]> = [
  ["0.0.0.0", 8], // "This network"
  ["10.0.0.0", 8], // RFC1918 private
  ["100.64.0.0", 10], // Carrier-grade NAT
  ["127.0.0.0", 8], // Loopback
  ["169.254.0.0", 16], // Link-local (incl. cloud metadata 169.254.169.254)
  ["172.16.0.0", 12], // RFC1918 private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // RFC1918 private
  ["198.18.0.0", 15], // Benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // Multicast
  ["240.0.0.0", 4], // Reserved + broadcast
];

const BLOCKED_IPV6_SUBNETS: Array<[string, number]> = [
  ["::", 96], // Unspecified, loopback, IPv4-compatible
  ["::ffff:0:0:0", 96], // IPv4-translated
  ["64:ff9b::", 96], // NAT64 (embeds an IPv4 address)
  ["64:ff9b:1::", 48], // Local-use NAT64
  ["100::", 64], // Discard-only
  ["2001::", 23], // IETF protocol assignments (incl. Teredo)
  ["2001:db8::", 32], // Documentation
  ["2002::", 16], // 6to4 (embeds an IPv4 address)
  ["fc00::", 7], // Unique local
  ["fe80::", 10], // Link-local
  ["fec0::", 10], // Site-local (deprecated)
  ["ff00::", 8], // Multicast
];

const blockList = new net.BlockList();
for (const [network, prefix] of BLOCKED_IPV4_SUBNETS) {
  blockList.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of BLOCKED_IPV6_SUBNETS) {
  blockList.addSubnet(network, prefix, "ipv6");
}

/**
 * Returns true if the address is private, reserved, or otherwise not a
 * public unicast address. IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) are
 * checked against the IPv4 rules. Unparseable input is treated as private.
 */
export function isPrivateIP(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return blockList.check(ip, "ipv4");
  if (family === 6) return blockList.check(ip, "ipv6");
  return true;
}
