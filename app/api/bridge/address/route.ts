import { NextResponse } from "next/server";
import { proxyBridgeApi } from "@/lib/api-proxy";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const required = ["sourceChainId", "receiver"];
    for (const field of required) {
      if (!body[field]) {
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
        sourceChainId: body.sourceChainId,
        receiver: body.receiver,
      }),
    });
  } catch (err) {
    console.error("[bridge/address] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
