import type {
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
async function throwApiError(res: Response, fallback: string): Promise<never> {
  const err = await res.json().catch(() => ({ error: "Unknown error" }));
  throw new Error(err.error ?? `${fallback}: ${res.status}`);
}

/** Submit a permit2 bridge request. */
export async function submitPermit(
  req: PermitProcessRequest,
  network: "mainnet" | "testnet" = "mainnet"
): Promise<BridgeProcessResponse> {
  const res = await fetch(`${API_BASE}/process?net=${network}`, {
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
  jobId: string,
  network: "mainnet" | "testnet" = "mainnet"
): Promise<BridgeStatusResponse> {
  const res = await fetch(
    `${API_BASE}/status?jobId=${encodeURIComponent(jobId)}&net=${network}`
  );

  if (!res.ok) await throwApiError(res, "Status poll failed");
  return res.json();
}

/**
 * Look up a bridge by any associated tx hash.
 * Returns a lightweight TxHashPair, or null if not found.
 */
export async function lookupByTxHash(
  txHash: string,
  network: "mainnet" | "testnet" = "mainnet"
): Promise<TxHashPair | null> {
  const res = await fetch(
    `${API_BASE}/status-tx?txHash=${encodeURIComponent(txHash)}&net=${network}`
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
  dstEid?: number,
  dappId?: number,
  network: "mainnet" | "testnet" = "mainnet"
): Promise<HistoryResponse> {
  const params = new URLSearchParams({
    address,
    limit: String(limit),
    offset: String(offset),
    net: network,
  });
  if (srcEid) params.set("srcEid", String(srcEid));
  if (dstEid) params.set("dstEid", String(dstEid));
  if (dappId !== undefined) params.set("dappId", String(dappId));

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
  direction: string;
  network?: "mainnet" | "testnet";
}): Promise<{ address: string }> {
  const net = params.network ?? "mainnet";
  const res = await fetch(`${API_BASE}/address?net=${net}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      srcEid: params.srcEid,
      dstEid: params.dstEid,
      srcAddr: params.srcAddr,
      dstAddr: params.dstAddr,
      dappId: params.dappId,
      direction: params.direction,
    }),
  });

  if (!res.ok) await throwApiError(res, "Deposit address lookup failed");
  return res.json();
}

export function isTerminalStatus(status: string): boolean {
  return status === "completed" || status === "error" || status === "failed" || status === "roundtrip_completed";
}

export interface BridgeJobItem {
  jobId?: string;
  bridgeKind: string;
  status: string;
  phase?: string;
  direction: "deposit" | "withdraw";
  srcEid: number;
  dstEid: number;
  sender: string;
  receiver: string;
  token: string;
  amount: string;
  createdAt: string;
  updatedAt: string;
}

export interface BridgeJobMatchCriteria {
  bridgeKind: "lz" | "native";
  direction?: "deposit" | "withdraw";
  srcEid?: number;
  dstEid?: number;
  sender?: string;
  receiver?: string;
  token?: string;
  amount?: string;
}

export function isNativeBridgeJobKind(kind: string | undefined): boolean {
  return kind === "native_optimism" || kind === "op_stack_native";
}

export function isLayerZeroBridgeJobKind(kind: string | undefined): boolean {
  return !isNativeBridgeJobKind(kind);
}

export function selectUniqueBridgeJobCandidate(
  jobs: BridgeJobItem[],
  criteria: BridgeJobMatchCriteria
): BridgeJobItem | null {
  const matches = jobs.filter((job) => bridgeJobMatches(job, criteria));
  return matches.length === 1 ? matches[0] : null;
}

function bridgeJobMatches(job: BridgeJobItem, criteria: BridgeJobMatchCriteria): boolean {
  if (criteria.bridgeKind === "native" && !isNativeBridgeJobKind(job.bridgeKind)) return false;
  if (criteria.bridgeKind === "lz" && !isLayerZeroBridgeJobKind(job.bridgeKind)) return false;
  if (!matchString(job.direction, criteria.direction)) return false;
  if (!matchNumber(job.srcEid, criteria.srcEid)) return false;
  if (!matchNumber(job.dstEid, criteria.dstEid)) return false;
  if (!matchAddress(job.sender, criteria.sender)) return false;
  if (!matchAddress(job.receiver, criteria.receiver)) return false;
  if (!matchAddress(job.token, criteria.token)) return false;
  if (!matchString(job.amount, criteria.amount)) return false;
  return true;
}

function matchNumber(actual: number | undefined, expected: number | undefined): boolean {
  return expected == null || actual === expected;
}

function matchString(actual: string | undefined, expected: string | undefined): boolean {
  return expected == null || actual === expected;
}

function matchAddress(actual: string | undefined, expected: string | undefined): boolean {
  return expected == null || normalizeAddress(actual) === normalizeAddress(expected);
}

function normalizeAddress(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

export async function lookupBridgeJobsByTxHash(
  txHash: string,
  network: "mainnet" | "testnet" = "mainnet"
): Promise<BridgeJobItem[]> {
  const params = new URLSearchParams({ txHash, net: network });
  const res = await fetch(`${API_BASE}/jobs?${params.toString()}`);
  if (!res.ok) await throwApiError(res, "Bridge job lookup failed");
  const body = await res.json();
  return Array.isArray(body.items) ? body.items : [];
}

// ──────────────────────────────────────────────────────────────────────────
// OP Stack native bridge endpoints
// ──────────────────────────────────────────────────────────────────────────

/** Shape returned by the BE for a native bridge job. Matches repo.NativeJobView. */
export interface NativeJobView {
  jobId: string;
  bridgeKind: string;
  direction: "deposit" | "withdraw";
  status: string;
  nativePhase: string;
  srcEid: number;
  dstEid: number;
  sender: string;
  receiver: string;
  amount: string;
  createdAt: string;
  updatedAt: string;
  withdrawal?: {
    withdrawalHash: string;
    nonce: string;
    l2Sender: string;
    target: string;
    value: string;
    gasLimit: string;
    l2BlockNumber: number;
    l2TxHash: string;
    disputeGameAddr?: string;
    disputeGameIndex?: number;
    proveTxHash?: string;
    provenAt?: string;
    proofSubmitter?: string;
    finalizeTxHash?: string;
    finalizedAt?: string;
    targetSimulationRevert?: string;
  };
  deposit?: {
    l1TxHash: string;
    l1BlockNumber: number;
    fromAddr: string;
    toAddr: string;
    value: string;
    l2TxHash?: string;
    l2FinalizedAt?: string;
  };
}

/** Poll a native bridge job by ID. Throws on transport / non-404 server errors;
 *  returns null when the job is not (yet) indexed. */
export async function pollNativeStatus(
  jobId: string,
  network: "mainnet" | "testnet" = "mainnet"
): Promise<NativeJobView | null> {
  const res = await fetch(
    `${API_BASE}/native-status?jobId=${encodeURIComponent(jobId)}&net=${network}`
  );
  if (res.status === 404) return null;
  if (!res.ok) await throwApiError(res, "Native status poll failed");
  return res.json();
}

/** Look up a native bridge job by any associated tx hash (L1 deposit, L2 init,
 *  prove, or finalize). Used by the UI immediately after wallet submission to
 *  start polling before the indexer has caught up. */
export async function lookupNativeByTxHash(
  txHash: string,
  network: "mainnet" | "testnet" = "mainnet"
): Promise<NativeJobView | null> {
  const res = await fetch(
    `${API_BASE}/native-status-tx?txHash=${encodeURIComponent(txHash)}&net=${network}`
  );
  if (res.status === 404) return null;
  if (!res.ok) await throwApiError(res, "Native lookup failed");
  return res.json();
}

/** Fetch native bridge history for an address (deposits + withdrawals). */
export async function fetchNativeHistory(
  address: string,
  limit = 50,
  network: "mainnet" | "testnet" = "mainnet"
): Promise<{ items: NativeJobView[]; count: number }> {
  const params = new URLSearchParams({
    address,
    limit: String(limit),
    net: network,
  });
  const res = await fetch(`${API_BASE}/native-history?${params.toString()}`);
  if (!res.ok) await throwApiError(res, "Native history fetch failed");
  return res.json();
}

/** Response from the vault status endpoint. */
export interface VaultStatusResponse {
  status: string;       // waiting | pending | claimed | submitted | completed | failed
  jobId?: string;
  txHash?: string;      // vault fund tx hash
  bridgeTxHash?: string;
}

/** Poll vault status by vault address and token. */
export async function pollVaultStatus(
  eid: number,
  vaultAddress: string,
  token: string,
  network: "mainnet" | "testnet" = "mainnet"
): Promise<VaultStatusResponse> {
  const params = new URLSearchParams({
    eid: String(eid),
    vaultAddress,
    token,
    net: network,
  });
  const res = await fetch(`${API_BASE}/vault-status?${params.toString()}`);
  if (!res.ok) await throwApiError(res, "Vault status poll failed");
  return res.json();
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
  net: "testnet" | "mainnet" = "mainnet"
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
