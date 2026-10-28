"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ScanResult, HostResult } from "@/lib/scanner/types";
import { exportToJson, exportToCsv } from "@/lib/utils/export";

interface JobStatus {
  id: string;
  domain: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  stage: string;
  error?: string;
  result?: ScanResult;
}

function ResultsContent() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get("id");

  const [job, setJob] = useState<JobStatus | null>(null);
  const [fetchError, setFetchError] = useState("");
  const [expandedHost, setExpandedHost] = useState<string | null>(null);

  const error = jobId ? fetchError : "No scan ID provided.";
  const finished = job?.status === "completed" || job?.status === "failed";

  // Poll until the scan finishes or an error is shown
  useEffect(() => {
    if (!jobId || finished || fetchError) return;

    let cancelled = false;

    async function pollStatus() {
      try {
        const res = await fetch(`/api/scan/status?id=${encodeURIComponent(jobId!)}`);
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          setFetchError(data.error || "Failed to fetch scan status.");
          return;
        }

        setJob(data);
      } catch {
        if (!cancelled) setFetchError("Connection error.");
      }
    }

    pollStatus();

    const interval = setInterval(() => {
      pollStatus();
    }, 1500);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [jobId, finished, fetchError]);

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="bg-danger/10 border border-danger/20 rounded-xl p-6 text-center">
          <p className="text-danger">{error}</p>
          <Link href="/" className="text-accent text-sm mt-4 inline-block hover:underline">
            Back to scan
          </Link>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="flex items-center justify-center gap-3">
          <Spinner />
          <span className="text-muted">Loading...</span>
        </div>
      </div>
    );
  }

  if (job.status === "queued" || job.status === "running") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="bg-card border border-card-border rounded-xl p-8 text-center">
          <Spinner />
          <h2 className="text-xl font-semibold mt-4 mb-2">Scanning {job.domain}</h2>
          <p className="text-muted text-sm mb-6">{job.stage}</p>
          <div className="w-full bg-background rounded-full h-2 mb-2">
            <div
              className="bg-accent h-2 rounded-full transition-all duration-500"
              style={{ width: `${job.progress}%` }}
            />
          </div>
          <p className="text-xs text-muted">{job.progress}% complete</p>
        </div>
      </div>
    );
  }

  if (job.status === "failed") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="bg-danger/10 border border-danger/20 rounded-xl p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Scan Failed</h2>
          <p className="text-danger text-sm">{job.error || "An unexpected error occurred."}</p>
          <Link href="/" className="text-accent text-sm mt-4 inline-block hover:underline">
            Try again
          </Link>
        </div>
      </div>
    );
  }

  const result = job.result!;

  function downloadFile(content: string, filename: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportJson() {
    downloadFile(exportToJson(result), `exposeguard-${result.domain}.json`, "application/json");
  }

  function handleExportCsv() {
    downloadFile(exportToCsv(result), `exposeguard-${result.domain}.csv`, "text/csv");
  }

  const riskColor =
    result.riskScore.score >= 50
      ? "text-danger"
      : result.riskScore.score >= 20
        ? "text-warning"
        : "text-success";

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">{result.domain}</h1>
          <p className="text-muted text-sm">
            Scanned {new Date(result.scannedAt).toLocaleString()} &middot;{" "}
            {(result.duration / 1000).toFixed(1)}s
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportJson}
            className="px-3 py-2 text-xs bg-card border border-card-border rounded-lg hover:bg-card-border transition-colors"
          >
            Export JSON
          </button>
          <button
            onClick={handleExportCsv}
            className="px-3 py-2 text-xs bg-card border border-card-border rounded-lg hover:bg-card-border transition-colors"
          >
            Export CSV
          </button>
        </div>
      </div>

      {result.incompleteHosts > 0 && (
        <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 mb-8 text-sm text-warning">
          The scan reached its time limit. {result.incompleteHosts} of {result.summary.totalHosts}{" "}
          hosts were not fully scanned, so these results may be incomplete.
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <SummaryCard label="Hosts Scanned" value={result.summary.totalHosts} />
        <SummaryCard label="Resolved" value={result.summary.resolvedHosts} />
        <SummaryCard label="HTTP Reachable" value={result.summary.httpReachable} />
        <SummaryCard label="HTTPS Reachable" value={result.summary.httpsReachable} />
        <SummaryCard
          label="High Risk"
          value={result.summary.highRiskCount}
          variant={result.summary.highRiskCount > 0 ? "danger" : "default"}
        />
        <div className="bg-card border border-card-border rounded-lg p-4">
          <p className="text-xs text-muted mb-1">Risk Score</p>
          <p className={`text-2xl font-bold ${riskColor}`}>{result.riskScore.score}</p>
        </div>
      </div>

      {/* Risk explanations */}
      {result.riskScore.explanations.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl p-5 mb-8">
          <h3 className="text-sm font-semibold mb-3">Risk Findings</h3>
          <ul className="space-y-1">
            {result.riskScore.explanations.map((exp, i) => (
              <li key={i} className="text-sm text-muted flex items-start gap-2">
                <span className="text-warning mt-0.5">&#9679;</span>
                {exp}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Host table */}
      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border text-left text-xs text-muted uppercase tracking-wider">
                <th className="px-4 py-3">Host</th>
                <th className="px-4 py-3">DNS</th>
                <th className="px-4 py-3">HTTP</th>
                <th className="px-4 py-3">HTTPS</th>
                <th className="px-4 py-3">Open Ports</th>
                <th className="px-4 py-3">Risk</th>
              </tr>
            </thead>
            <tbody>
              {result.hosts.map((host) => (
                <HostRow
                  key={host.hostname}
                  host={host}
                  expanded={expandedHost === host.hostname}
                  onToggle={() =>
                    setExpandedHost(expandedHost === host.hostname ? null : host.hostname)
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 text-center">
        <Link href="/" className="text-accent text-sm hover:underline">
          Run another scan
        </Link>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: number;
  variant?: "default" | "danger";
}) {
  return (
    <div className="bg-card border border-card-border rounded-lg p-4">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className={`text-2xl font-bold ${variant === "danger" && value > 0 ? "text-danger" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function HostRow({
  host,
  expanded,
  onToggle,
}: {
  host: HostResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  const riskBadge = {
    high: "bg-danger/20 text-danger",
    medium: "bg-warning/20 text-warning",
    low: "bg-accent/20 text-accent",
    info: "bg-muted/20 text-muted",
  };

  return (
    <>
      <tr
        className="border-b border-card-border hover:bg-card-border/30 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="px-4 py-3 font-mono text-xs">{host.hostname}</td>
        <td className="px-4 py-3">
          {host.blockedPrivate ? (
            <span className="text-warning text-xs">Blocked</span>
          ) : host.resolved ? (
            <span className="text-success text-xs">Resolved</span>
          ) : (
            <span className="text-muted text-xs">No</span>
          )}
        </td>
        <td className="px-4 py-3">
          <StatusDot reachable={host.http?.reachable} code={host.http?.statusCode} />
        </td>
        <td className="px-4 py-3">
          <StatusDot reachable={host.https?.reachable} code={host.https?.statusCode} />
        </td>
        <td className="px-4 py-3 text-xs">
          {host.openPorts.length > 0
            ? host.openPorts.map((p) => p.port).join(", ")
            : "—"}
        </td>
        <td className="px-4 py-3">
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${riskBadge[host.riskLevel]}`}
          >
            {host.riskLevel}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-card-border">
          <td colSpan={6} className="px-4 py-4 bg-background/50">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <h4 className="font-semibold mb-2 text-muted uppercase tracking-wider">
                  IP Addresses
                </h4>
                {host.addresses.length > 0 ? (
                  <ul className="space-y-1 font-mono">
                    {host.addresses.map((ip) => (
                      <li key={ip}>{ip}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted">None</p>
                )}
              </div>
              <div>
                <h4 className="font-semibold mb-2 text-muted uppercase tracking-wider">
                  TLS Certificate
                </h4>
                {host.tls ? (
                  <div className="space-y-1">
                    <p>
                      <span className="text-muted">Issuer:</span> {host.tls.issuer}
                    </p>
                    <p>
                      <span className="text-muted">Expires:</span>{" "}
                      {new Date(host.tls.expiresAt).toLocaleDateString()}
                    </p>
                    <p>
                      <span className="text-muted">Days left:</span>{" "}
                      <span className={host.tls.expiringSoon ? "text-warning" : ""}>
                        {host.tls.daysUntilExpiry}
                      </span>
                    </p>
                  </div>
                ) : (
                  <p className="text-muted">No TLS data</p>
                )}
              </div>
              <div>
                <h4 className="font-semibold mb-2 text-muted uppercase tracking-wider">
                  Flags
                </h4>
                {host.flags.length > 0 ? (
                  <ul className="space-y-1">
                    {host.flags.map((f, i) => (
                      <li key={i} className="text-warning">
                        {f}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted">None</p>
                )}
                {host.openPorts.length > 0 && (
                  <div className="mt-3">
                    <h4 className="font-semibold mb-2 text-muted uppercase tracking-wider">
                      Open Ports
                    </h4>
                    <div className="flex flex-wrap gap-1">
                      {host.openPorts.map((p) => (
                        <span
                          key={p.port}
                          className="px-2 py-0.5 bg-card border border-card-border rounded text-xs"
                        >
                          {p.port}/{p.service}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function StatusDot({
  reachable,
  code,
}: {
  reachable?: boolean;
  code?: number;
}) {
  if (!reachable) {
    return <span className="text-muted text-xs">—</span>;
  }
  return (
    <span className="text-success text-xs">
      {code || "OK"}
    </span>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-6 w-6 text-accent mx-auto" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <p className="text-muted">Loading...</p>
        </div>
      }
    >
      <ResultsContent />
    </Suspense>
  );
}
