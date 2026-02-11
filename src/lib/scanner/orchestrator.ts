import { discoverSubdomains } from "./ct-discovery";
import { resolveHost } from "./dns-resolver";
import { checkHttp } from "./http-checker";
import { checkTls } from "./tls-checker";
import { scanPorts } from "./port-scanner";
import { calculateRiskScore, determineHostRiskLevel } from "./risk-scorer";
import { logScan } from "./logger";
import { ScanJob, ScanResult, HostResult, ScanSummary } from "./types";

const MAX_HOSTS = 50;
const MAX_SCAN_DURATION_MS = 2 * 60 * 1000; // 2 minutes

const jobStore = new Map<string, ScanJob>();

export function getJob(id: string): ScanJob | undefined {
  return jobStore.get(id);
}

export function createJob(domain: string): ScanJob {
  const id = generateId();
  const job: ScanJob = {
    id,
    domain,
    status: "queued",
    progress: 0,
    stage: "Initializing",
    startedAt: Date.now(),
  };
  jobStore.set(id, job);
  return job;
}

export async function runScan(jobId: string): Promise<void> {
  const job = jobStore.get(jobId);
  if (!job) return;

  const startTime = Date.now();
  job.status = "running";
  job.stage = "Discovering subdomains";
  job.progress = 5;

  try {
    const deadline = startTime + MAX_SCAN_DURATION_MS;

    // Discover subdomains via CT
    const ctSubdomains = await discoverSubdomains(job.domain);

    if (Date.now() > deadline) {
      job.status = "aborted";
      job.error = "Scan duration limit exceeded.";
      return;
    }

    // Build host list: apex + www + CT results
    const hostSet = new Set<string>();
    hostSet.add(job.domain);
    hostSet.add(`www.${job.domain}`);
    for (const sub of ctSubdomains) {
      hostSet.add(sub);
    }

    // Deduplicate and cap at MAX_HOSTS
    const hostnames = Array.from(hostSet).slice(0, MAX_HOSTS);

    job.stage = "Resolving DNS";
    job.progress = 15;

    // Resolve DNS for all hosts
    const hostResults: HostResult[] = [];
    const totalHosts = hostnames.length;

    for (let i = 0; i < totalHosts; i++) {
      if (Date.now() > deadline) {
        job.status = "aborted";
        job.error = "Scan duration limit exceeded.";
        return;
      }

      const hostname = hostnames[i];
      const dnsResult = await resolveHost(hostname);

      const host: HostResult = {
        hostname,
        resolved: dnsResult.resolved,
        blockedPrivate: dnsResult.blockedPrivate,
        addresses: dnsResult.addresses,
        http: null,
        https: null,
        tls: null,
        openPorts: [],
        riskLevel: "info",
        flags: [],
      };

      if (dnsResult.blockedPrivate) {
        host.flags.push("Private Resolution Blocked");
        hostResults.push(host);
        continue;
      }

      if (!dnsResult.resolved) {
        host.flags.push("Unresolved");
        hostResults.push(host);
        continue;
      }

      hostResults.push(host);

      job.progress = 15 + Math.floor((i / totalHosts) * 20);
    }

    // HTTP/HTTPS checks for resolved hosts
    job.stage = "Checking HTTP/HTTPS reachability";
    job.progress = 35;

    const resolvedHosts = hostResults.filter((h) => h.resolved && !h.blockedPrivate);

    for (let i = 0; i < resolvedHosts.length; i++) {
      if (Date.now() > deadline) {
        job.status = "aborted";
        job.error = "Scan duration limit exceeded.";
        return;
      }

      const host = resolvedHosts[i];

      const [httpResult, httpsResult] = await Promise.all([
        checkHttp(host.hostname, "http"),
        checkHttp(host.hostname, "https"),
      ]);

      host.http = httpResult;
      host.https = httpsResult;

      job.progress = 35 + Math.floor((i / resolvedHosts.length) * 20);
    }

    // TLS checks
    job.stage = "Checking TLS certificates";
    job.progress = 55;

    for (let i = 0; i < resolvedHosts.length; i++) {
      if (Date.now() > deadline) {
        job.status = "aborted";
        job.error = "Scan duration limit exceeded.";
        return;
      }

      const host = resolvedHosts[i];
      host.tls = await checkTls(host.hostname);

      if (host.tls?.expiringSoon) {
        host.flags.push("TLS Expiring Soon");
      }

      job.progress = 55 + Math.floor((i / resolvedHosts.length) * 15);
    }

    // Port scanning
    job.stage = "Scanning allowed ports";
    job.progress = 70;

    for (let i = 0; i < resolvedHosts.length; i++) {
      if (Date.now() > deadline) {
        job.status = "aborted";
        job.error = "Scan duration limit exceeded.";
        return;
      }

      const host = resolvedHosts[i];
      const ip = host.addresses[0];
      if (ip) {
        host.openPorts = await scanPorts(ip);
      }

      job.progress = 70 + Math.floor((i / resolvedHosts.length) * 25);
    }

    // Determine risk levels
    job.stage = "Calculating risk";
    job.progress = 95;

    for (const host of hostResults) {
      host.riskLevel = determineHostRiskLevel(host);
    }

    const riskScore = calculateRiskScore(hostResults);

    const summary: ScanSummary = {
      totalHosts: hostResults.length,
      resolvedHosts: hostResults.filter((h) => h.resolved).length,
      httpReachable: hostResults.filter((h) => h.http?.reachable).length,
      httpsReachable: hostResults.filter((h) => h.https?.reachable).length,
      totalOpenPorts: hostResults.reduce((sum, h) => sum + h.openPorts.length, 0),
      highRiskCount: hostResults.filter((h) => h.riskLevel === "high").length,
      mediumRiskCount: hostResults.filter((h) => h.riskLevel === "medium").length,
      lowRiskCount: hostResults.filter((h) => h.riskLevel === "low").length,
    };

    const duration = Date.now() - startTime;

    const result: ScanResult = {
      domain: job.domain,
      scannedAt: new Date(startTime).toISOString(),
      duration,
      hosts: hostResults,
      summary,
      riskScore,
    };

    job.result = result;
    job.status = "completed";
    job.progress = 100;
    job.stage = "Complete";
    job.completedAt = Date.now();

    logScan(job.domain, duration, hostResults.length);
  } catch (err: unknown) {
    job.status = "failed";
    job.error = err instanceof Error ? err.message : "Unexpected error during scan.";
  }
}

function generateId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 16; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}
