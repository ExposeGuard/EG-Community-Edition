import { randomUUID } from "crypto";
import { discoverSubdomains } from "./ct-discovery";
import { resolveHost } from "./dns-resolver";
import { checkHttp } from "./http-checker";
import { checkTls } from "./tls-checker";
import { scanPorts } from "./port-scanner";
import { calculateRiskScore, determineHostRiskLevel } from "./risk-scorer";
import { logScan } from "./logger";
import { ScanJob, ScanResult, HostResult, ScanSummary, PortResult } from "./types";

const MAX_HOSTS = 50;
const MAX_SCAN_DURATION_MS = 2 * 60 * 1000; // 2 minutes
const HOST_CONCURRENCY = 10;
const MAX_ACTIVE_SCANS = 3;
const JOB_TTL_MS = 60 * 60 * 1000; // Results are kept for 1 hour

export const TIME_LIMIT_FLAG = "Not fully scanned (time limit)";

const jobStore = new Map<string, ScanJob>();

export function getJob(id: string): ScanJob | undefined {
  return jobStore.get(id);
}

export function hasScanCapacity(): boolean {
  let active = 0;
  for (const job of jobStore.values()) {
    if (job.status === "queued" || job.status === "running") active++;
  }
  return active < MAX_ACTIVE_SCANS;
}

export function createJob(domain: string): ScanJob {
  const id = randomUUID();
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
  const deadline = startTime + MAX_SCAN_DURATION_MS;
  job.status = "running";
  job.stage = "Discovering subdomains";
  job.progress = 5;

  try {
    // Discover subdomains via CT
    const ctSubdomains = await discoverSubdomains(job.domain);

    // Build host list: apex + www + CT results
    const hostSet = new Set<string>();
    hostSet.add(job.domain);
    hostSet.add(`www.${job.domain}`);
    for (const sub of ctSubdomains) {
      hostSet.add(sub);
    }

    // Deduplicate and cap at MAX_HOSTS
    const hostnames = Array.from(hostSet).slice(0, MAX_HOSTS);

    job.stage = `Scanning hosts (0/${hostnames.length})`;
    job.progress = 10;

    // Hosts sharing an IP (e.g. behind a CDN) only get their ports scanned once
    const portScans = new Map<string, Promise<PortResult[]>>();
    let completed = 0;

    const hostResults = await mapWithConcurrency(hostnames, HOST_CONCURRENCY, async (hostname) => {
      const host = await scanHost(hostname, deadline, portScans);
      completed++;
      job.stage = `Scanning hosts (${completed}/${hostnames.length})`;
      job.progress = 10 + Math.floor((completed / hostnames.length) * 85);
      return host;
    });

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
      incompleteHosts: hostResults.filter((h) => h.flags.includes(TIME_LIMIT_FLAG)).length,
    };

    job.result = result;
    job.status = "completed";
    job.progress = 100;
    job.stage = "Complete";

    logScan(job.domain, duration, hostResults.length);
  } catch (err: unknown) {
    job.status = "failed";
    job.error = err instanceof Error ? err.message : "Unexpected error during scan.";
  } finally {
    job.completedAt = Date.now();
  }
}

async function scanHost(
  hostname: string,
  deadline: number,
  portScans: Map<string, Promise<PortResult[]>>
): Promise<HostResult> {
  const host: HostResult = {
    hostname,
    resolved: false,
    blockedPrivate: false,
    addresses: [],
    http: null,
    https: null,
    tls: null,
    openPorts: [],
    riskLevel: "info",
    flags: [],
  };

  if (Date.now() > deadline) {
    host.flags.push(TIME_LIMIT_FLAG);
    return host;
  }

  const dnsResult = await resolveHost(hostname);
  host.resolved = dnsResult.resolved;
  host.blockedPrivate = dnsResult.blockedPrivate;
  host.addresses = dnsResult.addresses;

  if (dnsResult.blockedPrivate) {
    host.flags.push("Private Resolution Blocked");
    return host;
  }

  if (!dnsResult.resolved) {
    host.flags.push("Unresolved");
    return host;
  }

  if (Date.now() > deadline) {
    host.flags.push(TIME_LIMIT_FLAG);
    return host;
  }

  const ip = host.addresses[0];
  let portScan = portScans.get(ip);
  if (!portScan) {
    portScan = scanPorts(ip);
    portScans.set(ip, portScan);
  }

  const [httpResult, httpsResult, tlsResult, openPorts] = await Promise.all([
    checkHttp(hostname, "http", host.addresses),
    checkHttp(hostname, "https", host.addresses),
    checkTls(hostname, host.addresses),
    portScan,
  ]);

  host.http = httpResult;
  host.https = httpsResult;
  host.tls = tlsResult;
  host.openPorts = [...openPorts];

  if (host.tls?.expiringSoon) {
    host.flags.push("TLS Expiring Soon");
  }

  return host;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Periodic cleanup of finished (or stuck) jobs
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobStore) {
    if (now - (job.completedAt ?? job.startedAt) > JOB_TTL_MS) {
      jobStore.delete(id);
    }
  }
}, 5 * 60 * 1000).unref();
