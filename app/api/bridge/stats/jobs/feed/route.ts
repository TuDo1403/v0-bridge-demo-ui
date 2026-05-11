import { NextResponse } from "next/server";
import { proxyBridgeApi } from "@/lib/api-proxy";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const net = searchParams.get("net");
  if (net !== "mainnet" && net !== "testnet") {
    return NextResponse.json({ error: "Invalid net param" }, { status: 400 });
  }

  const params = new URLSearchParams();
  for (const key of ["address", "vaultAddress", "token", "status", "direction", "range", "limit", "offset", "id"]) {
    const v = searchParams.get(key);
    if (v) params.set(key, v);
  }

  return proxyBridgeApi(
    `/v1/bridge/stats/jobs/feed?${params}`,
    { cache: "no-store" },
    net,
  );
}
