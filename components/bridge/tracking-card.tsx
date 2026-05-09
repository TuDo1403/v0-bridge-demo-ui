"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useBridgeStore } from "@/lib/bridge-store";
import { submitVaultFunded } from "@/lib/bridge-service";
import { mapBackendStatus, isComposeFailed, isVaultRescueEligible, isComposeRescueNeeded } from "@/lib/types";
import { CHAINS, chainIdToEid, getLzScanBase, BLOCK_TIME_SECONDS } from "@/config/chains";
import { useNetworkStore } from "@/lib/network-store";
import { useBlockConfirmations } from "@/hooks/use-block-confirmations";
import { TOKENS, getTokenAddress, KNOWN_DAPPS, isRoundTripDapp as isRoundTripFallback } from "@/config/contracts";
import { useBridgeConfig, isDappRoundTrip } from "@/lib/bridge-config";
import type { BridgeSession } from "@/lib/types";
import { TxBadge } from "./tx-badge";
import { RecoveryPanel } from "./recovery-panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChainIcon } from "./chain-icon";
import { AddressPill } from "./address-pill";
import { PhaseProgressBar } from "./phase-progress-bar";
import { NativePhaseTimeline } from "./native-phase-timeline";
import {
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ArrowRight,
  ArrowDownToLine,
  RotateCcw,
  Layers,
  Zap,
  Radio,
  ChevronDown,
  ChevronUp,
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
  | "recovered"     // tokens rescued from vault (not bridged)
  | "failed"        // LZ or compose error
  // Round-trip phases (dappId 2)
  | "return_pending"   // compose succeeded, waiting for return bridge job
  | "return_bridging"  // return bridge TX submitted
  | "return_inflight"  // return LZ message in flight
  | "return_complete"; // return bridge delivered on home

/** Whether this session uses compose (dappId > 0, deposit-only) */
function hasCompose(session: BridgeSession): boolean {
  return (session.dappId ?? 0) > 0 && session.direction !== "withdraw";
}

function derivePhase(session: BridgeSession): TrackingPhase {
  const lz = session.lzTracking;
  const needsCompose = hasCompose(session);

  // Check compose failure FIRST -- backend may report "completed" even when
  // lzCompose reverted on the destination chain.
  if (needsCompose && isComposeFailed(session)) return "failed";

  if (session.status === "recovered") return "recovered";
  if (session.status === "completed") return "complete";
  if (session.status === "roundtrip_pending") return "return_pending";
  if (session.status === "roundtrip_bridging") return "return_bridging";
  if (session.status === "roundtrip_inflight") return "return_inflight";
  if (session.status === "roundtrip_completed") return "return_complete";
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
    // Direct bridge (no compose) — delivery = complete
    if (!needsCompose) return "complete";
    if (isComposeFailed(session)) return "failed";
    const cs = lz.composeStatus?.toUpperCase() ?? "";
    if (cs === "SUCCEEDED" || cs === "EXECUTED" || cs === "COMPLETED") return "complete";
    if (cs === "FAILED" || cs === "SIMULATION_REVERTED") return "failed";
    return "verifying";
  }
  if (lz.lzStatus === "lz_inflight" || lz.lzStatus === "lz_pending") return "inflight";
  return "indexing";
}

/* ------------------------------------------------------------------ */
/*  Visual progress                                                     */
/* ------------------------------------------------------------------ */

const PHASE_STEPS_COMPOSE: TrackingPhase[] = [
  "waiting",
  "indexing",
  "inflight",
  "delivered",
  "verifying",
  "complete",
];

const PHASE_STEPS_DIRECT: TrackingPhase[] = [
  "waiting",
  "indexing",
  "inflight",
  "delivered",
  "complete",
];

const PHASE_STEPS_ROUNDTRIP: TrackingPhase[] = [
  "waiting",
  "indexing",
  "inflight",
  "verifying",
  "return_pending",
  "return_bridging",
  "return_inflight",
  "return_complete",
];

