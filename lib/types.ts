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
  | "recovered"
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
  recovered: "Recovered",
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

/** Map backend job status to our BridgeStatus.
 *  Backend "completed" = source-chain event confirmed (operator TX mined).
 *  Real completion depends on LZ delivery (+ compose for dapp bridges),
 *  so we map it to "bridge_mined" and let LZ polling drive the rest. */
export function mapBackendStatus(backendStatus: string): BridgeStatus {
  const map: Record<string, BridgeStatus> = {
    pending: "bridge_submitted",
    submitted: "bridge_mined",
    completed: "bridge_mined",
    failed: "failed",
  };
  return map[backendStatus] ?? "bridge_submitted";
}

/* ------------------------------------------------------------------ */
/*  API types                                                          */
/* ------------------------------------------------------------------ */

/* -- Request: vault-funded flow (user already transferred tokens to vault) -- */
export interface VaultFundedRequest {
  srcEid: number;
  dstEid: number;
  userTransferTxHash: string;
  token: string;
  receiver: string;
  dappId: number;
}

/* -- Request: permit2 flow (user signed an EIP-712 permit) -- */
export interface PermitProcessRequest {
  srcEid: number;
  dstEid: number;
  token: string;
  sender: string;
  receiver: string;
  amount: string;
  dappId: number;
  permit: {
    deadline: string;
    nonce: string;
    signature: string;
  };
}

/* -- Response from POST /v1/bridge/process/vault-funded or /permit -- */
export interface BridgeProcessResponse {
  jobId: string;
  status: string;
}

/* -- Lightweight tx hash pair returned by history & status-tx endpoints -- */
export interface TxHashPair {
  vault_fund_tx_hash: string | null;
  bridge_tx_hash: string;
  job_id?: string;   // set when matched from job_requests
  status?: string;   // set when matched from job_requests
}

/* -- Paginated history response -- */
export interface HistoryResponse {
  items: TxHashPair[];
  total: number;
  limit: number;
  offset: number;
}

/* -- Transaction info within a status response -- */
export interface TransactionInfo {
  txType: "user_fund" | "operator_bridge";
  eid: number;
  txHash: string;
  status: string;
  operatorAddress?: string;
}

/* -- Response from GET /v1/bridge/status/{jobId} -- */
export interface BridgeStatusResponse {
  jobId: string;
  status: BackendJobStatus;
  direction: string;
  sender: string;
  receiver: string;
  token: string;
  amount: string;
  feeAmount: string | null;
  netAmount: string | null;
  srcEid: number;
  dstEid: number;
  dappId: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  transactions: TransactionInfo[];
}

export type BackendJobStatus =
  | "pending"
  | "submitted"
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
  /** Recipient address on destination chain (defaults to userAddress for self-bridge) */
  recipientAddress: string;
  depositAddress: string;
  status: BridgeStatus;
  /** Network this session belongs to (mainnet or testnet) */
  network?: "mainnet" | "testnet";
  /** Bridge direction: deposit (Home→Remote) or withdraw (Remote→Home) */
  direction?: "deposit" | "withdraw";
  /** Dapp ID for compose routing (0 = direct bridge, deposit-only) */
  dappId?: number;
  /** Bridge mode: operator-sponsored or self-bridge */
  bridgeMode?: "operator" | "self";
  /** Transfer mode: vault-funded or permit2 */
  transferMode?: "vault" | "permit2";
  /** Self-bridge tx hash (deposit()/withdraw() call) */
  selfBridgeTxHash?: string;
  userTransferTxHash?: string;
  jobId?: string;
  backendProcessTxHash?: string;
  lzMessageId?: string;
  lzTxHash?: string;
  destinationTxHash?: string;
  error?: string;
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
/*  Recovery eligibility helpers                                       */
/* ------------------------------------------------------------------ */

/** Session is eligible for vault rescue (tokens stuck in source-chain vault) */
export function isVaultRescueEligible(session: BridgeSession): boolean {
  if (!session.depositAddress) return false;
  // Must not have been successfully bridged
  if (session.selfBridgeTxHash) return false;
  if (session.backendProcessTxHash) return false;
  // Must have actually transferred tokens to the vault
  if (!session.userTransferTxHash) return false;
  // Status indicates stuck state
  const stuckStatuses: BridgeStatus[] = [
    "transfer_mined", "deposit_verified", "failed", "error",
  ];
  return stuckStatuses.includes(session.status);
}

/** Session has a compose failure (tokens stuck in RISExComposer on dest chain) */
export function isComposeRescueNeeded(session: BridgeSession): boolean {
  if ((session.dappId ?? 0) === 0) return false;    // direct bridge, no compose
  if (session.direction === "withdraw") return false; // withdraw has no compose
  return isComposeFailed(session);
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
