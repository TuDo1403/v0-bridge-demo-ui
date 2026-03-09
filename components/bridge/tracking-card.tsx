"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useBridgeStore } from "@/lib/bridge-store";
import { submitVaultFunded } from "@/lib/bridge-service";
import { mapBackendStatus, isComposeFailed, isVaultRescueEligible, isComposeRescueNeeded } from "@/lib/types";
import { CHAINS, chainIdToEid, getLzScanBase, BLOCK_TIME_SECONDS } from "@/config/chains";
import { useNetworkStore } from "@/lib/network-store";
import { useBlockConfirmations } from "@/hooks/use-block-confirmations";
import { TOKENS, getTokenAddress, KNOWN_DAPPS } from "@/config/contracts";
import type { BridgeSession } from "@/lib/types";
import { TxBadge } from "./tx-badge";
import { RecoveryPanel } from "./recovery-panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChainIcon } from "./chain-icon";
import { AddressPill } from "./address-pill";
import { PhaseProgressBar } from "./phase-progress-bar";
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
  | "failed";       // LZ or compose error

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

const PHASE_LABELS: Record<TrackingPhase, string> = {
  waiting: "Waiting for Indexing",
  indexing: "Confirming on Source",
  inflight: "In Flight",
  delivered: "Delivered",
  verifying: "Executing Compose",
  complete: "Complete",
  recovered: "Recovered",
  failed: "Failed",
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
  }
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
  const [expanded, setExpanded] = useState(phase === "failed");

  // Block confirmation tracking for "indexing" / "waiting" phases
  const bridgeTxHash = session.selfBridgeTxHash || session.backendProcessTxHash;
  const showConfirmations = (phase === "indexing" || phase === "waiting" || phase === "inflight") && !!bridgeTxHash;
  const confirmations = useBlockConfirmations(
    showConfirmations ? session.sourceChainId : undefined,
    showConfirmations ? bridgeTxHash : undefined,
  );
  const [pollCount, setPollCount] = useState(0);
  const lz = session.lzTracking;
  const sourceChain = CHAINS[session.sourceChainId];
  const destChain = CHAINS[session.destChainId];
  const token = TOKENS[session.tokenKey];
  const isTerminal = phase === "complete" || phase === "failed" || phase === "recovered";
  const phaseSteps = hasCompose(session) ? PHASE_STEPS_COMPOSE : PHASE_STEPS_DIRECT;

  // Pulse effect for active tracking
  const borderClass = cn(
    "rounded-lg border transition-all duration-500",
    phase === "complete" && "border-success/40 bg-success/5",
    phase === "recovered" && "border-chart-4/40 bg-chart-4/5",
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
              {showConfirmations && confirmations.required > 0 && !confirmations.isLoading && (
                <span className="text-xs text-muted-foreground font-normal ml-1.5">
                  ({confirmations.current}/{confirmations.required})
                </span>
              )}
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

        {/* LZ Scan link */}
        {(session.lzTxHash || session.backendProcessTxHash || session.selfBridgeTxHash || lz?.srcTxHash) && (
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

      {/* Progress bar */}
      <div className="px-4 pb-3">
        <PhaseProgressBar steps={phaseSteps} current={phase} labels={PHASE_LABELS} />
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
          </div>

          {/* Compose info — only for compose sessions (dappId > 0) */}
          {hasCompose(session) && lz?.composeStatus && lz.composeStatus !== "UNKNOWN" && (
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
            {session.depositAddress && (
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
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground shrink-0">Dapp</span>
              <span className="text-[11px] font-mono text-foreground">
                {KNOWN_DAPPS.find((d) => d.dappId === (session.dappId ?? 0))?.label ?? `#${session.dappId ?? 0}`}
              </span>
            </div>
          </div>

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

          {/* Nudge / retry for stalled waiting phase */}
          {phase === "waiting" && (Date.now() - session.createdAt > 120_000) && (
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