const PHASE_LABELS: Record<TrackingPhase, string> = {
  waiting: "Waiting for Indexing",
  indexing: "Confirming on Source",
  inflight: "In Flight",
  delivered: "Delivered",
  verifying: "Executing Compose",
  complete: "Complete",
  recovered: "Recovered",
  failed: "Failed",
  return_pending: "Minting Shares",
  return_bridging: "Return Bridge",
  return_inflight: "Returning",
  return_complete: "Complete",
};

function phaseLabel(phase: TrackingPhase): string {
  return PHASE_LABELS[phase];
}

function phaseColor(phase: TrackingPhase): string {
  switch (phase) {
    case "waiting": return "text-muted-foreground";
    case "indexing": return "text-chart-4";
    case "inflight": return "text-primary";
    case "delivered": return "text-primary";
    case "verifying": return "text-chart-4";
    case "complete": return "text-success";
    case "recovered": return "text-chart-4";
    case "failed": return "text-destructive-foreground";
    case "return_pending": return "text-chart-4";
    case "return_bridging": return "text-primary";
    case "return_inflight": return "text-primary";
    case "return_complete": return "text-success";
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
    case "recovered": return <ArrowDownToLine className="h-4 w-4" />;
    case "failed": return <XCircle className="h-4 w-4" />;
    case "return_pending": return <Clock className="h-4 w-4 animate-pulse" />;
    case "return_bridging": return <Radio className="h-4 w-4 animate-pulse" />;
    case "return_inflight": return <Zap className="h-4 w-4 animate-pulse" />;
    case "return_complete": return <CheckCircle2 className="h-4 w-4" />;
  }
}

/* ------------------------------------------------------------------ */
/*  Native (OP Stack) header derivation                                */
/* ------------------------------------------------------------------ */

/** Header { label, color, icon, isTerminal } for an OP Stack native session,
 *  driven by session.nativePhase. The LZ derivePhase() above is purely
 *  LayerZero-flow specific (vault funding, LZ relay, compose) and produces
 *  misleading copy on native sessions; this is the parallel mapping. */
