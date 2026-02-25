import { NextResponse } from "next/server";

const BRIDGE_API = "https://bridge-api.tudm.net";
const API_KEY = process.env.BRIDGE_API_KEY ?? "";

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

    // Forward optional composer/composeMsg if provided (backend may need them for retry)
    const retryBody: Record<string, string> = {};
    if (body.composer) retryBody.composer = body.composer;
    if (body.composeMsg) retryBody.composeMsg = body.composeMsg;

    const res = await fetch(
      `${BRIDGE_API}/v1/bridge/retry/${encodeURIComponent(jobId)}`,
      {
        method: "POST",
        headers: {
          "X-API-Key": API_KEY,
          ...(Object.keys(retryBody).length > 0
            ? { "Content-Type": "application/json" }
            : {}),
        },
        ...(Object.keys(retryBody).length > 0
          ? { body: JSON.stringify(retryBody) }
          : {}),
      }
    );

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error ?? `Bridge API error: ${res.status}` },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[bridge/retry] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
