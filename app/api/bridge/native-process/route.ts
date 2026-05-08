import { NextResponse } from "next/server";
import { proxyBridgeApi } from "@/lib/api-proxy";

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const net = searchParams.get("net") ?? "mainnet";

  const body = await request.text();
  try {
    return proxyBridgeApi(
      `/v1/bridge/native/process`,
      {
        method: "POST",
        body,
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      },
      net,
    );
  } catch (err) {
    console.error("[bridge/native-process] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
