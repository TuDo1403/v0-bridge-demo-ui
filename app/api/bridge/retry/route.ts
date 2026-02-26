import { NextResponse } from "next/server";
import { proxyBridgeApi } from "@/lib/api-proxy";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const jobId = body.jobId;

    if (!jobId) {
      return NextResponse.json(
        { error: "Missing jobId" },
        { status: 400 }
      );
    }

    const retryBody: Record<string, string> = {};
    if (body.composer) retryBody.composer = body.composer;
    if (body.composeMsg) retryBody.composeMsg = body.composeMsg;

    return proxyBridgeApi(
      `/v1/bridge/retry/${encodeURIComponent(jobId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(retryBody),
      }
    );
  } catch (err) {
    console.error("[bridge/retry] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
