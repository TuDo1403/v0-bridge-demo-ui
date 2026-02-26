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
import { formatUnits } from "viem";
import { normalizeLzStatus, type LzTrackingData } from "@/lib/layerzero";
import { CHAINS, LZ_SCAN_BASE } from "@/config/chains";
import { TOKENS } from "@/config/contracts";
import { lookupByTxHash } from "@/lib/bridge-service";
import type { BridgeStatusResponse } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";

/** Resolve decimals from a token contract address */
function resolveTokenDecimals(tokenAddr: string): number {
  const lower = tokenAddr.toLowerCase();
  for (const t of Object.values(TOKENS)) {
    for (const addr of Object.values(t.addresses)) {
      if (addr.toLowerCase() === lower) return t.decimals;
    }
  }
  return 6; // default to USDC decimals
}

/** Format a raw amount string with proper decimals */
function fmtAmt(raw: string | null | undefined, decimals: number): string {
  if (!raw) return "--";
  try {
    const n = Number(formatUnits(BigInt(raw), decimals));
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: decimals });
  } catch {
    return raw;
  }
}
import {
  Search,
  Loader2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
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

/**
 * Decode amount from OFT v2 message payload.
 * OFT payload layout:
 *   bytes32 to        (32 bytes = 64 hex chars) -- receiver address left-padded
 *   uint64  amountSD  ( 8 bytes = 16 hex chars) -- amount in shared decimals
 */
function tryDecodeOftAmount(payload?: string): bigint | undefined {
  if (!payload) return undefined;
  try {
    const hex = payload.startsWith("0x") ? payload.slice(2) : payload;
    // Need at least 32 + 8 bytes = 80 hex chars
    if (hex.length < 80) return undefined;
    // uint64 amountSD sits at byte offset 32, length 8 bytes = hex chars 64..80
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

  // -- Status
  const dstStatus = (dig(destination, "status") as string) ?? undefined;
  const srcStatus = (dig(source, "status") as string) ?? undefined;
  const topStatus = msg?.status as string | undefined;
  let resolvedStatus: string;
  if (dstStatus === "SUCCEEDED") resolvedStatus = "DELIVERED";
  else if (dstStatus === "FAILED") resolvedStatus = "FAILED";
  else if (srcStatus === "SUCCEEDED" && !dstStatus) resolvedStatus = "INFLIGHT";
  else if (srcStatus === "SUCCEEDED" && dstStatus) resolvedStatus = dstStatus;
  else resolvedStatus = topStatus ?? srcStatus ?? "PENDING";

  // -- Tx hashes
  const srcTxHash = (dig(source, "tx", "txHash") ?? msg?.srcTxHash ?? msg?.srcUaTxHash) as string | undefined;
  const dstTxHash = (dig(destination, "tx", "txHash") ?? msg?.dstTxHash ?? msg?.dstUaTxHash) as string | undefined;

  // -- EIDs
  const srcEid = (dig(pathway, "srcEid") ?? msg?.srcEid) as number | undefined;
  const dstEid = (dig(pathway, "dstEid") ?? msg?.dstEid) as number | undefined;

  // -- Addresses
  const senderAddr = (dig(pathway, "sender", "address") ?? msg?.srcUaAddress ?? msg?.sender) as string | undefined;
  const receiverAddr = (dig(pathway, "receiver", "address") ?? msg?.dstUaAddress ?? msg?.receiver) as string | undefined;

  // -- GUID
  const guid = (msg?.guid ?? dig(pathway, "id")) as string | undefined;

  // -- Compose
  const lzCompose = dig(destination, "lzCompose") as Record<string, unknown> | undefined;
  let composeStatus = "UNKNOWN";
  let composeTx: string | undefined;
  if (lzCompose) {
    composeStatus = ((lzCompose.status as string) ?? "UNKNOWN").toUpperCase();
    // compose txs might be in an array
    const composeTxs = lzCompose.txs as Array<{ txHash?: string }> | undefined;
    composeTx = composeTxs?.[0]?.txHash ?? (lzCompose.txHash as string | undefined);
  }

  // -- Timestamps
  const created = (dig(source, "tx", "blockTimestamp") ?? msg?.created) as number | undefined;
  const updated = (dig(destination, "tx", "blockTimestamp") ?? msg?.updated) as number | undefined;

  // -- Token amount from payload
  const payload = dig(source, "tx", "payload") as string | undefined;
  const amountRaw = tryDecodeOftAmount(payload);

  // -- From (tx sender, not protocol sender)
  const fromAddress = (dig(source, "tx", "from") ?? msg?.from) as string | undefined;

  // -- Nonce
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
/*  Phase helpers (mirrors tracking-card logic)                        */
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
/*  Resolve EID -> ChainMeta for display                               */
/* ------------------------------------------------------------------ */

function chainByEid(eid?: number) {
  if (!eid) return undefined;
  return Object.values(CHAINS).find((c) => c.lzEid === eid);
}

/** Format raw token amount (assumes USDC 6 decimals) */
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
/*  Result card (standalone -- no BridgeSession needed)                */
/* ------------------------------------------------------------------ */

type SearchResult = LzTrackingData & { amountRaw?: bigint; fromAddress?: string; nonce?: number };

function LzResultCard({
  data,
  onClose,
}: {
  data: SearchResult;
  onClose: () => void;
}) {
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
            <TxBadge
              label="Source Tx"
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
              {/* Fee breakdown: 0.5% (50 bps) */}
              {data.amountRaw != null && data.amountRaw > 0n && (() => {
                const feeBps = 50n; // 0.5%
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
/*  BackendJobCard – shows rich data from our bridge backend           */
/* ------------------------------------------------------------------ */

function BackendJobCard({ job }: { job: BridgeStatusResponse }) {
  const [expanded, setExpanded] = useState(true);

  const srcChain = CHAINS[Number(job.sourceChainId)] ?? Object.values(CHAINS).find((c) => c.chain.id === Number(job.sourceChainId));
  const dstChain = CHAINS[Number(job.dstChainId)] ?? Object.values(CHAINS).find((c) => c.chain.id === Number(job.dstChainId));
  const decimals = resolveTokenDecimals(job.token);
  const tokenSymbol = Object.values(TOKENS).find(
    (t) => Object.values(t.addresses).some((a) => a.toLowerCase() === job.token.toLowerCase())
  )?.symbol ?? "USDC";

  const isComplete = job.status === "completed";
  const isFailed = job.status === "failed";
  const composeFailed =
    job.composeStatus?.toLowerCase().includes("fail") ||
    job.composeStatus?.toLowerCase().includes("revert");

  const effectiveFailed = isFailed || composeFailed;

  const borderClass = cn(
    "rounded-lg border transition-all duration-500",
    isComplete && !composeFailed && "border-success/40 bg-success/5",
    effectiveFailed && "border-destructive/40 bg-destructive/5",
    !isComplete && !effectiveFailed && "border-primary/30 bg-primary/5",
  );

  const statusLabel = STATUS_LABELS[job.status as keyof typeof STATUS_LABELS] ?? job.status;

  return (
    <div className={borderClass}>
      <div className="px-4 py-3 flex items-center gap-3">
        <div className={cn(
          "shrink-0",
          isComplete && !composeFailed && "text-success",
          effectiveFailed && "text-destructive-foreground",
          !isComplete && !effectiveFailed && "text-primary",
        )}>
          {isComplete && !composeFailed ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : effectiveFailed ? (
            <XCircle className="h-4 w-4" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
        </div>

        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/60">Bridge Job</span>
            <span className={cn(
              "text-[10px] font-mono px-1.5 py-0.5 rounded",
              isComplete && !composeFailed && "bg-success/10 text-success",
              effectiveFailed && "bg-destructive/10 text-destructive-foreground",
              !isComplete && !effectiveFailed && "bg-primary/10 text-primary",
            )}>
              {composeFailed ? "Compose Failed" : statusLabel}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground flex-wrap">
            {srcChain && (
              <>
                <ChainIcon chainKey={srcChain.iconKey} className="h-3 w-3 shrink-0" />
                <span>{srcChain.shortLabel}</span>
              </>
            )}
            <ArrowRight className="h-2.5 w-2.5 shrink-0" />
            {dstChain && (
              <>
                <ChainIcon chainKey={dstChain.iconKey} className="h-3 w-3 shrink-0" />
                <span>{dstChain.shortLabel}</span>
              </>
            )}
          </div>
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-border/50 pt-3">
          {/* Job ID */}
          <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
            <span className="text-muted-foreground/60">Job ID:</span>
            <span className="text-foreground">{job.jobId}</span>
          </div>

          {/* Amount breakdown */}
          <div className="p-2.5 rounded-md bg-muted/30 border border-border/50">
            <div className="flex items-center gap-3">
              <TokenIcon tokenKey="usdc" className="h-5 w-5 shrink-0" />
              <div className="flex flex-col gap-0.5 flex-1">
                <span className="text-xs font-mono font-medium text-foreground">{fmtAmt(job.amount, decimals)} {tokenSymbol}</span>
                <span className="text-[9px] font-mono text-muted-foreground">
                  {srcChain?.shortLabel ?? "Source"} to {dstChain?.shortLabel ?? "Dest"}
                </span>
              </div>
            </div>
            {(job.feeAmount || job.netAmount) && (
              <div className="mt-2 pt-2 border-t border-border/30 grid grid-cols-3 gap-2 text-[10px] font-mono">
                <div className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground/60 uppercase tracking-wider text-[8px]">Sent</span>
                  <span className="text-foreground">{fmtAmt(job.amount, decimals)}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground/60 uppercase tracking-wider text-[8px]">Fee</span>
                  <span className="text-chart-4">{fmtAmt(job.feeAmount, decimals)}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground/60 uppercase tracking-wider text-[8px]">Net Received</span>
                  <span className="text-success">{fmtAmt(job.netAmount, decimals)}</span>
                </div>
              </div>
            )}
          </div>

          {/* All transaction hashes */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Transactions</span>
            {job.userTransferTxHash && (
              <TxBadge
                label="User Tx"
                hash={job.userTransferTxHash}
                explorerUrl={srcChain?.explorerTxUrl(job.userTransferTxHash)}
              />
            )}
            {job.backendProcessTxHash && (
              <TxBadge
                label="Backend Tx"
                hash={job.backendProcessTxHash}
                explorerUrl={srcChain?.explorerTxUrl(job.backendProcessTxHash)}
              />
            )}
            {job.lzMessageId && (
              <div className="flex items-center gap-1.5 text-[10px] font-mono">
                <span className="text-muted-foreground/60 w-16 shrink-0">LZ Msg</span>
                <span className="text-foreground truncate">{job.lzMessageId.slice(0, 10)}...{job.lzMessageId.slice(-8)}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(job.lzMessageId!)}
                  className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  <Copy className="h-2.5 w-2.5" />
                </button>
              </div>
            )}
            {job.destinationTxHash && (
              <TxBadge
                label="Dest Tx"
                hash={job.destinationTxHash}
                explorerUrl={dstChain?.explorerTxUrl(job.destinationTxHash)}
              />
            )}
            {job.composeTxHash && (
              <TxBadge
                label="Compose Tx"
                hash={job.composeTxHash}
                explorerUrl={dstChain?.explorerTxUrl(job.composeTxHash)}
              />
            )}
          </div>

          {/* Compose status */}
          {job.composeStatus && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Compose</span>
              <span
                className={cn(
                  "text-[10px] font-mono px-1.5 py-0.5 rounded",
                  composeFailed && "bg-destructive/10 text-destructive-foreground",
                  !composeFailed && job.composeStatus.toLowerCase().includes("execut") && "bg-success/10 text-success",
                  !composeFailed && !job.composeStatus.toLowerCase().includes("execut") && "bg-muted/50 text-muted-foreground",
                )}
              >
                {job.composeStatus}
              </span>
            </div>
          )}

          {/* Addresses */}
          <div className="grid grid-cols-2 gap-2">
            <AddressPill label="Sender" address={job.sender ?? undefined} />
            <AddressPill label="Receiver" address={job.receiver} />
          </div>

          {/* Error */}
          {job.error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded bg-destructive/10 border border-destructive/20 text-xs font-mono text-destructive-foreground">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{job.error}</span>
            </div>
          )}

          {/* Timestamps */}
          <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
            {job.createdAt && <span>Created: {new Date(job.createdAt).toLocaleString()}</span>}
            {job.updatedAt && <span>Updated: {new Date(job.updatedAt).toLocaleString()}</span>}
          </div>
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
  /** Hint which LZ Scan endpoint to try first */
  lookupType?: "tx" | "guid";
} = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(initialHash ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [backendJob, setBackendJob] = useState<BridgeStatusResponse | null>(null);
  const [pollingActive, setPollingActive] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const didAutoSearch = useRef(false);

  // Stop polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const doLookup = useCallback(async (hash: string, isRefresh = false) => {
    if (!hash.trim()) return null;
    if (!isRefresh) setError(null);

    const trimmed = hash.trim();
    const base = "https://scan-testnet.layerzero-api.com/v1";

    // Order endpoints: if lookupType is provided, try that first
    const txUrl = `${base}/messages/tx/${trimmed}`;
    const guidUrl = `${base}/messages/guid/${trimmed}`;
    const urls = lookupType === "guid"
      ? [guidUrl, txUrl]
      : [txUrl, guidUrl];

    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: { Accept: "application/json" },
        });

        if (!res.ok) continue;

        const body = await res.json();
        const messages = body?.data ?? body?.messages;

        // Array response
        if (Array.isArray(messages) && messages.length > 0) {
          const parsed = parseApiMessage(messages[0]);
          setResult(parsed);
          setError(null);
          return parsed;
        }

        // Single object response
        if (body && typeof body === "object" && (body.guid || body.pathway)) {
          const parsed = parseApiMessage(body);
          setResult(parsed);
          setError(null);
          return parsed;
        }
      } catch {
        continue;
      }
    }

    // None of the endpoints returned data
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
    setBackendJob(null);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setPollingActive(false);

    // Step 1: Query our backend first (matches any of the 4 tx hashes)
    const trimmed = query.trim();
    const isHexHash = /^0x[0-9a-fA-F]{64}$/.test(trimmed);

    let backendResult: BridgeStatusResponse | null = null;
    if (isHexHash) {
      backendResult = await lookupByTxHash(trimmed).catch(() => null);
      if (backendResult) setBackendJob(backendResult);
    }

    // Step 2: Query LZ Scan using the best hash:
    // - If backend returned data, use backendProcessTxHash (what LZ actually indexes)
    // - Otherwise fall back to the user's search query
    const lzHash = backendResult?.backendProcessTxHash ?? trimmed;
    const lzResult = await doLookup(lzHash);

    setLoading(false);

    // If neither returned data
    if (!backendResult && !lzResult) {
      // Error already set by doLookup
      return;
    }

    // Clear "not found" error if backend returned data but LZ didn't
    if (backendResult && !lzResult) {
      setError(null);
    }

    // Update URL to reflect the searched hash (only on /track pages)
    if ((backendResult || lzResult) && pathname?.startsWith("/track")) {
      const targetUrl = lookupType === "guid"
        ? `/track/guid/${trimmed}`
        : `/track/tx/${trimmed}`;
      if (pathname !== targetUrl) {
        router.replace(targetUrl, { scroll: false });
      }
    }

    // If the LZ message is not terminal, start auto-refresh polling
    if (lzResult && lzResult.status !== "lz_delivered" && lzResult.status !== "lz_failed") {
      setPollingActive(true);
      pollRef.current = setInterval(async () => {
        const updated = await doLookup(lzHash, true);
        // Also refresh backend data
        if (isHexHash) {
          const updatedJob = await lookupByTxHash(trimmed).catch(() => null);
          if (updatedJob) setBackendJob(updatedJob);
        }
        if (updated && (updated.status === "lz_delivered" || updated.status === "lz_failed")) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setPollingActive(false);
        }
      }, 6000);
    }
  }, [query, doLookup]);

  // Auto-search on mount when initialHash is provided (e.g. /track/0x...)
  useEffect(() => {
    if (initialHash && !didAutoSearch.current) {
      didAutoSearch.current = true;
      handleSearch();
    }
  }, [initialHash, handleSearch]);

  const handleClose = useCallback(() => {
    setResult(null);
    setBackendJob(null);
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

      {/* Backend job info (rich data from our bridge API) */}
      {backendJob && <BackendJobCard job={backendJob} />}

      {/* LZ Scan cross-chain tracking */}
      {result && (
        <div className="flex flex-col gap-1">
          {backendJob && (
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground px-1">
              LayerZero Cross-Chain Tracking
            </span>
          )}
          <LzResultCard data={result} onClose={handleClose} />
        </div>
      )}
    </div>
  );
}
