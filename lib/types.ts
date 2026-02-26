/* ------------------------------------------------------------------ */
/*  Bridge status state machine                                        */
/* ------------------------------------------------------------------ */

export type BridgeStatus =
  | "idle"
  | "awaiting_transfer"
  | "transfer_submitted"
  | "transfer_mined"
  | "deposit_verified"
  | "source_verified"
  | "bridge_submitted"
  | "bridge_mined"
  | "backend_submitted"     // legacy alias
  | "lz_indexing"
  | "lz_pending"
  | "destination_confirmed"
  | "completed"
  | "failed"
  | "error";

export const STATUS_LABELS: Record<BridgeStatus, string> = {
  idle: "Ready",
  awaiting_transfer: "Awaiting Transfer",
  transfer_submitted: "Tx Submitted",
  transfer_mined: "Tx Mined",
  deposit_verified: "Deposit Verified",
  source_verified: "Source Verified",
  bridge_submitted: "Bridge Submitted",
  bridge_mined: "Bridge Mined",
  backend_submitted: "Processing",
  lz_indexing: "LZ Indexing",
  lz_pending: "LZ Pending",
  destination_confirmed: "Destination Confirmed",
  completed: "Completed",
  failed: "Failed",
  error: "Error",
};

export const STATUS_ORDER: BridgeStatus[] = [
  "idle",
  "awaiting_transfer",
  "transfer_submitted",
  "transfer_mined",
  "deposit_verified",
  "source_verified",
  "bridge_submitted",
  "bridge_mined",
  "lz_indexing",
  "lz_pending",
  "destination_confirmed",
  "completed",
];

/** Map backend job status to our BridgeStatus */
export function mapBackendStatus(backendStatus: string): BridgeStatus {
  const map: Record<string, BridgeStatus> = {
    source_verified: "source_verified",
    bridge_submitted: "bridge_submitted",
    bridge_mined: "bridge_mined",
    lz_indexing: "lz_indexing",
    lz_pending: "lz_pending",
    completed: "completed",
    failed: "failed",
  };
  return map[backendStatus] ?? "error";
}

/* ------------------------------------------------------------------ */
/*  API types                                                          */
/* ------------------------------------------------------------------ */

/* -- Request to our Next.js proxy (client -> proxy) -- */
export interface BridgeProcessRequest {
  sourceChainId: number;
  userTransferTxHash: string;
  token: string;           // token contract address on source chain
  receiver: string;        // user's receiving address on dest chain
  composer: string;        // composer contract address (allowlisted)
  composeMsg: string;      // hex-encoded compose message
}

/* -- Response from our Next.js proxy after POST /v1/bridge/process -- */
export interface BridgeProcessResponse {
  jobId: string;
  status: string;
  depositAddress: string;
  backendProcessTxHash: string | null;
}

/* -- Response from GET /v1/bridge/status/{jobId} -- */
export interface BridgeStatusResponse {
  jobId: string;
  status: BackendJobStatus;
  userTransferTxHash: string;
  backendProcessTxHash: string | null;
  lzMessageId: string | null;
  destinationTxHash: string | null;
  composeStatus: string | null;
  composeTxHash: string | null;
  sender: string | null;
  receiver: string;
  token: string;
  amount: string;
  feeAmount: string | null;
  netAmount: string | null;
  sourceChainId: number;
  dstChainId: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export type BackendJobStatus =
  | "source_verified"
  | "bridge_submitted"
  | "bridge_mined"
  | "lz_indexing"
  | "lz_pending"
  | "completed"
  | "failed";

/* ------------------------------------------------------------------ */
/*  Session (persisted in localStorage)                                */
/* ------------------------------------------------------------------ */

export interface LzTrackingSnapshot {
  guid?: string;
  lzStatus?: string;          // normalised: lz_indexing | lz_inflight | lz_delivered | lz_failed
  srcTxHash?: string;
  dstTxHash?: string;
  srcEid?: number;
  dstEid?: number;
  sender?: string;
  receiver?: string;
  composeStatus?: string;     // SUCCEEDED | FAILED | NOT_EXECUTED | UNKNOWN
  composeTxHash?: string;
  rawStatus?: string;
  lzCreated?: number;
  lzUpdated?: number;
}

export interface BridgeSession {
  id: string;
  createdAt: number;
  sourceChainId: number;
  destChainId: number;
  tokenKey: string;
  amount: string;
  userAddress: string;
  depositAddress: string;
  status: BridgeStatus;
  userTransferTxHash?: string;
  jobId?: string;
  backendProcessTxHash?: string;
  lzMessageId?: string;
  lzTxHash?: string;
  destinationTxHash?: string;
  error?: string;
  /** Composer contract address (needed for retry if backend lost it) */
  composer?: string;
  /** Hex-encoded compose message (needed for retry if backend lost it) */
  composeMsg?: string;
  /** LayerZero tracking data merged from LZ Scan API */
  lzTracking?: LzTrackingSnapshot;
}

/* ------------------------------------------------------------------ */
/*  Compose failure detection (shared across components)               */
/* ------------------------------------------------------------------ */

export function isComposeFailed(session: {
  lzTracking?: LzTrackingSnapshot;
  error?: string;
  status?: string;
}): boolean {
  const cs = session.lzTracking?.composeStatus?.toLowerCase() ?? "";
  if (cs.includes("fail") || cs.includes("revert")) return true;
  if (session.error?.toLowerCase().includes("compose")) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/*  Contract error mapping                                             */
/* ------------------------------------------------------------------ */

export const CONTRACT_ERROR_MAP: Record<string, string> = {
  EmptyComposeMsg:
    "Compose message cannot be empty. This is a configuration error.",
  ComposeMsgTooLarge:
    "Compose message exceeds the maximum allowed size.",
  ZeroBridgeAmount:
    "Bridge amount is zero after OFT dust removal. Try a larger amount.",
};
