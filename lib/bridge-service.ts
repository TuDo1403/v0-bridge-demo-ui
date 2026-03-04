import type {
  VaultFundedRequest,
  PermitProcessRequest,
  BridgeProcessResponse,
  BridgeStatusResponse,
  TxHashPair,
  HistoryResponse,
  LzTrackingSnapshot,
} from "./types";

const API_BASE = "/api/bridge";
const LZ_API = "/api/lz";

/** Parse error body from a failed API response and throw */
async function throwApiError(res: Response, fallback: string): never {
  const err = await res.json().catch(() => ({ error: "Unknown error" }));
  throw new Error(err.error ?? `${fallback}: ${res.status}`);
}

/** Submit a vault-funded bridge request. */
export async function submitVaultFunded(
  req: VaultFundedRequest
): Promise<BridgeProcessResponse> {
  const res = await fetch(`${API_BASE}/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    if (res.status === 409) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error ?? "Duplicate transfer already submitted");
    }
    await throwApiError(res, "Bridge process failed");
  }

  return res.json();
}

/** Submit a permit2 bridge request. */
export async function submitPermit(
  req: PermitProcessRequest
): Promise<BridgeProcessResponse> {
  const res = await fetch(`${API_BASE}/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    if (res.status === 409) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error ?? "Duplicate transfer already submitted");
    }
    await throwApiError(res, "Bridge process failed");
  }

  return res.json();
}

export async function pollBridgeStatus(
  jobId: string
): Promise<BridgeStatusResponse> {
  const res = await fetch(
    `${API_BASE}/status?jobId=${encodeURIComponent(jobId)}`
  );

  if (!res.ok) await throwApiError(res, "Status poll failed");
  return res.json();
}

/**
 * Look up a bridge by any associated tx hash.
 * Returns a lightweight TxHashPair, or null if not found.
 */
export async function lookupByTxHash(
  txHash: string
): Promise<TxHashPair | null> {
  const res = await fetch(
    `${API_BASE}/status-tx?txHash=${encodeURIComponent(txHash)}`
  );

  if (res.status === 404) return null;
  if (!res.ok) await throwApiError(res, "Lookup failed");
  return res.json();
}

/**
 * Fetch paginated bridge history for an address.
 * Returns { items: TxHashPair[], total, limit, offset }.
 */
export async function fetchHistory(
  address: string,
  limit = 5,
  offset = 0,
  srcEid?: number,
  dstEid?: number
): Promise<HistoryResponse> {
  const params = new URLSearchParams({
    address,
    limit: String(limit),
    offset: String(offset),
  });
  if (srcEid) params.set("srcEid", String(srcEid));
  if (dstEid) params.set("dstEid", String(dstEid));

  const res = await fetch(`${API_BASE}/history?${params.toString()}`);

  if (!res.ok) await throwApiError(res, "History fetch failed");
  return res.json();
}

/**
 * Compute a deposit/withdraw vault address via the backend API.
 * Supports both metamask→metamask (srcAddr = connected wallet)
 * and CEX→metamask (srcAddr == dstAddr) flows.
 */
export async function getDepositAddress(params: {
  srcEid: number;
  dstEid: number;
  srcAddr: string;
  dstAddr: string;
  dappId: number;
}): Promise<{ depositAddress: string }> {
  const res = await fetch(`${API_BASE}/address`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) await throwApiError(res, "Deposit address lookup failed");
  return res.json();
}

export function isTerminalStatus(status: string): boolean {
  return status === "completed" || status === "error" || status === "failed";
}

/* ------------------------------------------------------------------ */
/*  LZ Scan polling for self-bridge sessions                          */
/* ------------------------------------------------------------------ */

/** Normalise raw LZ Scan status to our internal lzStatus values */
function normalizeLzStatus(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.toUpperCase();
  if (s === "DELIVERED") return "lz_delivered";
  if (s === "INFLIGHT") return "lz_inflight";
  if (s === "CONFIRMING" || s === "PENDING") return "lz_pending";
  if (s === "FAILED" || s === "BLOCKED") return "lz_failed";
  return `lz_${raw.toLowerCase()}`;
}

