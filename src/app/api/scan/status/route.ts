import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/scanner/orchestrator";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("id");

  if (!jobId) {
    return NextResponse.json({ error: "Job ID is required." }, { status: 400 });
  }

  const job = getJob(jobId);

  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  return NextResponse.json({
    id: job.id,
    domain: job.domain,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    error: job.error,
    result: job.status === "completed" ? job.result : undefined,
  });
}
