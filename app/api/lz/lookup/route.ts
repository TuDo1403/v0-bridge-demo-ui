import { NextRequest, NextResponse } from "next/server";

const LZ_TESTNET_API = process.env.LZ_SCAN_API_TESTNET ?? "https://scan-testnet.layerzero-api.com/v1";
const LZ_MAINNET_API = process.env.LZ_SCAN_API_MAINNET ?? "https://scan.layerzero-api.com/v1";

/**
 * Server-side proxy for LayerZero Scan API.
 * Accepts ?hash=<txHash|guid>&net=testnet|mainnet
 * Tries /messages/tx/{hash} first, then /messages/guid/{hash}.
 */
export async function GET(req: NextRequest) {
  const hash = req.nextUrl.searchParams.get("hash")?.trim();
  if (!hash) {
    return NextResponse.json({ error: "Missing hash param" }, { status: 400 });
  }

  const net = req.nextUrl.searchParams.get("net")?.trim() ?? "testnet";
  const base = net === "mainnet" ? LZ_MAINNET_API : LZ_TESTNET_API;

  // Always try tx hash first, then GUID
  const urls = [
    `${base}/messages/tx/${hash}`,
    `${base}/messages/guid/${hash}`,
  ];

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);

      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        console.log(`[v0] LZ proxy: ${url} => ${res.status}`);
        continue;
      }

      const body = await res.json();

      // The API returns { data: [...] } for /messages/tx/
      // and a single object or { data: [...] } for /messages/guid/
      const messages = body?.data ?? body?.messages;

      if (Array.isArray(messages) && messages.length > 0) {
        return NextResponse.json({ messages });
      }

      // Single object response (guid lookup sometimes returns this)
      if (body && typeof body === "object" && body.guid) {
        return NextResponse.json({ messages: [body] });
      }

      if (messages && typeof messages === "object" && !Array.isArray(messages) && messages.guid) {
        return NextResponse.json({ messages: [messages] });
      }

      console.log(`[v0] LZ proxy: ${url} => OK but no messages in body`);
    } catch (err) {
      console.log(`[v0] LZ proxy: ${url} => error:`, err instanceof Error ? err.message : err);
      continue;
    }
  }

  return NextResponse.json(
    { messages: [], notFound: true },
    { status: 404 }
  );
}
