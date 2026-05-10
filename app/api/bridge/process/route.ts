import { NextResponse } from "next/server";
import { proxyBridgeApi } from "@/lib/api-proxy";

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const net = searchParams.get("net") ?? "mainnet";
    const body = await request.json();

    if (body.permit && typeof body.permit === "object") {
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

    return NextResponse.json(
      { error: "vault-funded jobs are created by the event indexer; poll by tx hash instead" },
      { status: 410 }
    );
  } catch (err) {
    console.error("[bridge/process] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
