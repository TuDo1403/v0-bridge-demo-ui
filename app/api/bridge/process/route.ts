import { NextResponse } from "next/server";
import { proxyBridgeApi } from "@/lib/api-proxy";

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const net = searchParams.get("net") ?? "mainnet";
    const body = await request.json();

    // Route to the correct backend endpoint based on request shape
    if (body.permit && typeof body.permit === "object") {
      // Permit2 flow
      const required = ["srcEid", "dstEid", "token", "sender", "receiver", "amount"];
      for (const field of required) {
        if (!body[field]) {
          return NextResponse.json(
            { error: `Missing required field: ${field}` },
            { status: 400 }
          );
        }
      }

      return proxyBridgeApi("/v1/bridge/process/permit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          srcEid: body.srcEid,
          dstEid: body.dstEid,
          token: body.token,
          sender: body.sender,
          receiver: body.receiver,
          amount: body.amount,
          dappId: body.dappId ?? 0,
          permit: body.permit,
        }),
      }, net);
    }

    // Vault-funded flow
    const required = ["srcEid", "dstEid", "userTransferTxHash", "token", "receiver"];
    for (const field of required) {
      if (!body[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    return proxyBridgeApi("/v1/bridge/process/vault-funded", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        srcEid: body.srcEid,
        dstEid: body.dstEid,
        userTransferTxHash: body.userTransferTxHash,
        token: body.token,
        receiver: body.receiver,
        dappId: body.dappId ?? 0,
      }),
    }, net);
  } catch (err) {
    console.error("[bridge/process] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
