import { NextResponse } from "next/server";
import type { BridgeStatusResponse } from "@/lib/types";

/**
 * Mock bridge status polling API.
 * In production, replace with real backend call.
 */

// We need to import the shared jobs store
// In a real app this would be a database query
// For the mock, we maintain a separate store that syncs with the process route
const mockJobs = new Map<string, {
  status: string;
  sourceTxHash: string;
  backendProcessTxHash: string;
  lzMessageId: string;
  lzTxHash: string;
  destinationTxHash?: string;
  createdAt: number;
}>();

// Since Next.js route handlers are isolated, we simulate progression here too
function getSimulatedStatus(jobId: string, createdAt?: number): BridgeStatusResponse {
  const elapsed = createdAt ? Date.now() - createdAt : 0;

  let status: string = "backend_submitted";
  let destinationTxHash: string | undefined;

  if (elapsed > 20000) {
    status = "completed";
    destinationTxHash = `0x${jobId.replace("job_", "").padEnd(64, "a")}`;
  } else if (elapsed > 16000) {
    status = "destination_confirmed";
    destinationTxHash = `0x${jobId.replace("job_", "").padEnd(64, "a")}`;
  } else if (elapsed > 8000) {
    status = "lz_pending";
  }

  return {
    status: status as BridgeStatusResponse["status"],
    sourceTxHash: `0x${jobId.replace("job_", "").padEnd(64, "b")}`,
    backendProcessTxHash: `0x${jobId.replace("job_", "").padEnd(64, "c")}`,
    lzMessageId: `0x${jobId.replace("job_", "").padEnd(64, "d")}`,
    lzTxHash: `0x${jobId.replace("job_", "").padEnd(64, "e")}`,
    destinationTxHash,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json(
      { error: "Missing jobId parameter" },
      { status: 400 }
    );
  }

  // Check local store first
  const job = mockJobs.get(jobId);

  if (job) {
    const response: BridgeStatusResponse = {
      status: job.status as BridgeStatusResponse["status"],
      sourceTxHash: job.sourceTxHash,
      backendProcessTxHash: job.backendProcessTxHash,
      lzMessageId: job.lzMessageId,
      lzTxHash: job.lzTxHash,
      destinationTxHash: job.destinationTxHash,
    };
    return NextResponse.json(response);
  }

  // For jobs we haven't seen, simulate based on jobId timestamp
  const tsMatch = jobId.match(/job_(\d+)_/);
  const createdAt = tsMatch ? parseInt(tsMatch[1], 10) : undefined;
  const simulated = getSimulatedStatus(jobId, createdAt);

  // Store for consistency
  mockJobs.set(jobId, {
    status: simulated.status,
    sourceTxHash: simulated.sourceTxHash!,
    backendProcessTxHash: simulated.backendProcessTxHash!,
    lzMessageId: simulated.lzMessageId!,
    lzTxHash: simulated.lzTxHash!,
    destinationTxHash: simulated.destinationTxHash,
    createdAt: createdAt ?? Date.now(),
  });

  return NextResponse.json(simulated);
}
