import { NextResponse } from "next/server";
import { proxyBridgeApi } from "@/lib/api-proxy";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const eid = searchParams.get("eid");
  const vaultAddress = searchParams.get("vaultAddress");
  const token = searchParams.get("token");
  const net = searchParams.get("net") ?? "mainnet";

  if (!eid || !vaultAddress || !token) {
    return NextResponse.json(
      { error: "Missing eid, vaultAddress, or token parameter" },
      { status: 400 }
    );
  }

  try {
    return proxyBridgeApi(
      `/v1/bridge/status/vault/${encodeURIComponent(eid)}/${encodeURIComponent(vaultAddress)}?token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
      net,
    );
  } catch (err) {
    console.error("[bridge/vault-status] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
