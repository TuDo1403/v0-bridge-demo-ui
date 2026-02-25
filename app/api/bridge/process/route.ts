import { NextResponse } from "next/server";
import type { BridgeProcessRequest, BridgeProcessResponse } from "@/lib/types";

/**
 * Mock bridge process API.
 * In production, replace with real backend call.
 */

// In-memory mock job store
const jobs = new Map<
  string,
  {
    status: string;
    sourceTxHash: string;
    backendProcessTxHash: string;
    lzMessageId: string;
    lzTxHash: string;
    destinationTxHash?: string;
    createdAt: number;
  }
>();

// Export for status route to use
export { jobs };

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BridgeProcessRequest;

    // Validate required fields
    if (
      !body.sourceChainId ||
      !body.dstChainId ||
      !body.token ||
      !body.amount ||
      !body.userAddress ||
      !body.depositAddress ||
      !body.userTransferTxHash
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const backendProcessTxHash = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;
    const lzMessageId = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;
    const lzTxHash = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;

    jobs.set(jobId, {
      status: "backend_submitted",
      sourceTxHash: body.userTransferTxHash,
      backendProcessTxHash,
      lzMessageId,
      lzTxHash,
      createdAt: Date.now(),
    });

    // Simulate progression: after 8s -> lz_pending, 16s -> destination_confirmed, 20s -> completed
    setTimeout(() => {
      const job = jobs.get(jobId);
      if (job && job.status === "backend_submitted") {
        job.status = "lz_pending";
      }
    }, 8000);

    setTimeout(() => {
      const job = jobs.get(jobId);
      if (job && job.status === "lz_pending") {
        job.status = "destination_confirmed";
        job.destinationTxHash = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;
      }
    }, 16000);

    setTimeout(() => {
      const job = jobs.get(jobId);
      if (job && job.status === "destination_confirmed") {
        job.status = "completed";
      }
    }, 20000);

    const response: BridgeProcessResponse = {
      jobId,
      backendProcessTxHash,
      lzMessageId,
      lzTxHash,
      status: "backend_submitted",
    };

    return NextResponse.json(response);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
