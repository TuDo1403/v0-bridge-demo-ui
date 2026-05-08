import { NextResponse } from "next/server";
import { proxyBridgeApi } from "@/lib/api-proxy";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const txHash = searchParams.get("txHash");
  const net = searchParams.get("net") ?? "mainnet";

  if (!txHash) {
    return NextResponse.json({ error: "Missing txHash parameter" }, { status: 400 });
  }

  try {
    return proxyBridgeApi(
      `/v1/bridge/native/status/tx/${encodeURIComponent(txHash)}`,
      { cache: "no-store" },
      net,
    );
  } catch (err) {
    console.error("[bridge/native-status-tx] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
