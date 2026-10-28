import { describe, expect, it } from "vitest";
import { createJob, getJob, hasScanCapacity } from "@/lib/scanner/orchestrator";

describe("orchestrator jobs", () => {
  it("uses unguessable UUID job IDs", () => {
    const job = createJob("example.com");
    expect(job.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(getJob(job.id)).toBe(job);
  });

  it("caps the number of concurrently active scans", () => {
    // The job from the previous test is still queued
    expect(hasScanCapacity()).toBe(true);
    createJob("example.org");
    createJob("example.net");
    expect(hasScanCapacity()).toBe(false);
  });
});
