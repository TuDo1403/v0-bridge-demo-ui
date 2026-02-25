"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/bridge/page-shell";
import { useBridgeStore } from "@/lib/bridge-store";
import { STATUS_LABELS, type BridgeSession } from "@/lib/types";
import { CHAINS, LZ_SCAN_BASE } from "@/config/chains";
import { TOKENS } from "@/config/contracts";
import { TxBadge } from "@/components/bridge/tx-badge";
import { ChainIcon } from "@/components/bridge/chain-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Clock,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Search,
  X,
} from "lucide-react";

type FilterTab = "all" | "active" | "completed" | "failed";

function isSessionFailed(s: BridgeSession): boolean {
  const cs = s.lzTracking?.composeStatus?.toLowerCase() ?? "";
  return (
    s.status === "error" ||
    s.status === "failed" ||
    cs.includes("fail") ||
    cs.includes("revert") ||
    !!(s.status === "completed" && s.error?.toLowerCase().includes("compose"))
  );
}

function isSessionActive(s: BridgeSession): boolean {
  return !isSessionFailed(s) && s.status !== "completed";
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function statusBadge(session: BridgeSession) {
  const failed = isSessionFailed(session);
  const completed = session.status === "completed" && !failed;
  const active = isSessionActive(session);

  if (failed) {
    return (
      <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-destructive/15 text-destructive-foreground">
        <XCircle className="h-3 w-3" />
        Failed
      </span>
    );
  }
  if (completed) {
    return (
      <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-success/15 text-success">
        <CheckCircle2 className="h-3 w-3" />
        Completed
      </span>
    );
  }
  if (active) {
    return (
      <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-primary/15 text-primary">
        <Loader2 className="h-3 w-3 animate-spin" />
        {STATUS_LABELS[session.status]}
      </span>
    );
  }
  return null;
}

function SessionCard({ session }: { session: BridgeSession }) {
  const router = useRouter();
  const removeSession = useBridgeStore((s) => s.removeSession);
  const setActiveSession = useBridgeStore((s) => s.setActiveSession);
  const sourceChain = CHAINS[session.sourceChainId];
  const destChain = CHAINS[session.destChainId];
  const token = TOKENS[session.tokenKey];
  const failed = isSessionFailed(session);
  const completed = session.status === "completed" && !failed;

  const trackHash = session.lzTracking?.guid ?? session.backendProcessTxHash ?? session.userTransferTxHash;

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-3 p-4 rounded-lg border transition-colors",
        failed
          ? "border-destructive/20 bg-destructive/5 hover:bg-destructive/10"
          : completed
            ? "border-success/20 bg-success/5 hover:bg-success/10"
            : "border-border bg-card hover:bg-muted/30"
      )}
    >
      {/* Top row: route + amount + status */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <ChainIcon
              chainKey={sourceChain?.iconKey}
              className="h-4 w-4"
            />
            <span className="text-foreground">{sourceChain?.shortLabel ?? "??"}</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <ChainIcon
              chainKey={destChain?.iconKey}
              className="h-4 w-4"
            />
            <span className="text-foreground">{destChain?.shortLabel ?? "??"}</span>
          </div>
          <span className="text-xs font-mono font-medium text-foreground">
            {session.amount} {token?.symbol ?? session.tokenKey}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {statusBadge(session)}
          <button
            onClick={() => removeSession(session.id)}
            className="text-muted-foreground/30 hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
            title="Remove"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Middle: tx hashes */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {session.userTransferTxHash && (
          <TxBadge
            label="User Tx"
            hash={session.userTransferTxHash}
            explorerUrl={sourceChain?.explorerTxUrl(session.userTransferTxHash)}
          />
        )}
        {session.backendProcessTxHash && (
          <TxBadge
            label="Backend"
            hash={session.backendProcessTxHash}
            explorerUrl={sourceChain?.explorerTxUrl(session.backendProcessTxHash)}
          />
        )}
        {session.destinationTxHash && (
          <TxBadge
            label="Dest"
            hash={session.destinationTxHash}
            explorerUrl={destChain?.explorerTxUrl(session.destinationTxHash)}
          />
        )}
      </div>

      {/* Error message */}
      {session.error && (
        <div className="text-[10px] font-mono text-destructive-foreground bg-destructive/10 rounded px-2 py-1.5 break-all">
          {session.error}
        </div>
      )}

      {/* Bottom: time + actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground/50">
          <span>{formatDate(session.createdAt)}</span>
          <span>{getTimeAgo(session.createdAt)}</span>
          <span className="truncate max-w-[120px]" title={session.id}>
            ID: {session.id.slice(0, 8)}...
          </span>
        </div>

        <div className="flex items-center gap-2">
          {trackHash && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] font-mono gap-1"
              onClick={() => router.push(`/track/${trackHash}`)}
            >
              <Search className="h-3 w-3" />
              Track
            </Button>
          )}
          {session.lzTracking?.guid && (
            <a
              href={`${LZ_SCAN_BASE}/tx/${session.lzTracking.guid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] font-mono text-primary hover:text-primary/80 transition-colors"
            >
              LZ Scan
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
          {failed && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[10px] font-mono gap-1 border-destructive/30 hover:bg-destructive/10 text-destructive-foreground"
              onClick={() => {
                setActiveSession(session);
                router.push("/bridge");
              }}
            >
              Retry
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main history page                                                  */
/* ------------------------------------------------------------------ */

export function HistoryPage() {
  const sessions = useBridgeStore((s) => s.recentSessions);
  const [filter, setFilter] = useState<FilterTab>("all");

  const filtered = useMemo(() => {
    const sorted = [...sessions].reverse();
    switch (filter) {
      case "active":
        return sorted.filter((s) => isSessionActive(s));
      case "completed":
        return sorted.filter((s) => s.status === "completed" && !isSessionFailed(s));
      case "failed":
        return sorted.filter((s) => isSessionFailed(s));
      default:
        return sorted;
    }
  }, [sessions, filter]);

  const counts = useMemo(() => ({
    all: sessions.length,
    active: sessions.filter((s) => isSessionActive(s)).length,
    completed: sessions.filter((s) => s.status === "completed" && !isSessionFailed(s)).length,
    failed: sessions.filter((s) => isSessionFailed(s)).length,
  }), [sessions]);

  const TABS: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "completed", label: "Completed" },
    { key: "failed", label: "Failed" },
  ];

  return (
    <PageShell>
      <div className="p-4 sm:p-5 rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Session History
          </span>
          <span className="h-px flex-1 bg-border" />
          <span className="text-[10px] font-mono text-muted-foreground/50">
            {sessions.length} sessions
          </span>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 mb-4 p-1 rounded-lg bg-muted/20 border border-border/50 w-fit">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-colors",
                filter === key
                  ? "bg-primary/15 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              {label}
              {counts[key] > 0 && (
                <span className={cn(
                  "text-[9px] px-1.5 py-0.5 rounded-full",
                  filter === key ? "bg-primary/20" : "bg-muted/50"
                )}>
                  {counts[key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Session list */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <Clock className="h-6 w-6 text-muted-foreground/30" />
            <span className="text-xs font-mono">
              {filter === "all"
                ? "No bridge sessions yet"
                : `No ${filter} sessions`}
            </span>
            {filter === "all" && (
              <Link href="/bridge">
                <Button variant="outline" size="sm" className="mt-2 font-mono text-xs">
                  Start a Bridge
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
