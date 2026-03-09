import { proxyBridgeApi } from "@/lib/api-proxy";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const range_ = searchParams.get("range") ?? "all";
  const net = searchParams.get("net") ?? "mainnet";
  return proxyBridgeApi(
    `/v1/bridge/stats/summary?range=${encodeURIComponent(range_)}`,
    undefined,
    net,
  );
}
