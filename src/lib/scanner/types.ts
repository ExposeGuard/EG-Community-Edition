export interface ScanRequest {
  domain: string;
  consentOwnership: boolean;
  consentSafeChecks: boolean;
}

export interface ScanJob {
  id: string;
  domain: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  stage: string;
  startedAt: number;
  completedAt?: number;
  result?: ScanResult;
  error?: string;
}

export interface ScanResult {
  domain: string;
  scannedAt: string;
  duration: number;
  hosts: HostResult[];
  summary: ScanSummary;
  riskScore: RiskScore;
  /** Hosts skipped or cut short because the scan hit its time limit */
  incompleteHosts: number;
}

export interface HostResult {
  hostname: string;
  resolved: boolean;
  blockedPrivate: boolean;
  addresses: string[];
  http: HttpResult | null;
  https: HttpResult | null;
  tls: TlsResult | null;
  openPorts: PortResult[];
  riskLevel: "high" | "medium" | "low" | "info";
  flags: string[];
}

export interface HttpResult {
  reachable: boolean;
  statusCode?: number;
  finalUrl?: string;
  server?: string;
  error?: string;
}

export interface TlsResult {
  valid: boolean;
  issuer: string;
  subject: string;
  expiresAt: string;
  daysUntilExpiry: number;
  expiringSoon: boolean;
}

export interface PortResult {
  port: number;
  status: "tcp_connect_success" | "closed" | "timeout";
  service: string;
}

export interface ScanSummary {
  totalHosts: number;
  resolvedHosts: number;
  httpReachable: number;
  httpsReachable: number;
  totalOpenPorts: number;
  highRiskCount: number;
  mediumRiskCount: number;
  lowRiskCount: number;
}

export interface RiskScore {
  score: number;
  highFindings: number;
  mediumFindings: number;
  explanations: string[];
}
