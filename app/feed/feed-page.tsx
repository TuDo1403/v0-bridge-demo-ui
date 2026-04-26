"use client";

import { useState, useCallback, useEffect } from "react";
import useSWR from "swr";
import {
  ChevronDown,
  ChevronRight,
  ArrowRight,
  ExternalLink,
  Copy,
  Check,
  Loader2,
  Search,
} from "lucide-react";
import { PageShell } from "@/components/bridge/page-shell";
import {
  fetchJobFeed,
  type JobFeedItem,
  type JobFeedFilter,
  type TimeRange,
} from "@/lib/stats-service";
import { eidToChainMeta, getLzScanBase } from "@/config/chains";
import { useNetworkStore } from "@/lib/network-store";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 25;

const STATUSES = ["pending", "claimed", "submitted", "completed", "failed"] as const;

const TIME_RANGES: { label: string; value: TimeRange }[] = [
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "All", value: "all" },
];

const HAPPY_PATH = [
  {
    key: "pending",
    label: "Pending",
    color: "text-yellow-500",
    bg: "bg-yellow-500/10 border-yellow-500/30",
    dot: "bg-yellow-500",
    hint: "Job created, waiting to be claimed by an operator.",
  },
  {
    key: "claimed",
    label: "Claimed",
    color: "text-blue-400",
    bg: "bg-blue-400/10 border-blue-400/30",
    dot: "bg-blue-400",
    hint: "Picked up by an operator. TX being prepared and signed.",
  },
  {
    key: "submitted",
    label: "Submitted",
    color: "text-purple-400",
    bg: "bg-purple-400/10 border-purple-400/30",
    dot: "bg-purple-400",
    hint: "TX broadcast on-chain. Waiting for confirmation and LZ delivery.",
  },
  {
    key: "completed",
    label: "Completed",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10 border-emerald-500/30",
    dot: "bg-emerald-500",
    hint: "Bridge confirmed on-chain. Funds delivered to destination.",
  },
] as const;

const FAILED_STAGE = {
  key: "failed",
  label: "Failed",
  color: "text-red-500",
  bg: "bg-red-500/10 border-red-500/30",
  dot: "bg-red-500",
  hint: "TX reverted or max retries exceeded. If within retry limit, job is re-queued back to Pending.",
} as const;

// For status badge lookup
const LIFECYCLE_STAGES = [...HAPPY_PATH, FAILED_STAGE] as const;

/* ------------------------------------------------------------------ */
/*  FeedPage                                                           */
/* ------------------------------------------------------------------ */

