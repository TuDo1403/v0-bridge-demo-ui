import { NextResponse } from "next/server";
import { proxyBridgeApi } from "@/lib/api-proxy";

/**
 * GET /api/bridge/history?address=0x...&limit=5&offset=0&srcEid=40161&dstEid=40438
 *
 * Proxies to backend: GET /v1/bridge/history/{address}?limit=&offset=&srcEid=&dstEid=
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  const limit = searchParams.get("limit") ?? "5";
  const offset = searchParams.get("offset") ?? "0";
  const srcEid = searchParams.get("srcEid");
  const dstEid = searchParams.get("dstEid");

  if (!address) {
    return NextResponse.json(
      { error: "Missing address parameter" },
      { status: 400 }
    );
  }

  try {
    const params = new URLSearchParams({ limit, offset });
    if (srcEid) params.set("srcEid", srcEid);
    if (dstEid) params.set("dstEid", dstEid);
    return proxyBridgeApi(
      `/v1/bridge/history/${encodeURIComponent(address)}?${params}`,
      { cache: "no-store" }
    );
  } catch (err) {
    console.error("[bridge/history] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
