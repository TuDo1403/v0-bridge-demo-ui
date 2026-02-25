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
}

/* ------------------------------------------------------------------ */
/*  Session (persisted in localStorage)                                */
/* ------------------------------------------------------------------ */

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
