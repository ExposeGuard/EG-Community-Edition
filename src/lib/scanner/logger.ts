const LOGGING_ENABLED = process.env.LOGGING_ENABLED !== "false";

interface ScanLog {
  timestamp: string;
  domain: string;
  duration: number;
  hostCount: number;
}

export function logScan(domain: string, duration: number, hostCount: number): void {
  if (!LOGGING_ENABLED) return;

  const entry: ScanLog = {
    timestamp: new Date().toISOString(),
    domain,
    duration,
    hostCount,
  };

  console.log(`[ExposeGuard] Scan completed: ${JSON.stringify(entry)}`);
}
