import { proxyBridgeApi } from "@/lib/api-proxy";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const range_ = searchParams.get("range") ?? "30d";
  const groupBy = searchParams.get("groupBy") ?? "day";
  const net = searchParams.get("net") ?? "mainnet";
  return proxyBridgeApi(
    `/v1/bridge/stats/volume?range=${encodeURIComponent(range_)}&groupBy=${encodeURIComponent(groupBy)}`,
    undefined,
    net,
  );
}
