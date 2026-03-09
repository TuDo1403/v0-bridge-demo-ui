import { NextResponse } from "next/server";
import { proxyBridgeApi } from "@/lib/api-proxy";

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const net = searchParams.get("net") ?? "mainnet";
    const body = await request.json();

    const required = ["srcEid", "dstEid", "srcAddr", "dstAddr", "dappId", "direction"];
    for (const field of required) {
      if (body[field] === undefined || body[field] === null || body[field] === "") {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    return proxyBridgeApi("/v1/bridge/address", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        srcEid: body.srcEid,
        dstEid: body.dstEid,
        srcAddr: body.srcAddr,
        dstAddr: body.dstAddr,
        dappId: body.dappId,
        direction: body.direction,
      }),
    }, net);
  } catch (err) {
    console.error("[bridge/address] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
