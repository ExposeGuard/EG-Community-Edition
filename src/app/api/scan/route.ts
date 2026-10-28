import { NextRequest, NextResponse } from "next/server";
import { validateDomain, normalizeDomain } from "@/lib/utils/validation";
import { checkRateLimit, getClientIp } from "@/lib/utils/rate-limit";
import { createJob, hasScanCapacity, runScan } from "@/lib/scanner/orchestrator";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: { domain?: string; consentOwnership?: boolean; consentSafeChecks?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { domain, consentOwnership, consentSafeChecks } = body;

  if (!consentOwnership || !consentSafeChecks) {
    return NextResponse.json(
      { error: "Both consent checkboxes must be confirmed." },
      { status: 400 }
    );
  }

  if (!domain || typeof domain !== "string") {
    return NextResponse.json({ error: "Domain is required." }, { status: 400 });
  }

  const normalized = normalizeDomain(domain);
  const validation = validateDomain(normalized);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  if (!hasScanCapacity()) {
    return NextResponse.json(
      { error: "Too many scans are running. Please try again in a minute." },
      { status: 503, headers: { "Retry-After": "60" } }
    );
  }

  const clientIp = getClientIp(request.headers.get("x-forwarded-for"));
  const rateCheck = checkRateLimit(clientIp);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error:
          rateCheck.scope === "global"
            ? "This server's hourly scan limit has been reached. Please try again later."
            : "Rate limit exceeded. Maximum 5 scans per hour.",
        resetAt: new Date(rateCheck.resetAt).toISOString(),
      },
      { status: 429 }
    );
  }

  const job = createJob(normalized);

  // Run scan in background (do not await)
  runScan(job.id).catch(() => {});

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    message: "Scan started.",
  });
}
