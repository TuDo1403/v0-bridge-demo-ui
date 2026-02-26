import { NextResponse } from "next/server";
import { proxyBridgeApi } from "@/lib/api-proxy";

/**
 * GET /api/bridge/status-tx?txHash=0x...
 *
 * Proxies to backend: GET /v1/bridge/status/tx/{txHash}
 * Matches against userTransferTxHash, backendProcessTxHash,
 * destinationTxHash, and composeTxHash.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const txHash = searchParams.get("txHash");

  if (!txHash) {
    return NextResponse.json(
      { error: "Missing txHash parameter" },
      { status: 400 }
    );
  }

  try {
    return proxyBridgeApi(
      `/v1/bridge/status/tx/${encodeURIComponent(txHash)}`,
      { cache: "no-store" }
    );
  } catch (err) {
    console.error("[bridge/status-tx] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
