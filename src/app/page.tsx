"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [consentOwnership, setConsentOwnership] = useState(false);
  const [consentSafeChecks, setConsentSafeChecks] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canScan = domain.trim().length > 0 && consentOwnership && consentSafeChecks && !loading;

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    if (!canScan) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: domain.trim(),
          consentOwnership,
          consentSafeChecks,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to start scan.");
        setLoading(false);
        return;
      }

      router.push(`/results?id=${data.jobId}`);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-16">
      <div className="text-center mb-12">
        <img src="/eglogo.png" alt="ExposeGuard" className="w-24 h-24 mx-auto mb-6" />
        <h1 className="text-3xl font-bold tracking-tight mb-4">
          Find My Exposed Services
        </h1>
        <p className="text-muted text-sm leading-relaxed max-w-lg mx-auto">
          This tool provides safe external exposure visibility. It does not exploit or test
          vulnerabilities. All checks run locally from your machine with no data sent to third
          parties.
        </p>
      </div>

      <div className="bg-card border border-card-border rounded-xl p-6">
        <form onSubmit={handleScan}>
          <div className="mb-6">
            <label htmlFor="domain" className="block text-sm font-medium mb-2">
              Domain
            </label>
            <input
              id="domain"
              type="text"
              placeholder="example.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="w-full px-4 py-3 bg-background border border-card-border rounded-lg text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors"
              disabled={loading}
            />
          </div>

          <div className="space-y-3 mb-6">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={consentOwnership}
                onChange={(e) => setConsentOwnership(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-card-border bg-background accent-accent"
                disabled={loading}
              />
              <span className="text-sm text-muted group-hover:text-foreground transition-colors">
                I confirm I own or am authorized to scan this domain.
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={consentSafeChecks}
                onChange={(e) => setConsentSafeChecks(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-card-border bg-background accent-accent"
                disabled={loading}
              />
              <span className="text-sm text-muted group-hover:text-foreground transition-colors">
                I understand this tool performs safe exposure checks only.
              </span>
            </label>
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 bg-danger/10 border border-danger/20 rounded-lg text-danger text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!canScan}
            className="w-full py-3 px-4 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
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
                Starting Scan...
              </span>
            ) : (
              "Start Scan"
            )}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-card-border">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
            What this scan checks
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              "Subdomain discovery via CT logs",
              "DNS resolution (A/AAAA)",
              "HTTP/HTTPS reachability",
              "TLS certificate overview",
              "TCP port exposure (allowlisted)",
              "Risk summary report",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 text-xs text-muted">
                <div className="w-1 h-1 rounded-full bg-accent shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
