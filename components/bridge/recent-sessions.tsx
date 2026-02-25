"use client";

import { useBridgeStore } from "@/lib/bridge-store";
import { STATUS_LABELS, type BridgeSession } from "@/lib/types";
import { CHAINS } from "@/config/chains";
import { TOKENS } from "@/config/contracts";
import { cn } from "@/lib/utils";
import { Clock, ArrowRight } from "lucide-react";

function SessionRow({ session }: { session: BridgeSession }) {
  const setActiveSession = useBridgeStore((s) => s.setActiveSession);
  const sourceLabel = CHAINS[session.sourceChainId]?.shortLabel ?? "??";
  const destLabel = CHAINS[session.destChainId]?.shortLabel ?? "??";
  const token = TOKENS[session.tokenKey];
  const timeAgo = getTimeAgo(session.createdAt);

  const isTerminal =
    session.status === "completed" || session.status === "error";

  return (
    <button
      onClick={() => setActiveSession(session)}
      className="flex items-center gap-3 px-3 py-2 rounded bg-muted/30 hover:bg-muted/60 transition-colors w-full text-left group"
    >
      <div
        className={cn(
          "h-1.5 w-1.5 rounded-full shrink-0",
          session.status === "completed" && "bg-success",
          session.status === "error" && "bg-destructive",
          !isTerminal && "bg-primary animate-pulse"
        )}
      />
      <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground min-w-0">
        <span>{sourceLabel}</span>
        <ArrowRight className="h-2.5 w-2.5 shrink-0" />
        <span>{destLabel}</span>
      </div>
      <span className="text-xs font-mono text-foreground">
        {session.amount} {token?.symbol ?? session.tokenKey}
      </span>
      <span
        className={cn(
          "text-[10px] font-mono px-1.5 py-0.5 rounded ml-auto shrink-0",
          session.status === "completed" && "bg-success/15 text-success",
          session.status === "error" && "bg-destructive/15 text-destructive-foreground",
          !isTerminal && "bg-primary/15 text-primary"
        )}
      >
        {STATUS_LABELS[session.status]}
      </span>
      <span className="text-[10px] text-muted-foreground/50 font-mono shrink-0 hidden sm:block">
        {timeAgo}
      </span>
    </button>
  );
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

export function RecentSessions() {
  const sessions = useBridgeStore((s) => s.recentSessions);

  if (sessions.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-4 text-xs font-mono text-muted-foreground/50">
        <Clock className="h-3 w-3" />
        No recent sessions
      </div>
    );
  }

  // Show most recent first, limit to 5
  const displayed = [...sessions].reverse().slice(0, 5);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
        Recent Sessions
      </span>
      {displayed.map((session) => (
        <SessionRow key={session.id} session={session} />
      ))}
    </div>
  );
}
