import { NextRequest, NextResponse } from "next/server";
import { validateDomain, normalizeDomain } from "@/lib/utils/validation";
import { checkRateLimit } from "@/lib/utils/rate-limit";
import { createJob, runScan } from "@/lib/scanner/orchestrator";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";

  const rateCheck = checkRateLimit(clientIp);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded. Maximum 5 scans per hour.",
        resetAt: new Date(rateCheck.resetAt).toISOString(),
      },
      { status: 429 }
    );
  }

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

  const job = createJob(normalized);

  // Run scan in background (do not await)
  runScan(job.id).catch(() => {});

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    message: "Scan started.",
  });
}
