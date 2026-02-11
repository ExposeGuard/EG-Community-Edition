import { HostResult, RiskScore } from "./types";

// Scoring weights:
// - Database port open: 15 points each (high risk, direct data exposure)
// - RDP port open (3389): 20 points (high risk, remote access)
// - SMB port open (445): 15 points (high risk, file share exposure)
// - HTTP without HTTPS: 10 points each (medium risk, unencrypted traffic)
// - TLS expiring < 14 days: 8 points each (medium risk, service disruption)
// - Many exposed subdomains (>20): 5 points (low risk, broad attack surface)

const DATABASE_PORTS = [1433, 3306, 5432, 27017, 6379];
const HIGH_RISK_PORTS = [3389, 445];

const WEIGHT_DATABASE_PORT = 15;
const WEIGHT_RDP = 20;
const WEIGHT_SMB = 15;
const WEIGHT_HTTP_NO_HTTPS = 10;
const WEIGHT_TLS_EXPIRING = 8;
const WEIGHT_MANY_SUBDOMAINS = 5;

export function calculateRiskScore(hosts: HostResult[]): RiskScore {
  let score = 0;
  let highFindings = 0;
  let mediumFindings = 0;
  const explanations: string[] = [];

  for (const host of hosts) {
    for (const port of host.openPorts) {
      if (port.port === 3389 && port.status === "tcp_connect_success") {
        score += WEIGHT_RDP;
        highFindings++;
        explanations.push(`${host.hostname}: RDP (port 3389) is reachable.`);
      }

      if (port.port === 445 && port.status === "tcp_connect_success") {
        score += WEIGHT_SMB;
        highFindings++;
        explanations.push(`${host.hostname}: SMB (port 445) is reachable.`);
      }

      if (DATABASE_PORTS.includes(port.port) && port.status === "tcp_connect_success") {
        if (port.port !== 6379 || !HIGH_RISK_PORTS.includes(port.port)) {
          score += WEIGHT_DATABASE_PORT;
          highFindings++;
          explanations.push(
            `${host.hostname}: Database port ${port.port} (${port.service}) is reachable.`
          );
        }
      }
    }

    if (host.http?.reachable && !host.https?.reachable) {
      score += WEIGHT_HTTP_NO_HTTPS;
      mediumFindings++;
      explanations.push(`${host.hostname}: HTTP reachable but HTTPS is not available.`);
    }

    if (host.tls?.expiringSoon) {
      score += WEIGHT_TLS_EXPIRING;
      mediumFindings++;
      explanations.push(
        `${host.hostname}: TLS certificate expires in ${host.tls.daysUntilExpiry} days.`
      );
    }
  }

  const resolvedCount = hosts.filter((h) => h.resolved && !h.blockedPrivate).length;
  if (resolvedCount > 20) {
    score += WEIGHT_MANY_SUBDOMAINS;
    explanations.push(`${resolvedCount} subdomains are externally visible (broad attack surface).`);
  }

  score = Math.min(score, 100);

  return { score, highFindings, mediumFindings, explanations };
}

export function determineHostRiskLevel(host: HostResult): "high" | "medium" | "low" | "info" {
  for (const port of host.openPorts) {
    if (HIGH_RISK_PORTS.includes(port.port) && port.status === "tcp_connect_success") {
      return "high";
    }
    if (DATABASE_PORTS.includes(port.port) && port.status === "tcp_connect_success") {
      return "high";
    }
  }

  if (host.http?.reachable && !host.https?.reachable) return "medium";
  if (host.tls?.expiringSoon) return "medium";

  if (host.openPorts.length > 0) return "low";
  return "info";
}
