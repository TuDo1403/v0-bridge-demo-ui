"use client";

import { useState } from "react";
import { useBridgeStore } from "@/lib/bridge-store";
import { useNetworkStore } from "@/lib/network-store";
import { STATUS_LABELS, isComposeFailed, isVaultRescueEligible, isComposeRescueNeeded, type BridgeSession } from "@/lib/types";
import { CHAINS } from "@/config/chains";
import { TOKENS } from "@/config/contracts";
import { cn } from "@/lib/utils";
import { ChainIcon } from "./chain-icon";
import { NativeKindBadge } from "./native-kind-badge";
import { Button } from "@/components/ui/button";
import {
  Clock,
  ArrowRight,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  Zap,
  Radio,
  X,
  RotateCcw,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Derive a tiny icon + color from the session's LZ tracking phase    */
/* ------------------------------------------------------------------ */

function sessionIndicator(session: BridgeSession) {
  const s = session.status;
  const lz = session.lzTracking;

  if (s === "completed")
    return { icon: <CheckCircle2 className="h-3 w-3" />, color: "text-success" };
  if (s === "recovered")
    return { icon: <ArrowDownLeft className="h-3 w-3" />, color: "text-chart-4" };
  if (s === "error" || s === "failed")
    return { icon: <XCircle className="h-3 w-3" />, color: "text-destructive-foreground" };

  if (lz?.lzStatus === "lz_inflight")
    return { icon: <Zap className="h-3 w-3 animate-pulse" />, color: "text-primary" };
  if (lz?.lzStatus === "lz_indexing")
    return { icon: <Radio className="h-3 w-3 animate-pulse" />, color: "text-chart-4" };
  if (lz?.lzStatus === "lz_delivered")
    return { icon: <CheckCircle2 className="h-3 w-3" />, color: "text-primary" };

  // Fallback: generic active spinner
  return { icon: <Loader2 className="h-3 w-3 animate-spin" />, color: "text-muted-foreground" };
}

function getTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

/* ------------------------------------------------------------------ */
/*  Session row                                                        */
/* ------------------------------------------------------------------ */

function SessionRow({
  session,
  isActive,
}: {
  session: BridgeSession;
  isActive: boolean;
}) {
  const setActiveSession = useBridgeStore((s) => s.setActiveSession);
  const removeSession = useBridgeStore((s) => s.removeSession);
  const sourceLabel = CHAINS[session.sourceChainId]?.shortLabel ?? "??";
  const destLabel = CHAINS[session.destChainId]?.shortLabel ?? "??";
  const token = TOKENS[session.tokenKey];
  const timeAgo = getTimeAgo(session.createdAt);
  const { icon, color } = sessionIndicator(session);

  const composeFailed = isComposeFailed(session);
  const isFailed = session.status === "error" || session.status === "failed" || composeFailed;
  const isRecovered = session.status === "recovered";
  const isTerminal = session.status === "completed" || isRecovered || isFailed;

  // Phantom = awaiting_transfer without a tx hash (user never actually sent)
  const isPhantom =
    session.status === "awaiting_transfer" && !session.userTransferTxHash;

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={() => {
          // Only toggle off if truly idle with no backend job
          if (isActive && session.status === "idle" && !session.jobId) {
            setActiveSession(null);
          } else {
            setActiveSession(session);
          }
        }}
        className={cn(
          "grid grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] sm:grid-cols-[auto_auto_minmax(0,1fr)_auto_auto_auto] items-center gap-2.5 px-3 py-2 rounded transition-all w-full text-left group",
          isActive
            ? "bg-primary/10 border border-primary/20"
            : "bg-muted/30 hover:bg-muted/60 border border-transparent"
        )}
      >
        <div className={cn("shrink-0", color)}>{icon}</div>

        {/* Direction arrow */}
        {session.direction === "withdraw" ? (
          <span title="Withdrawal"><ArrowDownLeft className="h-3 w-3 text-chart-5 shrink-0" /></span>
        ) : (
          <span title="Deposit"><ArrowUpRight className="h-3 w-3 text-primary shrink-0" /></span>
        )}

        <div className="min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground min-w-0">
            {session.bridgeKind === "native" && (
              <NativeKindBadge kind="native" className="!py-0 !text-[8px] shrink-0" textOnly />
            )}
            <ChainIcon chainKey={CHAINS[session.sourceChainId]?.iconKey} className="h-3 w-3 shrink-0" />
            <span className="truncate">{sourceLabel}</span>
            <ArrowRight className="h-2.5 w-2.5 shrink-0" />
            <ChainIcon chainKey={CHAINS[session.destChainId]?.iconKey} className="h-3 w-3 shrink-0" />
            <span className="truncate">{destLabel}</span>
          </div>

          <span className="text-[11px] font-mono text-foreground truncate">
            {session.amount} {token?.symbol ?? session.tokenKey}
          </span>
        </div>

        <span
          className={cn(
            "text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap justify-self-end",
            session.status === "completed" && "bg-success/15 text-success",
            isRecovered && "bg-chart-4/15 text-chart-4",
            isFailed && "bg-destructive/15 text-destructive-foreground",
            !isTerminal && "bg-primary/15 text-primary"
          )}
        >
          {session.lzTracking?.lzStatus
            ? session.lzTracking.lzStatus.replace("lz_", "").toUpperCase()
            : STATUS_LABELS[session.status]}
        </span>

        {/* Recovery eligibility indicators */}
        {isVaultRescueEligible(session) && (
          <span className="shrink-0" title="Vault recovery available">
            <AlertTriangle className="h-3 w-3 text-chart-4" />
          </span>
        )}
        {isComposeRescueNeeded(session) && (
          <span className="shrink-0" title="Compose recovery needed">
            <ShieldAlert className="h-3 w-3 text-chart-4" />
          </span>
        )}

        <span className="text-[9px] text-muted-foreground/50 font-mono shrink-0 hidden sm:block justify-self-end">
          {timeAgo}
        </span>

        {/* Dismiss: use span with role to avoid nested button */}
        {(isPhantom || isTerminal) && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              removeSession(session.id);
            }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); removeSession(session.id); } }}
            className="shrink-0 text-muted-foreground/40 hover:text-foreground transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
            title="Remove session"
          >
            <X className="h-3 w-3" />
          </span>
        )}
      </button>

      {/* Retry processing for failed sessions without jobId but with tx hash */}
      {isFailed && !session.jobId && session.userTransferTxHash && isActive && (
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            // Select to trigger bridge panel to re-process
            setActiveSession(session);
          }}
          className="mx-3 mb-1 h-8 font-mono text-[10px] gap-1.5 border-destructive/30 hover:bg-destructive/10 text-destructive-foreground"
        >
          <RotateCcw className="h-3 w-3" />
          Retry Processing
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function RecentSessions() {
  const allSessions = useBridgeStore((s) => s.recentSessions);
  const activeSession = useBridgeStore((s) => s.activeSession);
  const network = useNetworkStore((s) => s.network);

  // Filter sessions by current network (legacy sessions without network field show on mainnet)
  const sessions = allSessions.filter((s) => (s.network ?? "mainnet") === network);

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Recent Sessions
        </span>
        <div className="flex items-center gap-2 px-3 py-4 text-[11px] font-mono text-muted-foreground/50">
          <Clock className="h-3 w-3" />
          No recent sessions
        </div>
      </div>
    );
  }

  // Show most recent first, limit to 8
  const displayed = [...sessions].reverse().slice(0, 8);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Recent Sessions
        </span>
        <span className="text-[9px] font-mono text-muted-foreground/50">
          {sessions.length} total
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {displayed.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            isActive={activeSession?.id === session.id}
          />
        ))}
      </div>
    </div>
  );
}
