import { proxyBridgeApi } from "@/lib/api-proxy";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const range_ = searchParams.get("range") ?? "all";
  return proxyBridgeApi(
    `/v1/bridge/stats/summary?range=${encodeURIComponent(range_)}`,
  );
}
