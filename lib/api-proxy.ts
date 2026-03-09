import { NextResponse } from "next/server";

const BRIDGE_API_MAINNET = process.env.BRIDGE_API_URL_MAINNET ?? process.env.BRIDGE_API_URL ?? "http://127.0.0.1:8080";
const BRIDGE_API_TESTNET = process.env.BRIDGE_API_URL_TESTNET ?? process.env.BRIDGE_API_URL ?? "http://127.0.0.1:8080";
const API_KEY_MAINNET = process.env.BRIDGE_API_KEY_MAINNET ?? process.env.BRIDGE_API_KEY ?? "";
const API_KEY_TESTNET = process.env.BRIDGE_API_KEY_TESTNET ?? process.env.BRIDGE_API_KEY ?? "";

function getBaseUrl(network?: string): string {
  return network === "testnet" ? BRIDGE_API_TESTNET : BRIDGE_API_MAINNET;
}

function getApiKey(network?: string): string {
  return network === "testnet" ? API_KEY_TESTNET : API_KEY_MAINNET;
}

/**
 * Shared proxy helper for all bridge API routes.
 * Handles headers, error parsing, and consistent error responses.
 * Pass `network` ("mainnet" | "testnet") to route to the correct backend.
 */
export async function proxyBridgeApi(
  path: string,
  init?: RequestInit,
  network?: string,
): Promise<NextResponse> {
  const baseUrl = getBaseUrl(network);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.BRIDGE_API_TIMEOUT ?? 8000));

  const url = `${baseUrl}${path}`;

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "X-API-Key": getApiKey(network),
        ...init?.headers,
      },
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
    if (err instanceof DOMException && err.name === "AbortError") {
      return NextResponse.json(
        { error: "Backend API timeout — is the backend running?" },
        { status: 504 }
      );
    }
    // Connection refused or other network errors
    return NextResponse.json(
      { error: "Backend API unreachable — is the backend running?" },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
