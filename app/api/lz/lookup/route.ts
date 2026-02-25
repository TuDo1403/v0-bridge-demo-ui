import { NextRequest, NextResponse } from "next/server";

const LZ_API = "https://scan-testnet.layerzero-api.com/v1";

/**
 * Server-side proxy to the LayerZero Scan API.
 * Accepts ?hash=<txHash|guid> and tries both lookup endpoints.
 */
export async function GET(req: NextRequest) {
  const hash = req.nextUrl.searchParams.get("hash")?.trim();
  if (!hash) {
    return NextResponse.json({ error: "Missing hash param" }, { status: 400 });
  }

  const headers = { Accept: "application/json" };
  const timeout = 10_000;

  // Determine if this looks like a GUID (starts with 0x and 66 chars = bytes32) or tx hash
  const isGuid = hash.startsWith("0x") && hash.length === 66;

  // Try both endpoints in order — GUID first if it looks like one, tx hash otherwise
  const endpoints = isGuid
    ? [
        `${LZ_API}/messages/guid/${hash}`,
        `${LZ_API}/messages/tx/${hash}`,
      ]
    : [
        `${LZ_API}/messages/tx/${hash}`,
        `${LZ_API}/messages/guid/${hash}`,
      ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(timeout),
      });
      if (!res.ok) continue;

      const body = await res.json();
      const messages = body?.data ?? body?.messages ?? body;

      if (Array.isArray(messages) && messages.length > 0) {
        return NextResponse.json({ messages });
      }
      if (messages && typeof messages === "object" && messages.guid) {
        return NextResponse.json({ messages: [messages] });
      }
    } catch {
      continue;
    }
  }

  return NextResponse.json({ messages: [], notFound: true }, { status: 404 });
}
