"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TxBadge } from "./tx-badge";
import { ChainIcon, TokenIcon } from "./chain-icon";
import { AddressPill } from "./address-pill";
import { PhaseProgressBar } from "./phase-progress-bar";
import { cn } from "@/lib/utils";
import { normalizeLzStatus, type LzTrackingData } from "@/lib/layerzero";
import { CHAINS, getLzScanBase } from "@/config/chains";
import { useNetworkStore } from "@/lib/network-store";
import { lookupByTxHash } from "@/lib/bridge-service";
import type { TxHashPair } from "@/lib/types";
import {
  Search,
  Loader2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Zap,
  Radio,
  Layers,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Copy,
  AlertCircle,
  X,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Parse raw API message into our LzTrackingData shape                */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dig(obj: any, ...keys: string[]): unknown {
  let cur = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[k];
  }
  return cur;
}

function tryDecodeOftAmount(payload?: string): bigint | undefined {
  if (!payload) return undefined;
  try {
    const hex = payload.startsWith("0x") ? payload.slice(2) : payload;
    if (hex.length < 80) return undefined;
    const amountHex = hex.slice(64, 80);
    if (!amountHex || amountHex.length !== 16) return undefined;
    return BigInt("0x" + amountHex);
  } catch {
    return undefined;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseApiMessage(msg: any): LzTrackingData & { amountRaw?: bigint; fromAddress?: string; nonce?: number } {
  const pathway = msg?.pathway;
  const source = msg?.source;
  const destination = msg?.destination;

  const dstStatus = (dig(destination, "status") as string) ?? undefined;
  const srcStatus = (dig(source, "status") as string) ?? undefined;
  const topStatus = msg?.status as string | undefined;
  let resolvedStatus: string;
  if (dstStatus === "SUCCEEDED") resolvedStatus = "DELIVERED";
  else if (dstStatus === "FAILED") resolvedStatus = "FAILED";
  else if (srcStatus === "SUCCEEDED" && !dstStatus) resolvedStatus = "INFLIGHT";
  else if (srcStatus === "SUCCEEDED" && dstStatus) resolvedStatus = dstStatus;
  else resolvedStatus = topStatus ?? srcStatus ?? "PENDING";

  const srcTxHash = (dig(source, "tx", "txHash") ?? msg?.srcTxHash ?? msg?.srcUaTxHash) as string | undefined;
  const dstTxHash = (dig(destination, "tx", "txHash") ?? msg?.dstTxHash ?? msg?.dstUaTxHash) as string | undefined;
  const srcEid = (dig(pathway, "srcEid") ?? msg?.srcEid) as number | undefined;
  const dstEid = (dig(pathway, "dstEid") ?? msg?.dstEid) as number | undefined;
  const senderAddr = (dig(pathway, "sender", "address") ?? msg?.srcUaAddress ?? msg?.sender) as string | undefined;
  const receiverAddr = (dig(pathway, "receiver", "address") ?? msg?.dstUaAddress ?? msg?.receiver) as string | undefined;
  const guid = (msg?.guid ?? dig(pathway, "id")) as string | undefined;

  const lzCompose = dig(destination, "lzCompose") as Record<string, unknown> | undefined;
  let composeStatus = "UNKNOWN";
  let composeTx: string | undefined;
  if (lzCompose) {
    composeStatus = ((lzCompose.status as string) ?? "UNKNOWN").toUpperCase();
    const composeTxs = lzCompose.txs as Array<{ txHash?: string }> | undefined;
    composeTx = composeTxs?.[0]?.txHash ?? (lzCompose.txHash as string | undefined);
  }

  const created = (dig(source, "tx", "blockTimestamp") ?? msg?.created) as number | undefined;
  const updated = (dig(destination, "tx", "blockTimestamp") ?? msg?.updated) as number | undefined;
  const payload = dig(source, "tx", "payload") as string | undefined;
  const amountRaw = tryDecodeOftAmount(payload);
  const fromAddress = (dig(source, "tx", "from") ?? msg?.from) as string | undefined;
  const nonce = (dig(pathway, "nonce") ?? msg?.nonce) as number | undefined;

  return {
    status: normalizeLzStatus(resolvedStatus),
    guid,
    srcTxHash,
    srcChainId: undefined,
    srcEid,
    srcUaAddress: senderAddr,
    dstTxHash,
    dstChainId: undefined,
    dstEid,
    dstUaAddress: receiverAddr,
    sender: senderAddr,
    receiver: receiverAddr,
    compose: {
      status: composeStatus as "SUCCEEDED" | "FAILED" | "NOT_EXECUTED" | "UNKNOWN",
      txHash: composeTx,
    },
    rawStatus: resolvedStatus,
    created,
    updated,
    amountRaw,
    fromAddress,
    nonce,
  };
}

/* ------------------------------------------------------------------ */
/*  Phase helpers                                                       */
/* ------------------------------------------------------------------ */

type Phase = "indexing" | "inflight" | "delivered" | "complete" | "failed";

function derivePhase(d: LzTrackingData): Phase {
  if (d.status === "lz_failed" || d.status === "lz_blocked") return "failed";
  if (d.status === "lz_delivered") {
    if (d.compose?.status === "SUCCEEDED") return "complete";
    if (d.compose?.status === "FAILED") return "failed";
    return "delivered";
  }
  if (d.status === "lz_inflight") return "inflight";
  return "indexing";
}

const PHASE_META: Record<Phase, { label: string; color: string; icon: React.ReactNode }> = {
  indexing:   { label: "Confirming",  color: "text-chart-4",              icon: <Radio className="h-4 w-4 animate-pulse" /> },
  inflight:   { label: "In Flight",   color: "text-primary",              icon: <Zap className="h-4 w-4 animate-pulse" /> },
  delivered:  { label: "Delivered",    color: "text-primary",              icon: <Layers className="h-4 w-4" /> },
  complete:   { label: "Complete",     color: "text-success",              icon: <CheckCircle2 className="h-4 w-4" /> },
  failed:     { label: "Failed",       color: "text-destructive-foreground", icon: <XCircle className="h-4 w-4" /> },
};

const PHASE_STEPS: Phase[] = ["indexing", "inflight", "delivered", "complete"];

const PHASE_LABELS: Record<Phase, string> = {
  indexing: "Confirming",
  inflight: "In Flight",
  delivered: "Delivered",
  complete: "Complete",
  failed: "Failed",
};

/* ------------------------------------------------------------------ */
/*  Resolve EID -> ChainMeta                                           */
/* ------------------------------------------------------------------ */

function chainByEid(eid?: number) {
  if (!eid) return undefined;
  return Object.values(CHAINS).find((c) => c.lzEid === eid);
}

function formatTokenAmount(raw?: bigint): string | undefined {
  if (raw == null || raw === 0n) return undefined;
  const decimals = 6;
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  if (fracStr.length === 0) return whole.toString();
  return `${whole}.${fracStr}`;
}

/* ------------------------------------------------------------------ */
/*  LZ Result card                                                     */
/* ------------------------------------------------------------------ */

type SearchResult = LzTrackingData & { amountRaw?: bigint; fromAddress?: string; nonce?: number };

function LzResultCard({
  data,
  vaultFundTxHash,
  onClose,
}: {
  data: SearchResult;
  vaultFundTxHash?: string | null;
  onClose: () => void;
}) {
  const network = useNetworkStore((s) => s.network);
  const LZ_SCAN_BASE = getLzScanBase(network);
  const [expanded, setExpanded] = useState(true);
  const phase = derivePhase(data);
  const meta = PHASE_META[phase];
  const isTerminal = phase === "complete" || phase === "failed";

  const srcChain = chainByEid(data.srcEid);
  const dstChain = chainByEid(data.dstEid);
  const formattedAmount = formatTokenAmount(data.amountRaw);

  const borderClass = cn(
    "rounded-lg border transition-all duration-500",
    phase === "complete" && "border-success/40 bg-success/5",
    phase === "failed" && "border-destructive/40 bg-destructive/5",
    !isTerminal && "border-primary/30 bg-primary/5",
  );

  return (
    <div className={borderClass}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3">
        <div className={cn("shrink-0", meta.color)}>{meta.icon}</div>

          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("text-sm font-mono font-medium", meta.color)}>
                {meta.label}
              </span>
              {formattedAmount && (
                <span className="flex items-center gap-1.5 text-sm font-mono font-semibold text-foreground">
                  <TokenIcon tokenKey="usdc" className="h-4 w-4" />
                  {formattedAmount} USDC
                </span>
              )}
              {data.rawStatus && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground">
                  {data.rawStatus}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground flex-wrap">
            {srcChain && (
              <>
                <ChainIcon chainKey={srcChain.iconKey} className="h-3 w-3 shrink-0" />
                <span>{srcChain.shortLabel}</span>
              </>
            )}
            {data.srcEid && <span className="text-muted-foreground/40">(EID {data.srcEid})</span>}
            <ArrowRight className="h-2.5 w-2.5 shrink-0" />
            {dstChain && (
              <>
                <ChainIcon chainKey={dstChain.iconKey} className="h-3 w-3 shrink-0" />
                <span>{dstChain.shortLabel}</span>
              </>
            )}
            {data.dstEid && <span className="text-muted-foreground/40">(EID {data.dstEid})</span>}
          </div>
        </div>

        {/* LZ Scan link */}
        {data.srcTxHash && (
          <a
            href={`${LZ_SCAN_BASE}/tx/${data.srcTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono text-primary hover:text-primary/80 bg-primary/10 transition-colors"
          >
            LZ Scan
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}

        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        <button
          onClick={onClose}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1"
          aria-label="Dismiss result"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="px-4 pb-3">
        <PhaseProgressBar steps={PHASE_STEPS} current={phase} labels={PHASE_LABELS} />
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-border/50 pt-3">
          {/* GUID */}
          {data.guid && (
            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">GUID</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[11px] text-foreground break-all">{data.guid}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(data.guid!)}
                  className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  <Copy className="h-2.5 w-2.5" />
                </button>
              </div>
            </div>
          )}

          {/* Transaction hashes */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Transactions</span>
            {vaultFundTxHash && (
              <TxBadge
                label="Vault Fund"
                hash={vaultFundTxHash}
                explorerUrl={srcChain ? srcChain.explorerTxUrl(vaultFundTxHash) : undefined}
              />
            )}
            <TxBadge
              label="Bridge Tx"
              hash={data.srcTxHash}
              explorerUrl={data.srcTxHash && srcChain ? srcChain.explorerTxUrl(data.srcTxHash) : undefined}
            />
            <TxBadge
              label="Dest Tx"
              hash={data.dstTxHash}
              explorerUrl={data.dstTxHash && dstChain ? dstChain.explorerTxUrl(data.dstTxHash) : undefined}
            />
          </div>

          {/* Compose */}
          {data.compose && data.compose.status !== "UNKNOWN" && data.compose.status !== "N/A" && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Compose</span>
                <span
                  className={cn(
                    "text-[10px] font-mono px-1.5 py-0.5 rounded",
                    data.compose.status === "SUCCEEDED" && "bg-success/10 text-success",
                    data.compose.status === "FAILED" && "bg-destructive/10 text-destructive-foreground",
                    data.compose.status !== "SUCCEEDED" && data.compose.status !== "FAILED" && "bg-muted/50 text-muted-foreground",
                  )}
                >
                  {data.compose.status}
                </span>
              </div>
              {data.compose.txHash && (
                <TxBadge
                  label="Compose Tx"
                  hash={data.compose.txHash}
                  explorerUrl={data.compose.txHash && dstChain ? dstChain.explorerTxUrl(data.compose.txHash) : undefined}
                />
              )}
            </div>
          )}

          {/* Token info with fee breakdown */}
          {formattedAmount && (
            <div className="p-2.5 rounded-md bg-muted/30 border border-border/50">
              <div className="flex items-center gap-3">
                <TokenIcon tokenKey="usdc" className="h-5 w-5 shrink-0" />
                <div className="flex flex-col gap-0.5 flex-1">
                  <span className="text-xs font-mono font-medium text-foreground">{formattedAmount} USDC</span>
                  <span className="text-[9px] font-mono text-muted-foreground">
                    {srcChain?.shortLabel ?? "Source"} to {dstChain?.shortLabel ?? "Dest"}
                    {data.nonce != null && <span className="ml-2 text-muted-foreground/60">Nonce #{data.nonce}</span>}
                  </span>
                </div>
              </div>
              {data.amountRaw != null && data.amountRaw > 0n && (() => {
                const feeBps = 50n;
                const fee = (data.amountRaw! * feeBps) / 10000n;
                const net = data.amountRaw! - fee;
                const feeStr = formatTokenAmount(fee);
                const netStr = formatTokenAmount(net);
                return (
                  <div className="mt-2 pt-2 border-t border-border/30 grid grid-cols-3 gap-2 text-[10px] font-mono">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground/60 uppercase tracking-wider text-[8px]">Sent</span>
                      <span className="text-foreground">{formattedAmount}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground/60 uppercase tracking-wider text-[8px]">Fee (0.5%)</span>
                      <span className="text-warning">{feeStr ?? "--"}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground/60 uppercase tracking-wider text-[8px]">Received</span>
                      <span className="text-success">{netStr ?? "--"}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Addresses */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              {srcChain && (
                <span className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                  <ChainIcon chainKey={srcChain.iconKey} className="h-3 w-3" />
                  Source
                </span>
              )}
              <AddressPill label="From" address={data.fromAddress} />
              <AddressPill label="OApp" address={data.sender ?? data.srcUaAddress} />
            </div>
            <div className="flex flex-col gap-1">
              {dstChain && (
                <span className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                  <ChainIcon chainKey={dstChain.iconKey} className="h-3 w-3" />
                  Destination
                </span>
              )}
              <AddressPill label="OApp" address={data.receiver ?? data.dstUaAddress} />
            </div>
          </div>

          {/* Timestamps */}
          {(data.created || data.updated) && (
            <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
              {data.created && <span>Created: {new Date(data.created).toLocaleString()}</span>}
              {data.updated && <span>Updated: {new Date(data.updated).toLocaleString()}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TxSearch – the search bar + result display                         */
/* ------------------------------------------------------------------ */

export function TxSearch({
  initialHash,
  lookupType,
}: {
  initialHash?: string;
  lookupType?: "tx" | "guid";
} = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const network = useNetworkStore((s) => s.network);
  const LZ_SCAN_BASE = getLzScanBase(network);
  const [query, setQuery] = useState(initialHash ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [txPair, setTxPair] = useState<TxHashPair | null>(null);
  const [pollingActive, setPollingActive] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const didAutoSearch = useRef(false);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const doLookup = useCallback(async (hash: string, isRefresh = false) => {
    if (!hash.trim()) return null;
    if (!isRefresh) setError(null);

    const trimmed = hash.trim();
    const proxyUrl = `/api/lz/lookup?hash=${encodeURIComponent(trimmed)}&net=testnet`;

    try {
      const res = await fetch(proxyUrl, {
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        if (!isRefresh) {
          setError("No LayerZero message found. It may take a few minutes to be indexed after tx confirmation.");
          setResult(null);
        }
        return null;
      }

      const body = await res.json();
      const messages = body?.data ?? body?.messages;

      if (Array.isArray(messages) && messages.length > 0) {
        const parsed = parseApiMessage(messages[0]);
        setResult(parsed);
        setError(null);
        return parsed;
      }

      if (body && typeof body === "object" && (body.guid || body.pathway)) {
        const parsed = parseApiMessage(body);
        setResult(parsed);
        setError(null);
        return parsed;
      }
    } catch {
      // fall through
    }

    if (!isRefresh) {
      setError("No LayerZero message found. It may take a few minutes to be indexed after tx confirmation.");
      setResult(null);
    }
    return null;
  }, []);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResult(null);
    setTxPair(null);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setPollingActive(false);

    const trimmed = query.trim();
    const isHexHash = /^0x[0-9a-fA-F]{64}$/.test(trimmed);

    // Step 1: Query our backend for tx hash pair
    let pair: TxHashPair | null = null;
    if (isHexHash) {
      pair = await lookupByTxHash(trimmed, network).catch(() => null);
      if (pair) setTxPair(pair);
    }

    // Step 2: Query LZ Scan using bridge_tx_hash (what LZ indexes)
    const lzHash = pair?.bridge_tx_hash ?? trimmed;
    const lzResult = await doLookup(lzHash);

    setLoading(false);

    if (!pair && !lzResult) return;

    // Clear "not found" error if backend returned data but LZ didn't
    if (pair && !lzResult) setError(null);

    // Update URL
    if ((pair || lzResult) && pathname?.startsWith("/track")) {
      const targetUrl = lookupType === "guid"
        ? `/track/guid/${trimmed}`
        : `/track/tx/${trimmed}`;
      if (pathname !== targetUrl) {
        router.replace(targetUrl, { scroll: false });
      }
    }

    // Auto-refresh if not terminal
    if (lzResult && lzResult.status !== "lz_delivered" && lzResult.status !== "lz_failed") {
      setPollingActive(true);
      pollRef.current = setInterval(async () => {
        const updated = await doLookup(lzHash, true);
        if (updated && (updated.status === "lz_delivered" || updated.status === "lz_failed")) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setPollingActive(false);
        }
      }, 6000);
    }
  }, [query, doLookup, lookupType, pathname, router]);

  useEffect(() => {
    if (initialHash && !didAutoSearch.current) {
      didAutoSearch.current = true;
      handleSearch();
    }
  }, [initialHash, handleSearch]);

  const handleClose = useCallback(() => {
    setResult(null);
    setTxPair(null);
    setError(null);
    setQuery("");
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setPollingActive(false);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Search bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="Search tx hash or GUID..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-9 font-mono text-xs bg-muted/30 border-border h-9"
          />
          {query && (
            <button
              onClick={() => { setQuery(""); inputRef.current?.focus(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <Button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          size="sm"
          className="h-9 px-3 font-mono text-xs gap-1.5"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          Track
        </Button>
      </div>

      {/* Polling indicator */}
      {pollingActive && (
        <div className="flex items-center gap-2 text-[10px] font-mono text-primary">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Auto-refreshing every 6s...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded bg-muted/30 border border-border text-xs font-mono text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-warning" />
          <span>{error}</span>
        </div>
      )}

      {/* Vault fund tx info (if backend returned a pair) */}
      {txPair && !result && (
        <div className="flex items-center gap-2 px-3 py-2 rounded bg-muted/20 border border-border/50 text-[10px] font-mono text-muted-foreground">
          <span>Backend matched:</span>
          {txPair.vault_fund_tx_hash && (
            <TxBadge label="Vault Fund" hash={txPair.vault_fund_tx_hash} />
          )}
          <TxBadge label="Bridge" hash={txPair.bridge_tx_hash} />
        </div>
      )}

      {/* LZ Scan cross-chain tracking */}
      {result && (
        <LzResultCard
          data={result}
          vaultFundTxHash={txPair?.vault_fund_tx_hash}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