function deriveNativeHeader(session: BridgeSession): {
  label: string;
  color: string;
  icon: React.ReactNode;
  isTerminal: boolean;
} {
  const phase = session.nativePhase ?? "";
  const direction = session.direction ?? "deposit";

  // Terminal failures
  if (phase === "failed" || session.status === "failed" || session.status === "error") {
    return {
      label: "Failed",
      color: "text-destructive-foreground",
      icon: <XCircle className="h-4 w-4" />,
      isTerminal: true,
    };
  }

  // Terminal success — phase wins over status because the BE flips both
  // together but the FE polls them independently.
  if (phase === "l2_credited" || phase === "finalized") {
    return {
      label: direction === "withdraw" ? "Withdrawal Complete" : "Bridge Complete",
      color: "text-success",
      icon: <CheckCircle2 className="h-4 w-4" />,
      isTerminal: true,
    };
  }

  // In-flight phases — pick label, color, and icon by position in the
  // native phase machine.
  switch (phase) {
    case "pending_l1_init":
      return { label: "Submitting on L1", color: "text-muted-foreground", icon: <Clock className="h-4 w-4 animate-pulse" />, isTerminal: false };
    case "pending_l2_init":
      return { label: "Submitting on L2", color: "text-muted-foreground", icon: <Clock className="h-4 w-4 animate-pulse" />, isTerminal: false };
    case "l1_confirmed":
      return { label: "Awaiting L2 Credit", color: "text-primary", icon: <Radio className="h-4 w-4 animate-pulse" />, isTerminal: false };
    case "awaiting_game":
      return { label: "Awaiting Dispute Game", color: "text-chart-4", icon: <Clock className="h-4 w-4 animate-pulse" />, isTerminal: false };
    case "ready_to_prove":
      return { label: "Ready to Prove", color: "text-primary", icon: <Clock className="h-4 w-4 animate-pulse" />, isTerminal: false };
    case "proving":
      return { label: "Proving Withdrawal", color: "text-primary", icon: <Layers className="h-4 w-4 animate-pulse" />, isTerminal: false };
    case "proven":
    case "awaiting_finalization":
      return { label: "Awaiting Proof Maturity", color: "text-chart-4", icon: <Clock className="h-4 w-4 animate-pulse" />, isTerminal: false };
    case "ready_to_finalize":
      return { label: "Ready to Finalize", color: "text-primary", icon: <Clock className="h-4 w-4 animate-pulse" />, isTerminal: false };
    case "finalizing":
      return { label: "Finalizing Withdrawal", color: "text-primary", icon: <Layers className="h-4 w-4 animate-pulse" />, isTerminal: false };
    case "game_invalidated":
      return { label: "Game Invalidated, Re-proving", color: "text-chart-4", icon: <AlertTriangle className="h-4 w-4" />, isTerminal: false };
  }

  // Unknown / not-yet-set phase — newly-submitted session before BE polls
  // back the first phase.
  return {
    label: "Submitting Bridge",
    color: "text-muted-foreground",
    icon: <Clock className="h-4 w-4 animate-pulse" />,
    isTerminal: false,
  };
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
/*  Block confirmation progress                                        */
/* ------------------------------------------------------------------ */

function formatEta(seconds: number): string {
  if (seconds <= 0) return "< 1s";
  if (seconds < 60) return `~${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return secs > 0 ? `~${mins}m ${secs}s` : `~${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `~${hrs}h ${remainMins}m` : `~${hrs}h`;
}

function ConfirmationProgress({
  current,
  required,
  progress,
  etaSeconds,
}: {
  current: number;
  required: number;
  progress: number;
  etaSeconds: number | null;
}) {
  const pct = Math.min(progress * 100, 100);
  const isDone = current >= required;

  return (
    <div className="flex flex-col gap-1.5 px-4 pb-3">
      <div className="flex items-center justify-between text-[10px] font-mono">
        <span className="text-muted-foreground">
          Block Confirmations
        </span>
        <span className={cn("tabular-nums", isDone ? "text-success" : "text-primary")}>
          {current.toLocaleString()} / {required.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700 ease-out",
            isDone ? "bg-success" : "bg-primary"
          )}
          style={{ width: `${Math.max(pct, 0.5)}%` }}
        />
      </div>
      {!isDone && etaSeconds != null && etaSeconds > 0 && (
        <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground/60">
          <span>{Math.round(pct)}%</span>
          <span>ETA {formatEta(etaSeconds)}</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main tracking card                                                  */
/* ------------------------------------------------------------------ */

export function TrackingCard({ session }: { session: BridgeSession }) {
  const { updateSession, setActiveSession } = useBridgeStore();
  const network = useNetworkStore((s) => s.network);
  const LZ_SCAN_BASE = getLzScanBase(network);
  const phase = derivePhase(session);
  // OP Stack native bridge sessions: hide every LZ-specific UI block (LZ
  // Scan link, LZ Msg / Dest Tx rows, "LayerZero is still indexing" banner,
  // compose section, roundtrip return-leg). The phase progress bar is
  // already swapped for <NativePhaseTimeline> below; everything else just
  // doesn't apply.
  const isNative = session.bridgeKind === "native";
  // Native sessions get their own header derived from session.nativePhase —
  // derivePhase() is LZ-only and produces misleading copy ("Confirming on
  // Source", "LZ Indexing") on native rows.
  const nativeHeader = isNative ? deriveNativeHeader(session) : null;
  const headerLabel = nativeHeader?.label ?? phaseLabel(phase);
  const headerColor = nativeHeader?.color ?? phaseColor(phase);
  const headerIcon = nativeHeader?.icon ?? phaseIcon(phase);
  const isHeaderTerminal = nativeHeader?.isTerminal ?? false;
  const [expanded, setExpanded] = useState(phase === "failed" || (isNative && nativeHeader?.label === "Failed"));

  // Block confirmation tracking for "indexing" / "waiting" phases. Native
  // sessions skip this — OP Stack derivation deposits at `safe` head
  // (~30s on Sepolia), well before LZ-style 15-confirmation thresholds, so
  // an N/15 counter is misleading.
  const bridgeTxHash = session.selfBridgeTxHash || session.backendProcessTxHash;
  const showConfirmations = !isNative && (phase === "indexing" || phase === "waiting" || phase === "inflight") && !!bridgeTxHash;
  const confirmations = useBlockConfirmations(
    showConfirmations ? session.sourceChainId : undefined,
    showConfirmations ? bridgeTxHash : undefined,
  );
  const [pollCount, setPollCount] = useState(0);
  const lz = session.lzTracking;
  const sourceChain = CHAINS[session.sourceChainId];
  const destChain = CHAINS[session.destChainId];
  const token = TOKENS[session.tokenKey];
  const { config } = useBridgeConfig();
  const isTerminal = phase === "complete" || phase === "return_complete" || phase === "failed" || phase === "recovered";
  const isRoundTrip = isDappRoundTrip(config, session.dappId ?? 0) || isRoundTripFallback(session.dappId ?? 0);
  const phaseSteps = isRoundTrip
    ? PHASE_STEPS_ROUNDTRIP
    : hasCompose(session)
      ? PHASE_STEPS_COMPOSE
      : PHASE_STEPS_DIRECT;

  // Pulse effect for active tracking
  // Native terminal success/failure drives the border color too.
  const isNativeSuccess = isNative && nativeHeader?.isTerminal && headerColor === "text-success";
  const isNativeFailed = isNative && nativeHeader?.isTerminal && headerColor === "text-destructive-foreground";
  const borderClass = cn(
    "rounded-lg border transition-all duration-500",
    !isNative && phase === "complete" && "border-success/40 bg-success/5",
    !isNative && phase === "recovered" && "border-chart-4/40 bg-chart-4/5",
    !isNative && phase === "failed" && "border-destructive/40 bg-destructive/5",
    !isNative && !isTerminal && "border-primary/30 bg-primary/5",
    isNativeSuccess && "border-success/40 bg-success/5",
    isNativeFailed && "border-destructive/40 bg-destructive/5",
    isNative && !isHeaderTerminal && "border-primary/30 bg-primary/5",
  );
  const headerActive = isNative ? !isHeaderTerminal : !isTerminal;

  return (
    <div className={borderClass}>
      {/* Header strip */}
      <div className="px-4 py-3 flex items-center gap-3">
        <div className={cn("shrink-0", headerColor)}>
          {headerIcon}
        </div>

        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("text-sm font-mono font-medium", headerColor)}>
              {headerLabel}
              {showConfirmations && confirmations.required > 0 && !confirmations.isLoading && (
                <span className="text-xs text-muted-foreground font-normal ml-1.5">
                  ({confirmations.current}/{confirmations.required})
                </span>
              )}
            </span>
            {headerActive && <ElapsedTimer since={session.createdAt} />}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
            <ChainIcon chainKey={sourceChain?.iconKey} className="h-3 w-3 shrink-0" />
            <span>{sourceChain?.shortLabel}</span>
            <ArrowRight className="h-2.5 w-2.5" />
            <ChainIcon chainKey={destChain?.iconKey} className="h-3 w-3 shrink-0" />
            <span>{destChain?.shortLabel}</span>
            <span className="text-muted-foreground/30">|</span>
            <span>{session.amount} {token?.symbol}</span>
            {session.bridgeMode === "self" && (
              <>
                <span className="text-muted-foreground/30">|</span>
                <span className="text-chart-4">Self</span>
              </>
            )}
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

        {/* LZ Scan link — LZ-only */}
        {!isNative && (session.lzTxHash || session.backendProcessTxHash || session.selfBridgeTxHash || lz?.srcTxHash) && (
          <a
            href={`${LZ_SCAN_BASE}/tx/${session.lzTxHash || session.backendProcessTxHash || session.selfBridgeTxHash || lz?.srcTxHash}`}
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

      {/* Bridge tx hashes (always visible) */}
      {(session.selfBridgeTxHash || session.backendProcessTxHash) && (
        <div className="px-4 pb-2 flex flex-wrap items-center gap-2">
          {/* Fund Tx: only for vault-funded flows with a separate transfer */}
          {session.userTransferTxHash && session.userTransferTxHash !== "permit2" &&
           session.userTransferTxHash !== (session.selfBridgeTxHash || session.backendProcessTxHash) && (
            <TxBadge
              label="Fund Tx"
              hash={session.userTransferTxHash}
              explorerUrl={sourceChain?.explorerTxUrl(session.userTransferTxHash)}
              className="!py-0.5 !text-[10px]"
            />
          )}
          <TxBadge
            label="Bridge Tx"
            hash={(session.selfBridgeTxHash || session.backendProcessTxHash)!}
            explorerUrl={sourceChain?.explorerTxUrl((session.selfBridgeTxHash || session.backendProcessTxHash)!)}
            className="!py-0.5 !text-[10px]"
          />
        </div>
      )}

      {/* Return leg tx hash for roundtrip */}
      {isRoundTrip && session.returnLeg?.bridgeTxHash && (
        <div className="px-4 pb-2 flex flex-wrap items-center gap-2">
          <TxBadge
            label="Return Tx"
            hash={session.returnLeg.bridgeTxHash}
            explorerUrl={destChain?.explorerTxUrl(session.returnLeg.bridgeTxHash)}
            className="!py-0.5 !text-[10px]"
          />
        </div>
      )}

      {/* Progress bar — native bridge has its own multi-phase timeline driven
          by the BE-managed phase machine; LZ uses the existing phaseSteps map. */}
      <div className="px-4 pb-3">
        {session.bridgeKind === "native" ? (
          <NativePhaseTimeline
            direction={(session.direction ?? "deposit") as "deposit" | "withdraw"}
            phase={session.nativePhase ?? "pending_l2_init"}
          />
        ) : (
          <PhaseProgressBar steps={phaseSteps} current={phase} labels={PHASE_LABELS} />
        )}
      </div>

      {/* Block confirmation progress */}
      {showConfirmations && confirmations.required > 0 && !confirmations.isLoading && (
        <ConfirmationProgress
          current={confirmations.current}
          required={confirmations.required}
          progress={confirmations.progress}
          etaSeconds={confirmations.etaSeconds}
        />
      )}

      {/* Recovered banner */}
      {phase === "recovered" && (
        <div className="px-4 pb-3">
          <div className="px-3 py-2 rounded bg-chart-4/10 border border-chart-4/20 text-[11px] font-mono text-chart-4 flex items-start gap-2">
            <ArrowDownToLine className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <div>
              Tokens were recovered from the vault back to your wallet. This session was not bridged.
            </div>
          </div>
        </div>
      )}

      {/* Error + retry: always visible for failed sessions */}
      {phase === "failed" && (
        <div className="px-4 pb-3 flex flex-col gap-2">
          <div className="px-3 py-2 rounded bg-destructive/10 border border-destructive/20 text-[11px] font-mono text-destructive-foreground flex items-start gap-2">
            <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <div>
              {hasCompose(session) && isComposeFailed(session) && !session.error
                ? "lzCompose failed on the destination chain. The compose execution reverted."
                : (session.error ?? "The bridge transaction failed.")
              }
            </div>
          </div>
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
            {/* Fund Tx: only for vault-funded flows with a separate transfer */}
            {session.userTransferTxHash && session.userTransferTxHash !== "permit2" &&
             session.userTransferTxHash !== (session.selfBridgeTxHash || session.backendProcessTxHash) && (
              <TxBadge
                label="Fund Tx"
                hash={session.userTransferTxHash}
                explorerUrl={sourceChain?.explorerTxUrl(session.userTransferTxHash)}
              />
            )}
            <TxBadge
              label="Bridge Tx"
              hash={session.selfBridgeTxHash || session.backendProcessTxHash}
              explorerUrl={
                (session.selfBridgeTxHash || session.backendProcessTxHash)
                  ? sourceChain?.explorerTxUrl((session.selfBridgeTxHash || session.backendProcessTxHash)!)
                  : undefined
              }
            />
            {!isNative && (
              <>
                <TxBadge
                  label="LZ Msg"
                  hash={lz?.guid ?? session.lzMessageId}
                  explorerUrl={
                    (session.lzTxHash || session.backendProcessTxHash || session.selfBridgeTxHash || lz?.srcTxHash)
                      ? `${LZ_SCAN_BASE}/tx/${session.lzTxHash || session.backendProcessTxHash || session.selfBridgeTxHash || lz?.srcTxHash}`
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
              </>
            )}
          </div>

          {/* Compose info — LZ-only (compose layer doesn't exist on native) */}
          {!isNative && hasCompose(session) && lz?.composeStatus && lz.composeStatus !== "UNKNOWN" && (
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

          {/* Return bridge info — roundtrip sessions (LZ-only) */}
          {!isNative && isRoundTrip && session.returnLeg && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                Return Bridge ({destChain?.shortLabel} → {sourceChain?.shortLabel})
              </span>
              <TxBadge
                label="Return Bridge Tx"
                hash={session.returnLeg.bridgeTxHash}
                explorerUrl={
                  session.returnLeg.bridgeTxHash
                    ? destChain?.explorerTxUrl(session.returnLeg.bridgeTxHash)
                    : undefined
                }
              />
              {session.returnLeg.lzTracking?.guid && (
                <TxBadge
                  label="Return LZ Msg"
                  hash={session.returnLeg.lzTracking.guid}
                  explorerUrl={
                    session.returnLeg.bridgeTxHash
                      ? `${LZ_SCAN_BASE}/tx/${session.returnLeg.bridgeTxHash}`
                      : undefined
                  }
                />
              )}
              {session.returnLeg.lzTracking?.dstTxHash && (
                <TxBadge
                  label="Return Dest Tx"
                  hash={session.returnLeg.lzTracking.dstTxHash}
                  explorerUrl={sourceChain?.explorerTxUrl(session.returnLeg.lzTracking.dstTxHash)}
                />
              )}
              {session.returnLeg.lzTracking?.lzStatus && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground shrink-0">Status</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/50 text-foreground">
                    {session.returnLeg.lzTracking.rawStatus ?? session.returnLeg.lzTracking.lzStatus}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Addresses & Details */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
              Addresses & Details
            </span>
            <AddressPill label="From" address={session.userAddress} />
            <AddressPill
              label="To"
              address={
                session.recipientAddress === session.userAddress
                  ? undefined
                  : session.recipientAddress
              }
            />
            {session.recipientAddress === session.userAddress && (
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground shrink-0">To</span>
                <span className="text-[11px] font-mono text-muted-foreground italic">self</span>
              </div>
            )}
            {session.depositAddress && !isNative && (
              <div className="flex items-center gap-1.5 min-w-0">
                <AddressPill label="Vault" address={session.depositAddress} />
                <Link
                  href={`/recover/${session.depositAddress}`}
                  className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                  title="Recover tokens from vault"
                >
                  <ArrowDownToLine className="h-2.5 w-2.5" />
                </Link>
              </div>
            )}
            {/* Dapp / compose routing only exists on the LZ flow. */}
            {!isNative && (
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground shrink-0">Dapp</span>
                <span className="text-[11px] font-mono text-foreground">
                  {KNOWN_DAPPS.find((d) => d.dappId === (session.dappId ?? 0))?.label ?? `#${session.dappId ?? 0}`}
                </span>
              </div>
            )}
          </div>

          {/* Source / destination chain info. Native bridge uses EVM chain
              IDs natively; show the chain label instead of LZ EIDs and skip
              the lz-tracking sender/receiver address pulls (those come from
              LZ Scan, not from native indexing). */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                <ChainIcon chainKey={sourceChain?.iconKey} className="h-3 w-3" />
                Source
              </span>
              <span className="text-[11px] font-mono text-foreground">
                {isNative
                  ? sourceChain?.label ?? `Chain ${session.sourceChainId}`
                  : `EID ${lz?.srcEid ?? sourceChain?.lzEid ?? "--"}`}
              </span>
              {!isNative && <AddressPill label="Sender" address={lz?.sender} />}
            </div>
            <div className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                <ChainIcon chainKey={destChain?.iconKey} className="h-3 w-3" />
                Destination
              </span>
              <span className="text-[11px] font-mono text-foreground">
                {isNative
                  ? destChain?.label ?? `Chain ${session.destChainId}`
                  : `EID ${lz?.dstEid ?? destChain?.lzEid ?? "--"}`}
              </span>
              {!isNative && <AddressPill label="Receiver" address={lz?.receiver} />}
            </div>
          </div>

          {/* Raw LZ status — LZ-only */}
          {!isNative && lz?.rawStatus && (
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

          {/* Nudge / retry for stalled waiting phase — LZ-only. Native
              bridge has its own multi-step phase machine and a 25-min
              expected duration; the "1-3 minutes" copy doesn't apply. */}
          {!isNative && phase === "waiting" && (Date.now() - session.createdAt > 120_000) && (
            <div className="flex flex-col gap-2">
              <div className="px-3 py-2 rounded bg-warning/10 border border-warning/20 text-[11px] font-mono text-warning flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <div>
                  {session.selfBridgeTxHash ? (
                    <>
                      <span className="font-medium">Taking longer than expected.</span>{" "}
                      LayerZero is still indexing your transaction. This usually takes 1-3 minutes.
                      Check{" "}
                      <a
                        href={`${LZ_SCAN_BASE}/tx/${session.selfBridgeTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline text-primary"
                      >
                        LZ Scan
                      </a>{" "}
                      for the latest status.
                    </>
                  ) : (
                    <>
                      <span className="font-medium">Taking longer than expected.</span>{" "}
                      You can nudge the backend to retry processing, or call{" "}
                      <code className="text-foreground bg-muted/50 px-1 rounded">rescueFunds()</code> on
                      the GlobalDeposit contract to recover your tokens.
                    </>
                  )}
                </div>
              </div>
              {/* Re-submit button — only for operator-mode sessions without a job yet */}
              {!session.selfBridgeTxHash && !session.jobId && session.userTransferTxHash && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="font-mono text-xs gap-1.5 border-warning/30 hover:bg-warning/10 text-warning"
                    onClick={async () => {
                      try {
                        const token = getTokenAddress(session.tokenKey, session.sourceChainId);
                        if (!token) throw new Error("Token address not found");
                        const res = await submitVaultFunded({
                          srcEid: chainIdToEid(session.sourceChainId),
                          dstEid: chainIdToEid(session.destChainId),
                          userTransferTxHash: session.userTransferTxHash!,
                          token,
                          receiver: session.recipientAddress ?? session.userAddress,
                          dappId: session.dappId ?? 0,
                        }, network);
                        const updated: BridgeSession = {
                          ...session,
                          status: mapBackendStatus(res.status),
                          jobId: res.jobId,
                          error: undefined,
                        };
                        updateSession(session.id, {
                          status: updated.status,
                          jobId: updated.jobId,
                          error: undefined,
                        });
                        // Re-select to trigger bridge-panel polling resume effect
                        setActiveSession(updated);
                      } catch (err) {
                        const msg = err instanceof Error ? err.message : "Submit failed";
                        updateSession(session.id, { error: msg });
                      }
                    }}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Submit to Backend
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* (Error + retry is shown above the expanded panel, always visible) */}
        </div>
      )}

      {/* Recovery panel — shown inline when eligible */}
      {expanded && (isVaultRescueEligible(session) || isComposeRescueNeeded(session)) && (
        <RecoveryPanel session={session} />
      )}
    </div>
  );
}
