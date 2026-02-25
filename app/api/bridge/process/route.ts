import { NextResponse } from "next/server";

const BRIDGE_API = "https://bridge-api.tudm.net";
const API_KEY = process.env.BRIDGE_API_KEY ?? "";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate required fields per the real API
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

    const res = await fetch(`${BRIDGE_API}/v1/bridge/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      body: JSON.stringify({
        sourceChainId: body.sourceChainId,
        userTransferTxHash: body.userTransferTxHash,
        token: body.token,
        receiver: body.receiver,
        composer: body.composer,
        composeMsg: body.composeMsg,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error ?? `Bridge API error: ${res.status}` },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[bridge/process] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
