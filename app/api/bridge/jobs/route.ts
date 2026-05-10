import { NextResponse } from "next/server";
import { proxyBridgeApi } from "@/lib/api-proxy";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const net = searchParams.get("net") ?? "mainnet";
  searchParams.delete("net");

  if (!searchParams.get("txHash") && !searchParams.get("address")) {
    return NextResponse.json({ error: "txHash or address is required" }, { status: 400 });
  }

  try {
    return proxyBridgeApi(
      `/v1/bridge/jobs?${searchParams.toString()}`,
      { cache: "no-store" },
      net,
    );
  } catch (err) {
    console.error("[bridge/jobs] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
