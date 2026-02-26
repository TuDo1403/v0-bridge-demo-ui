import { NextResponse } from "next/server";
import { proxyBridgeApi } from "@/lib/api-proxy";

/**
 * GET /api/bridge/history?address=0x...&limit=20&offset=0
 *
 * Proxies to backend: GET /v1/bridge/history/{address}?limit=&offset=
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  const limit = searchParams.get("limit") ?? "20";
  const offset = searchParams.get("offset") ?? "0";

  if (!address) {
    return NextResponse.json(
      { error: "Missing address parameter" },
      { status: 400 }
    );
  }

  try {
    const params = new URLSearchParams({ limit, offset });
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