/** Normalise compose status to our conventions (SUCCEEDED | FAILED | NOT_EXECUTED | UNKNOWN)
 *  LZ Scan API v1 values: WAITING | VALIDATING_TX | SUCCEEDED | N/A | FAILED |
 *  SIMULATION_REVERTED | WAITING_FOR_COMPOSE_SENT_EVENT
 */
function normalizeComposeStatus(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.toUpperCase();
  if (s === "SUCCEEDED" || s === "EXECUTED") return "SUCCEEDED";
  if (s === "FAILED" || s === "SIMULATION_REVERTED") return "FAILED";
  if (s === "N/A") return "NOT_EXECUTED";
  if (s === "WAITING" || s === "VALIDATING_TX" || s === "WAITING_FOR_COMPOSE_SENT_EVENT") return raw.toUpperCase();
  // Generic fallback
  if (s.includes("SUCCEED") || s.includes("SUCCESS")) return "SUCCEEDED";
  if (s.includes("FAIL") || s.includes("REVERT")) return "FAILED";
  return raw.toUpperCase();
}

/**
 * Poll LZ Scan for message status by source tx hash.
 * Uses our /api/lz/lookup proxy. Returns null if message not indexed yet.
 */
export async function pollLzScan(
  txHash: string,
  net: "testnet" | "mainnet" = "testnet"
): Promise<LzTrackingSnapshot | null> {
  const res = await fetch(
    `${LZ_API}/lookup?hash=${encodeURIComponent(txHash)}&net=${net}`
  );

  if (res.status === 404) return null;
  if (!res.ok) return null;

  const body = await res.json();
  const messages = body?.messages;

  if (!Array.isArray(messages) || messages.length === 0) return null;

  // Use the first (most recent) message
  const msg = messages[0];

  const lzStatus = normalizeLzStatus(msg.status?.name ?? msg.status);

  // Extract compose info from destination.lzCompose (LZ Scan API v1 shape)
  let composeStatus: string | undefined;
  let composeTxHash: string | undefined;
  const lzCompose = msg.destination?.lzCompose;
  if (lzCompose) {
    composeStatus = normalizeComposeStatus(lzCompose.status);
    // Successful compose txs
    if (Array.isArray(lzCompose.txs) && lzCompose.txs.length > 0) {
      composeTxHash = lzCompose.txs[0]?.txHash;
    }
    // Failed compose txs
    if (!composeTxHash && Array.isArray(lzCompose.failedTx) && lzCompose.failedTx.length > 0) {
      composeTxHash = lzCompose.failedTx[0]?.txHash;
    }
  }
  // Fallback: older pathway.compose shape
  if (!composeStatus && Array.isArray(msg.pathway?.compose)) {
    const compose = msg.pathway.compose[0];
    composeStatus = normalizeComposeStatus(compose?.status?.name ?? compose?.status);
    composeTxHash = composeTxHash ?? compose?.destination?.tx?.txHash;
  }

  return {
    guid: msg.guid,
    lzStatus,
    srcTxHash: msg.source?.tx?.txHash ?? txHash,
    dstTxHash: msg.destination?.tx?.txHash,
    srcEid: msg.pathway?.srcEid ?? msg.srcEid,
    dstEid: msg.pathway?.dstEid ?? msg.dstEid,
    sender: msg.source?.sender ?? msg.sender,
    receiver: msg.destination?.receiver ?? msg.receiver,
    composeStatus,
    composeTxHash,
    rawStatus: msg.status?.name ?? msg.status,
    lzCreated: msg.created ? new Date(msg.created).getTime() : undefined,
    lzUpdated: msg.updated ? new Date(msg.updated).getTime() : Date.now(),
  };
}
