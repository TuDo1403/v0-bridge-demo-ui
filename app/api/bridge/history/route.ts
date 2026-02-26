import { NextResponse } from "next/server";

const BRIDGE_API = "https://bridge-api.tudm.net";
const API_KEY = process.env.BRIDGE_API_KEY ?? "";

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
    const url = new URL(
      `${BRIDGE_API}/v1/bridge/history/${encodeURIComponent(address)}`
    );
    url.searchParams.set("limit", limit);
    url.searchParams.set("offset", offset);

    const res = await fetch(url.toString(), {
      headers: { "X-API-Key": API_KEY },
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error ?? `Bridge API error: ${res.status}` },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[bridge/history] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
