import { NextResponse } from "next/server";
import { proxyBridgeApi } from "@/lib/api-proxy";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const required = [
      "sourceChainId",
      "userTransferTxHash",
      "token",
      "receiver",
      "composer",
      "composeMsg",
    ];
    for (const field of required) {
      if (!body[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    return proxyBridgeApi("/v1/bridge/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceChainId: body.sourceChainId,
        userTransferTxHash: body.userTransferTxHash,
        token: body.token,
        receiver: body.receiver,
        composer: body.composer,
        composeMsg: body.composeMsg,
      }),
    });
  } catch (err) {
    console.error("[bridge/process] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
