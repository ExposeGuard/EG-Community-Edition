import dns from "dns";
import { isPrivateIP } from "@/lib/utils/ip-filter";

interface DnsResult {
  resolved: boolean;
  addresses: string[];
  blockedPrivate: boolean;
}

export async function resolveHost(hostname: string): Promise<DnsResult> {
  const addresses: string[] = [];

  const ipv4 = await resolveRecords(hostname, "A");
  const ipv6 = await resolveRecords(hostname, "AAAA");

  addresses.push(...ipv4, ...ipv6);

  if (addresses.length === 0) {
    return { resolved: false, addresses: [], blockedPrivate: false };
  }

  const hasPrivate = addresses.some((ip) => isPrivateIP(ip));
  if (hasPrivate) {
    return { resolved: true, addresses, blockedPrivate: true };
  }

  return { resolved: true, addresses, blockedPrivate: false };
}

function resolveRecords(hostname: string, type: "A" | "AAAA"): Promise<string[]> {
  return new Promise((resolve) => {
    const resolver = type === "A" ? dns.resolve4 : dns.resolve6;
    resolver(hostname, (err, records) => {
      if (err || !records) {
        resolve([]);
      } else {
        resolve(records);
      }
    });
  });
}
