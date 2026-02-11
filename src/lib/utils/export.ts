import { ScanResult } from "@/lib/scanner/types";

export function exportToJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}

export function exportToCsv(result: ScanResult): string {
  const headers = [
    "Hostname",
    "Resolved",
    "Blocked Private",
    "IP Addresses",
    "HTTP Reachable",
    "HTTP Status",
    "HTTPS Reachable",
    "HTTPS Status",
    "TLS Issuer",
    "TLS Expires",
    "TLS Days Left",
    "Open Ports",
    "Risk Level",
    "Flags",
  ];

  const rows = result.hosts.map((host) => [
    host.hostname,
    host.resolved ? "Yes" : "No",
    host.blockedPrivate ? "Yes" : "No",
    host.addresses.join("; "),
    host.http?.reachable ? "Yes" : "No",
    host.http?.statusCode?.toString() || "",
    host.https?.reachable ? "Yes" : "No",
    host.https?.statusCode?.toString() || "",
    host.tls?.issuer || "",
    host.tls?.expiresAt || "",
    host.tls?.daysUntilExpiry?.toString() || "",
    host.openPorts.map((p) => `${p.port}/${p.service}`).join("; "),
    host.riskLevel,
    host.flags.join("; "),
  ]);

  const escape = (val: string) => {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const lines = [headers.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))];

  return lines.join("\n");
}
