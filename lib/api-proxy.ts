import { NextResponse } from "next/server";

const BRIDGE_API = process.env.BRIDGE_API_URL ?? "http://127.0.0.1:8080";
const API_KEY = process.env.BRIDGE_API_KEY ?? "";

/**
 * Shared proxy helper for all bridge API routes.
 * Handles headers, error parsing, and consistent error responses.
 */
export async function proxyBridgeApi(
  path: string,
  init?: RequestInit
): Promise<NextResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.BRIDGE_API_TIMEOUT ?? 8000));

  try {
    const res = await fetch(`${BRIDGE_API}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "X-API-Key": API_KEY,
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
