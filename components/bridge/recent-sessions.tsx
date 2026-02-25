"use client";

import { useState } from "react";
import { useBridgeStore } from "@/lib/bridge-store";
import { retryBridgeJob } from "@/lib/bridge-service";
import { STATUS_LABELS, mapBackendStatus, type BridgeSession, type BridgeStatus } from "@/lib/types";
import { CHAINS } from "@/config/chains";
import { TOKENS, buildComposeData } from "@/config/contracts";
import { cn } from "@/lib/utils";
import { ChainIcon } from "./chain-icon";
import { Button } from "@/components/ui/button";
import {
  Clock,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Zap,
  Radio,
  X,
  RotateCcw,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Derive a tiny icon + color from the session's LZ tracking phase    */
/* ------------------------------------------------------------------ */

function sessionIndicator(session: BridgeSession) {
  const s = session.status;
  const lz = session.lzTracking;

  if (s === "completed")
    return { icon: <CheckCircle2 className="h-3 w-3" />, color: "text-success" };
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
  const updateSession = useBridgeStore((s) => s.updateSession);
  const removeSession = useBridgeStore((s) => s.removeSession);
  const sourceLabel = CHAINS[session.sourceChainId]?.shortLabel ?? "??";
  const destLabel = CHAINS[session.destChainId]?.shortLabel ?? "??";
  const token = TOKENS[session.tokenKey];
  const timeAgo = getTimeAgo(session.createdAt);
  const { icon, color } = sessionIndicator(session);
  const [retrying, setRetrying] = useState(false);

  const isFailed = session.status === "error" || session.status === "failed";
  const isTerminal = session.status === "completed" || isFailed;

  // Phantom = awaiting_transfer without a tx hash (user never actually sent)
  const isPhantom =
    session.status === "awaiting_transfer" && !session.userTransferTxHash;

  const handleRetryClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!session.jobId || retrying) return;
    setRetrying(true);
    try {
      const composeData = buildComposeData(session);
      const res = await retryBridgeJob(session.jobId, composeData);
      updateSession(session.id, {
        status: mapBackendStatus(res.status),
        error: undefined,
      });
      // Select the session so bridge panel shows the polling view
      setActiveSession({ ...session, status: mapBackendStatus(res.status), error: undefined });
    } catch (err) {
      updateSession(session.id, {
        error: err instanceof Error ? err.message : "Retry failed",
      });
    } finally {
      setRetrying(false);
    }
  };

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
          "flex items-center gap-2.5 px-3 py-2 rounded transition-all w-full text-left group",
          isActive
            ? "bg-primary/10 border border-primary/20"
            : "bg-muted/30 hover:bg-muted/60 border border-transparent"
        )}
      >
        <div className={cn("shrink-0", color)}>{icon}</div>

        <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground min-w-0">
          <ChainIcon chainKey={CHAINS[session.sourceChainId]?.iconKey} className="h-3 w-3 shrink-0" />
          <span>{sourceLabel}</span>
          <ArrowRight className="h-2.5 w-2.5 shrink-0" />
          <ChainIcon chainKey={CHAINS[session.destChainId]?.iconKey} className="h-3 w-3 shrink-0" />
          <span>{destLabel}</span>
        </div>

        <span className="text-[11px] font-mono text-foreground whitespace-nowrap">
          {session.amount} {token?.symbol ?? session.tokenKey}
        </span>

        <span
          className={cn(
            "text-[9px] font-mono px-1.5 py-0.5 rounded ml-auto shrink-0 whitespace-nowrap",
            session.status === "completed" && "bg-success/15 text-success",
            isFailed && "bg-destructive/15 text-destructive-foreground",
            !isTerminal && "bg-primary/15 text-primary"
          )}
        >
          {session.lzTracking?.lzStatus
            ? session.lzTracking.lzStatus.replace("lz_", "").toUpperCase()
            : STATUS_LABELS[session.status]}
        </span>

        <span className="text-[9px] text-muted-foreground/50 font-mono shrink-0 hidden sm:block">
          {timeAgo}
        </span>

        {/* Dismiss button for phantom or terminal sessions */}
        {(isPhantom || isTerminal) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeSession(session.id);
            }}
            className="shrink-0 text-muted-foreground/40 hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
            title="Remove session"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </button>

      {/* Retry button for failed sessions with a jobId */}
      {isFailed && session.jobId && isActive && (
        <Button
          variant="outline"
          size="sm"
          disabled={retrying}
          onClick={handleRetryClick}
          className="mx-3 mb-1 h-8 font-mono text-[10px] gap-1.5 border-destructive/30 hover:bg-destructive/10 text-destructive-foreground"
        >
          {retrying ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RotateCcw className="h-3 w-3" />
          )}
          {retrying ? "Retrying..." : "Retry Bridge Job"}
        </Button>
      )}

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
  const sessions = useBridgeStore((s) => s.recentSessions);
  const activeSession = useBridgeStore((s) => s.activeSession);

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