export function FeedPage() {
  const network = useNetworkStore((s) => s.network);
  const [filter, setFilter] = useState<JobFeedFilter>({ range: "24h" });
  const [page, setPage] = useState(0);

  // Reset pagination when the network changes — the new network may have
  // fewer rows, and a stale offset would request a page past the end and
  // surface "No results found" even though earlier pages have data.
  useEffect(() => {
    setPage(0);
  }, [network]);

  const swrKey = ["job-feed", filter, page, network];
  const { data, error, isLoading } = useSWR(
    swrKey,
    () => fetchJobFeed(filter, PAGE_SIZE, page * PAGE_SIZE, network),
    { refreshInterval: 15_000, keepPreviousData: true },
  );

  const handleFilterChange = useCallback((next: Partial<JobFeedFilter>) => {
    setFilter((f) => ({ ...f, ...next }));
    setPage(0);
  }, []);

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <PageShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-mono font-medium text-foreground tracking-wide">
            Request Feed
          </h1>
          {data && (
            <span className="text-[10px] font-mono text-muted-foreground">
              {data.total.toLocaleString()} results
            </span>
          )}
        </div>

        <LifecycleDiagram />
        <FilterBar filter={filter} onChange={handleFilterChange} />

        <div className="border border-border/50 bg-card rounded-lg overflow-hidden">
          {isLoading && !data ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : error && !data ? (
            <div
              role="alert"
              className="flex flex-col items-center justify-center py-16 gap-2 text-red-400"
            >
              <span className="text-xs font-mono">Failed to load feed</span>
              <span className="text-[10px] font-mono text-muted-foreground break-all px-6 text-center">
                {extractErrorMessage(error)}
              </span>
            </div>
          ) : data && data.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
              <Search className="h-5 w-5" />
              <span className="text-xs font-mono">No results found</span>
            </div>
          ) : data ? (
            <>
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-border/30 text-[10px] text-muted-foreground uppercase tracking-wider">
                    <th className="w-6 py-2 pl-3" />
                    <th className="text-left py-2 pr-3 whitespace-nowrap">Time</th>
                    <th className="text-left py-2 pr-3">Dir</th>
                    <th className="text-left py-2 pr-3 whitespace-nowrap">Route</th>
                    <th className="text-left py-2 pr-3">Sender</th>
                    <th className="text-right py-2 pr-3">Amount</th>
                    <th className="text-left py-2 pr-3">Status</th>
                    <th className="text-left py-2 pr-3">LZ</th>
                    <th className="text-left py-2 pr-3">Retries</th>
                    <th className="text-left py-2">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <JobRow key={item.id} item={item} network={network} />
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-2 border-t border-border/30">
                  <span className="text-[10px] font-mono text-muted-foreground">
                    Page {page + 1} of {totalPages}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="px-2 py-1 text-[10px] font-mono rounded border border-border/50 disabled:opacity-30 hover:bg-muted/50"
                    >
                      Prev
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                      className="px-2 py-1 text-[10px] font-mono rounded border border-border/50 disabled:opacity-30 hover:bg-muted/50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Lifecycle Diagram                                                  */
/* ------------------------------------------------------------------ */

// Stage and transition keys never collide, so a single record keeps the
// lookup in `show` simple and makes new tips easy to add.
const LIFECYCLE_TIPS: Record<string, string> = {
  // Stages
  pending:   "Waiting to be picked up by an operator.",
  claimed:   "Locked by an operator — TX being built and signed.",
  submitted: "TX broadcast on-chain. Awaiting receipt and LZ delivery.",
  completed: "Bridge confirmed. Funds delivered to destination.",
  failed:    "Terminal failure — max retries exhausted or TX permanently rejected.",
  // Transitions
  "p→c":  "Operator claims the job (SELECT FOR UPDATE SKIP LOCKED).",
  "c→s":  "TX sent on-chain. bridge_tx_hash recorded.",
  "s→cp": "On-chain receipt confirmed. Bridge event observed.",
  "s→p":  "TX reorged — bridge_tx_hash cleared, retry_count reset to 0. Also fires on within-limit TX errors.",
  "c→p":  "Stale claim recovery (crash before TX send), or within-limit build/sign errors.",
  "c→f":  "Max retries exhausted during build / sign / submit, or nonce conflict.",
  "s→f":  "TX reverted on-chain, or stuck past finality threshold.",
  "f→p":  "RetryFailedJobs sweep — only if no bridge_tx_hash and retry_count < max.",
};

function LifecycleDiagram() {
  const [tip, setTip] = useState<string | null>(null);
  const show = (key: string) => setTip(LIFECYCLE_TIPS[key] ?? null);
  const hide = () => setTip(null);
  const g = (key: string) => ({ onMouseEnter: () => show(key), onMouseLeave: hide, style: { cursor: "default" } });

  return (
    <div className="border border-border/50 bg-card rounded-lg px-4 py-3 space-y-2">
      <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">
        Request Lifecycle
      </span>
      <svg viewBox="0 0 490 195" className="w-full" style={{ maxWidth: 560 }} aria-label="Request lifecycle diagram">
        <defs>
          <marker id="lc-a"  markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0.5 L6,3.5 L0,6.5 Z" fill="#6b7280"/></marker>
          <marker id="lc-ar" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0.5 L6,3.5 L0,6.5 Z" fill="#f59e0b"/></marker>
          <marker id="lc-af" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0.5 L6,3.5 L0,6.5 Z" fill="#ef4444"/></marker>
        </defs>

        {/* ── Stage boxes ── */}
        <g {...g("pending")}>
          <rect x="5"   y="62" width="67" height="24" rx="4" fill="rgba(234,179,8,.08)"   stroke="#eab308" strokeWidth="1"/>
          <text x="38"  y="78" textAnchor="middle" fontSize="10" fontFamily="monospace" fill="#eab308">pending</text>
        </g>
        <g {...g("claimed")}>
          <rect x="118" y="62" width="67" height="24" rx="4" fill="rgba(96,165,250,.08)"  stroke="#60a5fa" strokeWidth="1"/>
          <text x="151" y="78" textAnchor="middle" fontSize="10" fontFamily="monospace" fill="#60a5fa">claimed</text>
        </g>
        <g {...g("submitted")}>
          <rect x="231" y="62" width="80" height="24" rx="4" fill="rgba(192,132,252,.08)" stroke="#c084fc" strokeWidth="1"/>
          <text x="271" y="78" textAnchor="middle" fontSize="10" fontFamily="monospace" fill="#c084fc">submitted</text>
        </g>
        <g {...g("completed")}>
          <rect x="363" y="62" width="80" height="24" rx="4" fill="rgba(16,185,129,.08)"  stroke="#10b981" strokeWidth="1"/>
          <text x="403" y="78" textAnchor="middle" fontSize="10" fontFamily="monospace" fill="#10b981">completed</text>
        </g>
        <g {...g("failed")}>
          <rect x="235" y="142" width="67" height="24" rx="4" fill="rgba(239,68,68,.08)"  stroke="#ef4444" strokeWidth="1"/>
          <text x="268" y="158" textAnchor="middle" fontSize="10" fontFamily="monospace" fill="#ef4444">failed</text>
        </g>

        {/* ── Happy path arrows ── */}
        <g {...g("p→c")}>
          <line x1="72"  y1="74" x2="115" y2="74" stroke="transparent" strokeWidth="10"/>
          <line x1="72"  y1="74" x2="115" y2="74" stroke="#6b7280" strokeWidth="1.2" markerEnd="url(#lc-a)"/>
        </g>
        <g {...g("c→s")}>
          <line x1="185" y1="74" x2="228" y2="74" stroke="transparent" strokeWidth="10"/>
          <line x1="185" y1="74" x2="228" y2="74" stroke="#6b7280" strokeWidth="1.2" markerEnd="url(#lc-a)"/>
        </g>
        <g {...g("s→cp")}>
          <line x1="311" y1="74" x2="360" y2="74" stroke="transparent" strokeWidth="10"/>
          <line x1="311" y1="74" x2="360" y2="74" stroke="#6b7280" strokeWidth="1.2" markerEnd="url(#lc-a)"/>
        </g>

        {/* ── submitted → pending (top arc, dashed amber) ── */}
        <g {...g("s→p")}>
          <path d="M271,62 C271,20 38,20 38,62" fill="none" stroke="transparent" strokeWidth="10"/>
          <path d="M271,62 C271,20 38,20 38,62" fill="none" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="4,3" markerEnd="url(#lc-ar)"/>
        </g>

        {/* ── claimed → pending (short loop below, dashed amber) ── */}
        <g {...g("c→p")}>
          <path d="M151,86 C151,110 38,110 38,86" fill="none" stroke="transparent" strokeWidth="10"/>
          <path d="M151,86 C151,110 38,110 38,86" fill="none" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="4,3" markerEnd="url(#lc-ar)"/>
        </g>

        {/* ── claimed → failed (red diagonal) ── */}
        <g {...g("c→f")}>
          <path d="M155,86 L240,142" fill="none" stroke="transparent" strokeWidth="10"/>
          <path d="M155,86 L240,142" fill="none" stroke="#ef4444" strokeWidth="1.2" markerEnd="url(#lc-af)"/>
        </g>

        {/* ── submitted → failed (red, near-vertical) ── */}
        <g {...g("s→f")}>
          <path d="M265,86 L265,142" fill="none" stroke="transparent" strokeWidth="10"/>
          <path d="M265,86 L265,142" fill="none" stroke="#ef4444" strokeWidth="1.2" markerEnd="url(#lc-af)"/>
        </g>

        {/* ── failed → pending (manual sweep, dashed gray, bottom) ── */}
        <g {...g("f→p")}>
          <path d="M235,158 C160,182 38,182 38,86" fill="none" stroke="transparent" strokeWidth="10"/>
          <path d="M235,158 C160,182 38,182 38,86" fill="none" stroke="#6b7280" strokeWidth="1.2" strokeDasharray="4,3" markerEnd="url(#lc-a)"/>
          <text x="136" y="191" textAnchor="middle" fontSize="9" fontFamily="monospace" fill="#6b7280" opacity="0.7">manual sweep</text>
        </g>
      </svg>

      {/* Tooltip */}
      <div className="h-4 min-h-[16px]">
        {tip && <p className="text-[10px] font-mono text-muted-foreground">{tip}</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Filter Bar                                                         */
/* ------------------------------------------------------------------ */

function FilterBar({
  filter,
  onChange,
}: {
  filter: JobFeedFilter;
  onChange: (f: Partial<JobFeedFilter>) => void;
}) {
  return (
    <div className="border border-border/50 bg-card rounded-lg p-3">
      <div className="flex flex-wrap gap-2">
        {/* Address */}
        <div className="flex items-center gap-1.5 min-w-[200px] flex-1">
          <span className="text-[10px] font-mono text-muted-foreground shrink-0">Address</span>
          <input
            type="text"
            placeholder="0x… sender or receiver"
            value={filter.address ?? ""}
            onChange={(e) => onChange({ address: e.target.value || undefined })}
            className="flex-1 bg-muted/30 border border-border/50 rounded px-2 py-1 text-[11px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
          />
        </div>

        {/* Vault Address */}
        <div className="flex items-center gap-1.5 min-w-[180px] flex-1">
          <span className="text-[10px] font-mono text-muted-foreground shrink-0">Vault</span>
          <input
            type="text"
            placeholder="0x… vault address"
            value={filter.vaultAddress ?? ""}
            onChange={(e) => onChange({ vaultAddress: e.target.value || undefined })}
            className="flex-1 bg-muted/30 border border-border/50 rounded px-2 py-1 text-[11px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
          />
        </div>

        {/* Status */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-muted-foreground shrink-0">Status</span>
          <select
            value={filter.status ?? ""}
            onChange={(e) => onChange({ status: e.target.value || undefined })}
            className="bg-muted/30 border border-border/50 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50"
          >
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Direction */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-muted/30 border border-border/50">
          {(["", "deposit", "withdraw"] as const).map((d) => (
            <button
              key={d}
              onClick={() => onChange({ direction: d || undefined })}
              className={cn(
                "px-2 py-1 rounded text-[10px] font-mono transition-colors",
                (filter.direction ?? "") === d
                  ? "bg-primary/15 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {d || "All"}
            </button>
          ))}
        </div>

        {/* Time range */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-muted/30 border border-border/50">
          {TIME_RANGES.map((r) => (
            <button
              key={r.value + r.label}
              onClick={() => onChange({ range: r.value })}
              className={cn(
                "px-2 py-1 rounded text-[10px] font-mono transition-colors",
                filter.range === r.value
                  ? "bg-primary/15 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Job Row + Expanded detail                                          */
/* ------------------------------------------------------------------ */

function JobRow({ item, network }: { item: JobFeedItem; network: "mainnet" | "testnet" }) {
  const [expanded, setExpanded] = useState(false);
  const srcMeta = eidToChainMeta(item.srcEid);
  const dstMeta = eidToChainMeta(item.dstEid);
  const stage = LIFECYCLE_STAGES.find((s) => s.key === item.status);

  return (
    <>
      <tr
        className={cn(
          "border-b border-border/20 cursor-pointer transition-colors",
          expanded ? "bg-muted/20" : "hover:bg-muted/10",
        )}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
      >
        {/* Expand toggle */}
        <td className="py-2 pl-3 text-muted-foreground">
          {expanded
            ? <ChevronDown className="h-3 w-3" />
            : <ChevronRight className="h-3 w-3" />}
        </td>

        {/* Time */}
        <td
          className="py-2 pr-3 text-muted-foreground whitespace-nowrap"
          suppressHydrationWarning
        >
          {formatTimeAgo(item.createdAt)}
        </td>

        {/* Direction */}
        <td className="py-2 pr-3">
          <span className={cn(
            "px-1.5 py-0.5 rounded text-[10px]",
            item.direction === "deposit"
              ? "bg-green-500/10 text-green-500"
              : "bg-blue-500/10 text-blue-500",
          )}>
            {item.direction === "deposit" ? "dep" : "wdw"}
          </span>
        </td>

        {/* Route */}
        <td className="py-2 pr-3 whitespace-nowrap">
          <span className="text-foreground">{srcMeta?.shortLabel ?? item.srcEid}</span>
          <ArrowRight className="inline h-3 w-3 mx-1 text-muted-foreground" />
          <span className="text-foreground">{dstMeta?.shortLabel ?? item.dstEid}</span>
        </td>

        {/* Sender */}
        <td className="py-2 pr-3">
          <CopyableAddress address={item.sender} />
        </td>

        {/* Amount */}
        <td className="py-2 pr-3 text-right text-foreground tabular-nums">
          ${formatUSDC(item.amount)}
        </td>

        {/* Status */}
        <td className="py-2 pr-3">
          <span className={cn(
            "px-1.5 py-0.5 rounded text-[10px] border",
            stage?.bg ?? "bg-muted/30 border-border/50",
            stage?.color ?? "text-muted-foreground",
          )}>
            {item.status}
          </span>
        </td>

        {/* LZ status */}
        <td className="py-2 pr-3">
          {item.lzStatus ? (
            <LzStatusBadge status={item.lzStatus} />
          ) : (
            <span className="text-muted-foreground/40">—</span>
          )}
        </td>

        {/* Retries */}
        <td className="py-2 pr-3 text-center">
          {item.retryCount > 0 ? (
            <span className="text-amber-500">{item.retryCount}</span>
          ) : (
            <span className="text-muted-foreground/40">0</span>
          )}
        </td>

        {/* Error (truncated) */}
        <td className="py-2 max-w-[180px]">
          {item.errorMessage ? (
            <span className="text-red-400/80 truncate block">{item.errorMessage}</span>
          ) : (
            <span className="text-muted-foreground/40">—</span>
          )}
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-border/20 bg-muted/10">
          <td colSpan={10} className="px-6 py-4">
            <ExpandedDetail item={item} network={network} />
          </td>
        </tr>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Expanded Detail                                                    */
/* ------------------------------------------------------------------ */

function ExpandedDetail({ item, network }: { item: JobFeedItem; network: "mainnet" | "testnet" }) {
  const srcMeta = eidToChainMeta(item.srcEid);
  const dstMeta = eidToChainMeta(item.dstEid);
  const lzBase = getLzScanBase(network);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[11px] font-mono">
      {/* Job details */}
      <div className="space-y-1.5">
        <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-2">Job</p>
        <DetailRow label="ID" value={item.id} copyable />
        <DetailRow label="Sender" value={item.sender} copyable />
        <DetailRow label="Receiver" value={item.receiver} copyable />
        <DetailRow label="Token" value={item.token} copyable />
        <DetailRow label="Amount" value={`$${formatUSDC(item.amount)}`} />
        {item.fee && <DetailRow label="Fee" value={`$${formatUSDC(item.fee)}`} />}
        <DetailRow label="Retry count" value={String(item.retryCount)} />
        <DetailRow label="Created" value={formatDateTime(item.createdAt)} />
        <DetailRow label="Updated" value={formatDateTime(item.updatedAt)} />
        {item.errorMessage && (
          <div className="mt-1 p-2 rounded bg-red-500/10 border border-red-500/20 text-red-400 break-all">
            {item.errorMessage}
          </div>
        )}
      </div>

      {/* Home chain bridge */}
      <div className="space-y-1.5">
        <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-2">
          {srcMeta?.label ?? `EID ${item.srcEid}`} (source)
        </p>
        {item.bridgeTxHash ? (
          <>
            <DetailRow label="Bridge TX" value={shortHash(item.bridgeTxHash)} copyable fullValue={item.bridgeTxHash} />
            {srcMeta && (
              <a
                href={srcMeta.explorerTxUrl(item.bridgeTxHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                View on {srcMeta.label} explorer
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">Not yet submitted</span>
        )}
      </div>

      {/* LZ delivery + remote chain */}
      <div className="space-y-1.5">
        <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-2">
          LZ Delivery → {dstMeta?.label ?? `EID ${item.dstEid}`}
        </p>
        {item.lzStatus ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Status</span>
              <LzStatusBadge status={item.lzStatus} />
            </div>
            {item.lzGuid && (
              <>
                <DetailRow label="GUID" value={shortHash(item.lzGuid)} copyable fullValue={item.lzGuid} />
                <a
                  href={`${lzBase}/tx/${item.lzGuid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  View on LayerZero Scan
                  <ExternalLink className="h-3 w-3" />
                </a>
              </>
            )}
            {item.lzDstTxHash && dstMeta && (
              <>
                <DetailRow label="Dst TX" value={shortHash(item.lzDstTxHash)} copyable fullValue={item.lzDstTxHash} />
                <a
                  href={dstMeta.explorerTxUrl(item.lzDstTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  View on {dstMeta.label} explorer
                  <ExternalLink className="h-3 w-3" />
                </a>
              </>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">Awaiting bridge confirmation</span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small components                                                   */
/* ------------------------------------------------------------------ */

// LZ status set that maps to terminal failure rendering. Keep in sync with
// pkg/lz/types.go → IsAlertable() and NormalizeForAPI(). The frontend may see
// either the raw MessageStatus values stored in bridges.lz_status (e.g.
// "DELIVERED", "FAILED") or the normalized "lz_*" form returned by the
// tracking flow (e.g. "lz_delivered", "lz_failed"), so both shapes are
// canonicalized before classification.
const LZ_FAILURE_STATUSES = new Set([
  "FAILED",
  "BLOCKED",
  "PAYLOAD_STORED",
  "APP_BURNED",
  "APP_SKIPPED",
  "UNRESOLVABLE_CMD",
  "MALFORMED_CMD",
]);

function LzStatusBadge({ status }: { status: string }) {
  // Normalize: strip the `lz_` prefix the backend uses for some flows and
  // uppercase so both `lz_delivered` and `DELIVERED` map to the same key.
  const canonical = status.replace(/^lz_/i, "").toUpperCase();
  const tone =
    canonical === "DELIVERED"
      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
      : LZ_FAILURE_STATUSES.has(canonical)
      ? "bg-red-500/10 text-red-500 border-red-500/30"
      : "bg-yellow-500/10 text-yellow-500 border-yellow-500/30";
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-[10px] border", tone)}>
      {canonical}
    </span>
  );
}

function DetailRow({
  label,
  value,
  copyable,
  fullValue,
}: {
  label: string;
  value: string;
  copyable?: boolean;
  fullValue?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(fullValue ?? value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground min-w-[70px]">{label}</span>
      <span className="text-foreground">{value}</span>
      {copyable && (
        <button
          onClick={copy}
          aria-label={copied ? `${label} copied` : `Copy ${label}`}
          title={`Copy ${label}`}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
        </button>
      )}
    </div>
  );
}

function CopyableAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={copy}
      aria-label={copied ? "Address copied" : "Copy address"}
      title="Copy address"
      className="flex items-center gap-1 text-foreground hover:text-primary transition-colors group"
    >
      <span>{shortAddr(address)}</span>
      {copied
        ? <Check className="h-3 w-3 text-emerald-500" />
        : <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function shortAddr(addr: string) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function shortHash(hash: string) {
  if (!hash || hash.length < 12) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

function formatUSDC(raw: string | null | undefined): string {
  if (!raw || raw === "0") return "0.00";
  const n = Number(raw) / 1e6;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function formatDateTime(iso: string): string {
  // Fixed UTC format with year so historical rows are unambiguous and
  // server/client renders agree (avoids hydration mismatch from locale).
  return (
    new Date(iso).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }) + " UTC"
  );
}

// Pull the most useful human-readable string out of an unknown error so the
// UI never displays "[object Object]" for plain-object rejections.
function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.length > 0) return msg;
  }
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}
