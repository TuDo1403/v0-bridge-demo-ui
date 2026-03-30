import { NextRequest } from "next/server";
import { proxyBridgeApi } from "@/lib/api-proxy";

/**
 * GET /api/bridge/config?net=mainnet
 *
 * Proxies to backend: GET /v1/bridge/config
 * Returns the full bridge configuration snapshot (chains, tokens, dapps, routes, fees).
 * Supports ETag/If-None-Match for cache validation.
 */
export async function GET(req: NextRequest) {
  const net = req.nextUrl.searchParams.get("net") ?? "mainnet";
  return proxyBridgeApi("/v1/bridge/config", { cache: "no-store" }, net);
}
