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

export function isTerminalStatus(status: string): boolean {
  return status === "completed" || status === "error" || status === "failed";
}
