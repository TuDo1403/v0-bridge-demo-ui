import { proxyBridgeApi } from "@/lib/api-proxy";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const net = searchParams.get("net") ?? "mainnet";
  return proxyBridgeApi("/v1/bridge/stats/sync", undefined, net);
}
