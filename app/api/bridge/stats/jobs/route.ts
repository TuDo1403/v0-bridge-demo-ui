import { proxyBridgeApi } from "@/lib/api-proxy";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const range_ = searchParams.get("range") ?? "24h";
  const net = searchParams.get("net") ?? "mainnet";
  return proxyBridgeApi(
    `/v1/bridge/stats/jobs?range=${encodeURIComponent(range_)}`,
    undefined,
    net,
  );
}
