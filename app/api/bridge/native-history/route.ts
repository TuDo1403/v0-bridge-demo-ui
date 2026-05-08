import { NextResponse } from "next/server";
import { proxyBridgeApi } from "@/lib/api-proxy";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  const limit = searchParams.get("limit");
  const net = searchParams.get("net") ?? "mainnet";

  if (!address) {
    return NextResponse.json({ error: "Missing address parameter" }, { status: 400 });
  }

  const qs = limit ? `?limit=${encodeURIComponent(limit)}` : "";
  try {
    return proxyBridgeApi(
      `/v1/bridge/native/history/${encodeURIComponent(address)}${qs}`,
      { cache: "no-store" },
      net,
    );
  } catch (err) {
    console.error("[bridge/native-history] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
