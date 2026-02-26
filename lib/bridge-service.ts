import type {
  BridgeProcessRequest,
  BridgeProcessResponse,
  BridgeStatusResponse,
} from "./types";

const API_BASE = "/api/bridge";

export async function submitBridgeProcess(
  req: BridgeProcessRequest
): Promise<BridgeProcessResponse> {
  const res = await fetch(`${API_BASE}/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    if (res.status === 409) {
      throw new Error(err.error ?? "Duplicate transfer already submitted");
    }
    throw new Error(err.error ?? `Bridge process failed: ${res.status}`);
  }

  return res.json();
}

export async function pollBridgeStatus(
  jobId: string
): Promise<BridgeStatusResponse> {
  const res = await fetch(
    `${API_BASE}/status?jobId=${encodeURIComponent(jobId)}`
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error ?? `Status poll failed: ${res.status}`);
  }

  return res.json();
}

export async function retryBridgeJob(
  jobId: string,
  composeData?: { composer: string; composeMsg: string }
): Promise<BridgeStatusResponse> {
  const res = await fetch(`${API_BASE}/retry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, ...composeData }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error ?? `Retry failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Look up a bridge job by any associated tx hash.
 * Calls GET /v1/bridge/status/tx/{txHash} via our proxy.
 * Returns null if no job matches (404).
 */
export async function lookupByTxHash(
  txHash: string
): Promise<BridgeStatusResponse | null> {
  const res = await fetch(
    `${API_BASE}/status-tx?txHash=${encodeURIComponent(txHash)}`
  );

  if (res.status === 404) return null;

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error ?? `Lookup failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Fetch bridge history for an address.
 * Calls GET /v1/bridge/history/{address} via our proxy.
 */
export async function fetchHistory(
  address: string,
  limit = 20,
  offset = 0
): Promise<BridgeStatusResponse[]> {
  const params = new URLSearchParams({
    address,
    limit: String(limit),
    offset: String(offset),
  });

  const res = await fetch(`${API_BASE}/history?${params.toString()}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error ?? `History fetch failed: ${res.status}`);
  }

  return res.json();
}

export function isTerminalStatus(status: string): boolean {
  return status === "completed" || status === "error" || status === "failed";
}
