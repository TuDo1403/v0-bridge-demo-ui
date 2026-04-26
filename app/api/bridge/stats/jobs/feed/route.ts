import { NextResponse } from "next/server";
import { proxyBridgeApi } from "@/lib/api-proxy";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // Reject unexpected `net` values up front so a malformed param can't
  // silently fall back to the mainnet backend (defence in depth — the
  // proxy currently routes anything other than "testnet" to mainnet).
  const net = searchParams.get("net") ?? "mainnet";
  if (net !== "mainnet" && net !== "testnet") {
    return NextResponse.json({ error: "Invalid network" }, { status: 400 });
  }

  const params = new URLSearchParams();
  for (const key of ["address", "vaultAddress", "status", "direction", "range", "limit", "offset"]) {
    const v = searchParams.get(key);
    if (v) params.set(key, v);
  }

  return proxyBridgeApi(
    `/v1/bridge/stats/jobs/feed?${params}`,
    { cache: "no-store" },
    net,
  );
}
