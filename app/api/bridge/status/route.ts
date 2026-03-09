import { NextResponse } from "next/server";
import { proxyBridgeApi } from "@/lib/api-proxy";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  const net = searchParams.get("net") ?? "mainnet";

  if (!jobId) {
    return NextResponse.json(
      { error: "Missing jobId parameter" },
      { status: 400 }
    );
  }

  try {
    return proxyBridgeApi(
      `/v1/bridge/status/${encodeURIComponent(jobId)}`,
      { cache: "no-store" },
      net,
    );
  } catch (err) {
    console.error("[bridge/status] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
