"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useBridgeStore } from "@/lib/bridge-store";
import { retryBridgeJob } from "@/lib/bridge-service";
import { mapBackendStatus } from "@/lib/types";
import { CHAINS, lzScanMessageUrl, LZ_SCAN_BASE } from "@/config/chains";
import { TOKENS, buildComposeData } from "@/config/contracts";
import type { BridgeSession, LzTrackingSnapshot } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { TxBadge } from "./tx-badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ChainIcon } from "./chain-icon";
import {
  ExternalLink,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ArrowRight,
  RotateCcw,
  Layers,
  Zap,
  Radio,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Status mapping helpers                                             */
/* ------------------------------------------------------------------ */

type TrackingPhase =
  | "waiting"       // tx submitted, LZ hasn't indexed yet
  | "indexing"      // LZ sees the message, confirming
  | "inflight"      // message is in flight between chains
  | "delivered"     // message delivered on dest
  | "verifying"     // compose executing / verifying
  | "complete"      // everything done
  | "failed";       // LZ or compose error

function derivePhase(session: BridgeSession): TrackingPhase {
  const lz = session.lzTracking;
  if (session.status === "completed") return "complete";
  if (session.status === "error" || session.status === "failed") return "failed";
  // Session was reset to idle but still has an error (e.g. after a failed retry)
  if (session.error) return "failed";

  // Map backend job statuses
  if (session.status === "source_verified" || session.status === "bridge_submitted") return "waiting";
  if (session.status === "bridge_mined" || session.status === "lz_indexing") return "indexing";

  // LZ tracking states
  if (!lz || !lz.lzStatus) {
    if (session.status === "lz_pending") return "inflight";
    return "waiting";
  }
  if (lz.lzStatus === "lz_failed" || lz.lzStatus === "lz_blocked" || lz.lzStatus === "failed") return "failed";
  if (lz.lzStatus === "lz_delivered" || lz.lzStatus === "completed") {
    if (lz.composeStatus === "SUCCEEDED" || lz.composeStatus === "completed") return "complete";
    if (lz.composeStatus === "FAILED" || lz.composeStatus === "failed") return "failed";
    return "verifying";
  }
  if (lz.lzStatus === "lz_inflight" || lz.lzStatus === "lz_pending") return "inflight";
  return "indexing";
}

function phaseLabel(phase: TrackingPhase): string {
  switch (phase) {
    case "waiting": return "Waiting for Indexing";
    case "indexing": return "Confirming on Source";
    case "inflight": return "In Flight";
    case "delivered": return "Delivered";
    case "verifying": return "Executing Compose";
    case "complete": return "Complete";
    case "failed": return "Failed";
  }
}

function phaseColor(phase: TrackingPhase): string {
  switch (phase) {
    case "waiting": return "text-muted-foreground";
    case "indexing": return "text-chart-4";
    case "inflight": return "text-primary";
    case "delivered": return "text-primary";
    case "verifying": return "text-chart-4";
    case "complete": return "text-success";
    case "failed": return "text-destructive-foreground";
  }
}

function phaseIcon(phase: TrackingPhase) {
  switch (phase) {
    case "waiting": return <Clock className="h-4 w-4" />;
    case "indexing": return <Radio className="h-4 w-4 animate-pulse" />;
    case "inflight": return <Zap className="h-4 w-4 animate-pulse" />;
    case "delivered": return <CheckCircle2 className="h-4 w-4" />;
    case "verifying": return <Layers className="h-4 w-4 animate-pulse" />;
    case "complete": return <CheckCircle2 className="h-4 w-4" />;
    case "failed": return <XCircle className="h-4 w-4" />;
  }
}

/* ------------------------------------------------------------------ */
/*  Visual progress                                                     */
/* ------------------------------------------------------------------ */

const PHASE_STEPS: TrackingPhase[] = [
  "waiting",
  "indexing",
  "inflight",
  "delivered",
  "verifying",
  "complete",
];

function PhaseProgressBar({ phase }: { phase: TrackingPhase }) {
  const idx = phase === "failed" ? -1 : PHASE_STEPS.indexOf(phase);

  return (
    <div className="flex items-center gap-0.5 w-full">
      {PHASE_STEPS.map((p, i) => {
        const isActive = i === idx;
        const isPast = idx >= 0 && i < idx;
        const isFuture = idx >= 0 && i > idx;
        const isFailed = phase === "failed";

        return (
          <TooltipProvider key={p} delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center flex-1 last:flex-0">
                  <div
                    className={cn(
                      "h-1.5 flex-1 rounded-full transition-all duration-700",
                      isPast && "bg-success",
                      isActive && !isFailed && "bg-primary animate-pulse",
                      isActive && isFailed && "bg-destructive",
                      isFuture && "bg-muted",
                      isFailed && !isActive && "bg-muted",
                    )}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-[10px] font-mono">
                {phaseLabel(p)}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Elapsed timer                                                      */
/* ------------------------------------------------------------------ */

function ElapsedTimer({ since }: { since: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const tick = () => setElapsed(Math.floor((Date.now() - since) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [since]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return (
    <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
      {mins}:{secs.toString().padStart(2, "0")}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Address pill                                                       */
/* ------------------------------------------------------------------ */

function AddressPill({ label, address }: { label: string; address?: string }) {
  const [copied, setCopied] = useState(false);
  if (!address) return null;

  const truncated = `${address.slice(0, 6)}...${address.slice(-4)}`;

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground shrink-0">
        {label}
      </span>
      <span className="font-mono text-[11px] text-foreground truncate">
        {truncated}
      </span>
      <button
        onClick={() => {
          navigator.clipboard.writeText(address);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        aria-label={`Copy ${label} address`}
      >
        {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Compose status badge                                               */
/* ------------------------------------------------------------------ */

function ComposeBadge({ status, txHash, explorerUrl }: {
  status?: string;
  txHash?: string;
  explorerUrl?: string;
}) {
  if (!status || status === "UNKNOWN") return null;

  const isOk = status === "SUCCEEDED";
  const isFail = status === "FAILED";

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono",
          isOk && "bg-success/10 text-success",
          isFail && "bg-destructive/10 text-destructive-foreground",
          !isOk && !isFail && "bg-muted/50 text-muted-foreground",
        )}
      >
        {isOk ? <CheckCircle2 className="h-3 w-3" /> : isFail ? <XCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
        <span>Compose: {status}</span>
      </div>
      {txHash && explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-primary transition-colors"
          aria-label="View compose tx"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main tracking card                                                  */
/* ------------------------------------------------------------------ */

export function TrackingCard({ session }: { session: BridgeSession }) {
  const { updateSession } = useBridgeStore();
  const phase = derivePhase(session);
  const [expanded, setExpanded] = useState(phase === "failed");
  const [pollCount, setPollCount] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const lz = session.lzTracking;
  const sourceChain = CHAINS[session.sourceChainId];
  const destChain = CHAINS[session.destChainId];
  const token = TOKENS[session.tokenKey];
  const isTerminal = phase === "complete" || phase === "failed";

  // Pulse effect for active tracking
  const borderClass = cn(
    "rounded-lg border transition-all duration-500",
    phase === "complete" && "border-success/40 bg-success/5",
    phase === "failed" && "border-destructive/40 bg-destructive/5",
    !isTerminal && "border-primary/30 bg-primary/5",
  );

  return (
    <div className={borderClass}>
      {/* Header strip */}
      <div className="px-4 py-3 flex items-center gap-3">
        <div className={cn("shrink-0", phaseColor(phase))}>
          {phaseIcon(phase)}
        </div>

        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("text-sm font-mono font-medium", phaseColor(phase))}>
              {phaseLabel(phase)}
            </span>
            {!isTerminal && <ElapsedTimer since={session.createdAt} />}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
            <ChainIcon chainKey={sourceChain?.iconKey} className="h-3 w-3 shrink-0" />
            <span>{sourceChain?.shortLabel}</span>
            <ArrowRight className="h-2.5 w-2.5" />
            <ChainIcon chainKey={destChain?.iconKey} className="h-3 w-3 shrink-0" />
            <span>{destChain?.shortLabel}</span>
            <span className="text-muted-foreground/30">|</span>
            <span>{session.amount} {token?.symbol}</span>
            {lz?.guid && (
              <>
                <span className="text-muted-foreground/30">|</span>
                <span className="truncate max-w-[120px]" title={lz.guid}>
                  GUID: {lz.guid.slice(0, 10)}...
                </span>
              </>
            )}
          </div>
        </div>

        {/* LZ Scan link */}
        {(session.lzTxHash || session.backendProcessTxHash || lz?.srcTxHash) && (
          <a
            href={`${LZ_SCAN_BASE}/tx/${session.lzTxHash || session.backendProcessTxHash || lz?.srcTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono text-primary hover:text-primary/80 bg-primary/10 transition-colors"
            aria-label="View on LayerZero Scan"
          >
            LZ Scan
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}

        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1"
          aria-label={expanded ? "Collapse details" : "Expand details"}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Progress bar */}
      <div className="px-4 pb-3">
        <PhaseProgressBar phase={phase} />
      </div>

      {/* Error + retry: always visible for failed sessions */}
      {phase === "failed" && (
        <div className="px-4 pb-3 flex flex-col gap-2">
          <div className="px-3 py-2 rounded bg-destructive/10 border border-destructive/20 text-[11px] font-mono text-destructive-foreground flex items-start gap-2">
            <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <div>
              {session.error ?? "The bridge transaction failed."}{" "}
              {lz?.composeStatus === "FAILED" && (
                <>Compose execution failed on the destination chain. </>
              )}
            </div>
          </div>
          {session.jobId && (
            <div className="flex flex-col gap-1.5">
              <Button
                variant="outline"
                size="sm"
                disabled={retrying}
                className="font-mono text-xs gap-1.5 self-start border-destructive/30 hover:bg-destructive/10"
                onClick={async () => {
                  setRetrying(true);
                  setRetryError(null);
                  try {
                    const composeData = buildComposeData(session);
                    console.log("[v0] Retry with compose data:", {
                      composer: composeData.composer.slice(0, 10) + "...",
                      composeMsgLen: composeData.composeMsg.length,
                    });
                    const res = await retryBridgeJob(session.jobId!, composeData);
                    updateSession(session.id, {
                      status: mapBackendStatus(res.status),
                      error: undefined,
                    });
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : "Retry failed";
                    console.error("[v0] Retry error:", msg);
                    setRetryError(msg);
                  } finally {
                    setRetrying(false);
                  }
                }}
              >
                {retrying ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RotateCcw className="h-3 w-3" />
                )}
                {retrying ? "Retrying..." : "Retry Bridge"}
              </Button>
              {retryError && (
                <span className="text-[10px] font-mono text-destructive-foreground px-1">
                  {retryError}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Expanded detail panel */}
      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-border/50 pt-3">
          {/* Transaction hashes */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
              Transactions
            </span>
            <TxBadge
              label="User Tx"
              hash={session.userTransferTxHash}
              explorerUrl={
                session.userTransferTxHash
                  ? sourceChain?.explorerTxUrl(session.userTransferTxHash)
                  : undefined
              }
            />
            <TxBadge
              label="Backend"
              hash={session.backendProcessTxHash}
              explorerUrl={
                session.backendProcessTxHash
                  ? sourceChain?.explorerTxUrl(session.backendProcessTxHash)
                  : undefined
              }
            />
            <TxBadge
              label="LZ Msg"
              hash={lz?.guid ?? session.lzMessageId}
              explorerUrl={
                (session.lzTxHash || session.backendProcessTxHash || lz?.srcTxHash)
                  ? `${LZ_SCAN_BASE}/tx/${session.lzTxHash || session.backendProcessTxHash || lz?.srcTxHash}`
                  : undefined
              }
            />
            <TxBadge
              label="Dest Tx"
              hash={lz?.dstTxHash ?? session.destinationTxHash}
              explorerUrl={
                (lz?.dstTxHash ?? session.destinationTxHash)
                  ? destChain?.explorerTxUrl(lz?.dstTxHash ?? session.destinationTxHash ?? "")
                  : undefined
              }
            />
          </div>

          {/* Compose info */}
          {lz?.composeStatus && lz.composeStatus !== "UNKNOWN" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                Compose Execution
              </span>
              <ComposeBadge
                status={lz.composeStatus}
                txHash={lz.composeTxHash}
                explorerUrl={
                  lz.composeTxHash
                    ? destChain?.explorerTxUrl(lz.composeTxHash)
                    : undefined
                }
              />
            </div>
          )}

          {/* EID info + addresses */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                <ChainIcon chainKey={sourceChain?.iconKey} className="h-3 w-3" />
                Source
              </span>
              <span className="text-[11px] font-mono text-foreground">
                EID {lz?.srcEid ?? sourceChain?.lzEid ?? "--"}
              </span>
              <AddressPill label="Sender" address={lz?.sender} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                <ChainIcon chainKey={destChain?.iconKey} className="h-3 w-3" />
                Destination
              </span>
              <span className="text-[11px] font-mono text-foreground">
                EID {lz?.dstEid ?? destChain?.lzEid ?? "--"}
              </span>
              <AddressPill label="Receiver" address={lz?.receiver} />
            </div>
          </div>

          {/* Raw LZ status */}
          {lz?.rawStatus && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                LZ Raw
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/50 text-foreground">
                {lz.rawStatus}
              </span>
              {lz.lzUpdated && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  {new Date(lz.lzUpdated).toLocaleTimeString()}
                </span>
              )}
            </div>
          )}

          {/* Rescue hint for stalled */}
          {phase === "waiting" && (Date.now() - session.createdAt > 120_000) && (
            <div className="px-3 py-2 rounded bg-warning/10 border border-warning/20 text-[11px] font-mono text-warning flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <div>
                <span className="font-medium">Taking longer than expected.</span>{" "}
                If the backend does not process within a reasonable time, you can
                call <code className="text-foreground bg-muted/50 px-1 rounded">rescueFunds()</code> on
                the GlobalDeposit contract to recover your tokens.
              </div>
            </div>
          )}

          {/* (Error + retry is shown above the expanded panel, always visible) */}
        </div>
      )}
    </div>
  );
}
