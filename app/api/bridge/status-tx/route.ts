import { NextResponse } from "next/server";

const BRIDGE_API = "https://bridge-api.tudm.net";
const API_KEY = process.env.BRIDGE_API_KEY ?? "";

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
    const res = await fetch(
      `${BRIDGE_API}/v1/bridge/status/tx/${encodeURIComponent(txHash)}`,
      {
        headers: { "X-API-Key": API_KEY },
        cache: "no-store",
      }
    );

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error ?? `Bridge API error: ${res.status}` },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[bridge/status-tx] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
