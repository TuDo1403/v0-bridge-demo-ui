/* ------------------------------------------------------------------ */
/*  LayerZero Scan API client (testnet)                                */
/*  Endpoints:                                                         */
/*    GET /v1/messages/tx/{txHash}   – lookup by source tx hash        */
/*    GET /v1/messages/guid/{guid}   – lookup by GUID (primary after   */
/*                                     first discovery)                */
/* ------------------------------------------------------------------ */

const LZ_API_BASE = "https://scan-testnet.layerzero-api.com/v1";

/* ---- Normalised types ---- */

export type LzNormalisedStatus =
  | "lz_indexing"
  | "lz_inflight"
  | "lz_delivered"
  | "lz_failed"
  | "lz_blocked";

export interface LzComposeDetail {
  status: "SUCCEEDED" | "FAILED" | "NOT_EXECUTED" | "UNKNOWN";
  txHash?: string;
}

export interface LzTrackingData {
  /** Normalised high-level status */
  status: LzNormalisedStatus;
  guid?: string;

  /* Source side */
  srcTxHash?: string;
  srcChainId?: number;
  srcEid?: number;
  srcUaAddress?: string;
  srcUaNonce?: number;

  /* Destination side */
  dstTxHash?: string;
  dstChainId?: number;
  dstEid?: number;
  dstUaAddress?: string;

  /* Sender / receiver */
  sender?: string;
  receiver?: string;

  /* Compose */
  compose?: LzComposeDetail;

  /* Raw status from API */
  rawStatus?: string;

  /* Timestamps */
  created?: number;
  updated?: number;
}

/* ---- Status normaliser ---- */

export function normalizeLzStatus(
  raw: string | undefined | null
): LzNormalisedStatus {
  if (!raw) return "lz_indexing";
  const s = raw.toUpperCase();
  if (s === "DELIVERED") return "lz_delivered";
  if (s === "INFLIGHT" || s === "CONFIRMING") return "lz_inflight";
  if (s === "FAILED" || s === "PAYLOAD_STORED") return "lz_failed";
  if (s === "BLOCKED") return "lz_blocked";
  return "lz_indexing";
}

/* ---- Fetch helpers with retry/backoff ---- */

async function fetchWithRetry(
  url: string,
  retries = 2,
  delay = 1500
): Promise<Response | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return res;
      // 404 is a valid "not found yet" response, don't retry
      if (res.status === 404) return null;
      // 429 or 5xx: retry
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delay * (attempt + 1)));
      }
    } catch {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delay * (attempt + 1)));
      }
    }
  }
  return null;
}

/* ---- Extract compose info from raw messages array ---- */

function extractCompose(msg: Record<string, unknown>): LzComposeDetail {
  // The LZ API nests compose data differently across versions
  const compose = (msg?.dstTxError as string) ?? "";
  const composeTx =
    (msg as Record<string, unknown>)?.composeTxHash as string | undefined;

  // Try pathway.lzCompose
  const pathway = msg?.pathway as Record<string, unknown> | undefined;
  const lzCompose = pathway?.lzCompose as
    | Record<string, unknown>
    | undefined;
  if (lzCompose) {
    const cs = (lzCompose.status as string)?.toUpperCase() ?? "UNKNOWN";
    return {
      status: cs as LzComposeDetail["status"],
      txHash: (lzCompose.txHash as string) ?? composeTx,
    };
  }

  // Fallback: check top-level compose fields
  const composeStatus = (msg?.lzComposeStatus as string) ?? null;
  if (composeStatus) {
    return {
      status: composeStatus.toUpperCase() as LzComposeDetail["status"],
      txHash: (msg?.lzComposeTxHash as string) ?? composeTx,
    };
  }

  if (compose.includes("compose")) {
    return { status: "FAILED", txHash: composeTx };
  }

  return { status: "UNKNOWN", txHash: composeTx };
}

/* ---- Parse raw API response into LzTrackingData ---- */

function parseMessage(msg: Record<string, unknown>): LzTrackingData {
  const pathway = msg?.pathway as Record<string, unknown> | undefined;
  const srcChain = (pathway?.srcChain ?? msg?.srcChainId) as
    | number
    | undefined;
  const dstChain = (pathway?.dstChain ?? msg?.dstChainId) as
    | number
    | undefined;

  return {
    status: normalizeLzStatus(msg?.status as string),
    guid: (msg?.guid as string) ?? undefined,
    srcTxHash: (msg?.srcTxHash as string) ?? (msg?.srcUaTxHash as string) ?? undefined,
    srcChainId: srcChain,
    srcEid: (msg?.srcEid ?? pathway?.sender?.eid) as number | undefined,
    srcUaAddress:
      (msg?.srcUaAddress as string) ??
      ((pathway?.sender as Record<string, unknown>)?.address as string) ??
      undefined,
    srcUaNonce: (msg?.srcUaNonce as number) ?? undefined,
    dstTxHash: (msg?.dstTxHash as string) ?? (msg?.dstUaTxHash as string) ?? undefined,
    dstChainId: dstChain,
    dstEid: (msg?.dstEid ?? pathway?.receiver?.eid) as number | undefined,
    dstUaAddress:
      (msg?.dstUaAddress as string) ??
      ((pathway?.receiver as Record<string, unknown>)?.address as string) ??
      undefined,
    sender: (msg?.sender as string) ?? (msg?.srcUaAddress as string) ?? undefined,
    receiver: (msg?.receiver as string) ?? (msg?.dstUaAddress as string) ?? undefined,
    compose: extractCompose(msg),
    rawStatus: (msg?.status as string) ?? undefined,
    created: (msg?.created as number) ?? undefined,
    updated: (msg?.updated as number) ?? undefined,
  };
}

/* ---- Public API ---- */

/**
 * Look up LZ message by source tx hash (the backend bridge tx hash).
 * Returns null if the message hasn't been indexed yet.
 */
export async function fetchBySourceTxHash(
  txHash: string
): Promise<LzTrackingData | null> {
  const res = await fetchWithRetry(`${LZ_API_BASE}/messages/tx/${txHash}`);
  if (!res) return null;

  try {
    const body = await res.json();
    // API returns { data: [...] } or { messages: [...] }
    const messages = (body?.data ?? body?.messages ?? body) as
      | Record<string, unknown>[]
      | Record<string, unknown>;

    if (Array.isArray(messages)) {
      if (messages.length === 0) return null;
      return parseMessage(messages[0]);
    }
    // Single object
    if (messages && typeof messages === "object" && (messages as Record<string, unknown>).guid) {
      return parseMessage(messages as Record<string, unknown>);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Look up LZ message by GUID (more reliable once GUID is known).
 */
export async function fetchByGuid(
  guid: string
): Promise<LzTrackingData | null> {
  const res = await fetchWithRetry(`${LZ_API_BASE}/messages/guid/${guid}`);
  if (!res) return null;

  try {
    const body = await res.json();
    // Might return single object or array
    const messages = (body?.data ?? body?.messages ?? body) as
      | Record<string, unknown>[]
      | Record<string, unknown>;

    if (Array.isArray(messages)) {
      if (messages.length === 0) return null;
      return parseMessage(messages[0]);
    }
    if (messages && typeof messages === "object") {
      return parseMessage(messages as Record<string, unknown>);
    }
    return null;
  } catch {
    return null;
  }
}
