/* ------------------------------------------------------------------ */
/*  Bridge status state machine                                        */
/* ------------------------------------------------------------------ */

export type BridgeStatus =
  | "idle"
  | "awaiting_transfer"
  | "transfer_submitted"
  | "transfer_mined"
  | "deposit_verified"
  | "backend_submitted"
  | "lz_pending"
  | "destination_confirmed"
  | "completed"
  | "error";

export const STATUS_LABELS: Record<BridgeStatus, string> = {
  idle: "Ready",
  awaiting_transfer: "Awaiting Transfer",
  transfer_submitted: "Tx Submitted",
  transfer_mined: "Tx Mined",
  deposit_verified: "Deposit Verified",
  backend_submitted: "Processing",
  lz_pending: "LZ Pending",
  destination_confirmed: "Destination Confirmed",
  completed: "Completed",
  error: "Error",
};

export const STATUS_ORDER: BridgeStatus[] = [
  "idle",
  "awaiting_transfer",
  "transfer_submitted",
  "transfer_mined",
  "deposit_verified",
  "backend_submitted",
  "lz_pending",
  "destination_confirmed",
  "completed",
];

/* ------------------------------------------------------------------ */
/*  API types                                                          */
/* ------------------------------------------------------------------ */

export interface BridgeProcessRequest {
  sourceChainId: number;
  dstChainId: number;
  token: string;
  amount: string;
  userAddress: string;
  depositAddress: string;
  userTransferTxHash: string;
}

export interface BridgeProcessResponse {
  jobId: string;
  backendProcessTxHash: string;
  lzMessageId?: string;
  lzTxHash?: string;
  status: BridgeStatus;
}

export interface BridgeStatusResponse {
  status: BridgeStatus;
  sourceTxHash?: string;
  backendProcessTxHash?: string;
  lzMessageId?: string;
  lzTxHash?: string;
  destinationTxHash?: string;
  error?: string;
  /** Merged LZ tracking snapshot */
  lzTracking?: LzTrackingSnapshot;
}

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
  /** LayerZero tracking data merged from LZ Scan API */
  lzTracking?: LzTrackingSnapshot;
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
