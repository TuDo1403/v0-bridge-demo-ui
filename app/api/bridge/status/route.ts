import { NextResponse } from "next/server";
import type { BridgeStatusResponse, LzTrackingSnapshot } from "@/lib/types";

/**
 * Mock bridge status polling API.
 * Simulates realistic progression with LZ tracking data.
 */

function mockGuid(jobId: string): string {
  return `0x${jobId.replace("job_", "").padEnd(64, "f")}`;
}

function getSimulatedStatus(
  jobId: string,
  createdAt?: number
): BridgeStatusResponse {
  const elapsed = createdAt ? Date.now() - createdAt : 0;

  const backendProcessTxHash = `0x${jobId.replace("job_", "").padEnd(64, "c")}`;
  const guid = mockGuid(jobId);

  let status: BridgeStatusResponse["status"] = "backend_submitted";
  let destinationTxHash: string | undefined;
  let lzTracking: LzTrackingSnapshot = {
    guid,
    srcTxHash: backendProcessTxHash,
    srcEid: 40161,
    dstEid: 40438,
    sender: "0xMockSender000000000000000000000000000001",
    receiver: "0xMockReceiver00000000000000000000000000002",
  };

  if (elapsed > 20000) {
    status = "completed";
    destinationTxHash = `0x${jobId.replace("job_", "").padEnd(64, "a")}`;
    lzTracking = {
      ...lzTracking,
      lzStatus: "lz_delivered",
      rawStatus: "DELIVERED",
      dstTxHash: destinationTxHash,
      composeStatus: "SUCCEEDED",
      composeTxHash: `0x${jobId.replace("job_", "").padEnd(64, "9")}`,
      lzCreated: (createdAt ?? Date.now()) - 20000,
      lzUpdated: Date.now(),
    };
  } else if (elapsed > 16000) {
    status = "destination_confirmed";
    destinationTxHash = `0x${jobId.replace("job_", "").padEnd(64, "a")}`;
    lzTracking = {
      ...lzTracking,
      lzStatus: "lz_delivered",
      rawStatus: "DELIVERED",
      dstTxHash: destinationTxHash,
      composeStatus: "NOT_EXECUTED",
      lzCreated: (createdAt ?? Date.now()) - 16000,
      lzUpdated: Date.now(),
    };
  } else if (elapsed > 8000) {
    status = "lz_pending";
    lzTracking = {
      ...lzTracking,
      lzStatus: "lz_inflight",
      rawStatus: "INFLIGHT",
      composeStatus: "UNKNOWN",
      lzCreated: (createdAt ?? Date.now()) - 8000,
      lzUpdated: Date.now(),
    };
  } else if (elapsed > 3000) {
    // LZ has started indexing
    lzTracking = {
      ...lzTracking,
      lzStatus: "lz_indexing",
      rawStatus: "CONFIRMING",
      composeStatus: "UNKNOWN",
      lzCreated: (createdAt ?? Date.now()) - 3000,
      lzUpdated: Date.now(),
    };
  } else {
    // Still very early
    lzTracking = {
      ...lzTracking,
      lzStatus: "lz_indexing",
      composeStatus: "UNKNOWN",
    };
  }

  return {
    status,
    sourceTxHash: `0x${jobId.replace("job_", "").padEnd(64, "b")}`,
    backendProcessTxHash,
    lzMessageId: guid,
    lzTxHash: backendProcessTxHash,
    destinationTxHash,
    lzTracking,
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

  const tsMatch = jobId.match(/job_(\d+)_/);
  const createdAt = tsMatch ? parseInt(tsMatch[1], 10) : undefined;
  const simulated = getSimulatedStatus(jobId, createdAt);

  return NextResponse.json(simulated);
}
