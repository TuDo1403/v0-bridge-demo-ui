"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Copy,
  Check,
  Loader2,
  Search,
  Link2,
} from "lucide-react";
import { PageShell } from "@/components/bridge/page-shell";
import { ChainIcon } from "@/components/bridge/chain-icon";
import { NativeKindBadge } from "@/components/bridge/native-kind-badge";
import { NativePhaseTimeline } from "@/components/bridge/native-phase-timeline";
import {
  fetchJobFeed,
  fetchJobById,
  type JobFeedItem,
  type JobFeedFilter,
  type TimeRange,
} from "@/lib/stats-service";
import { isNativeBridgeJobKind } from "@/lib/bridge-service";
import { eidToChainMeta, getLzScanBase } from "@/config/chains";
import { useNetworkStore } from "@/lib/network-store";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 25;

const STATUSES = ["pending", "claimed", "submitted", "completed", "failed"] as const;

const JOB_STAGES = [
  { key: "pending",   color: "text-yellow-500", bg: "bg-yellow-500/10 border-yellow-500/30" },
  { key: "claimed",   color: "text-blue-400",   bg: "bg-blue-400/10 border-blue-400/30" },
  { key: "submitted", color: "text-purple-400",  bg: "bg-purple-400/10 border-purple-400/30" },
  { key: "completed", color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/30" },
  { key: "failed",    color: "text-red-500",     bg: "bg-red-500/10 border-red-500/30" },
] as const;

const TIME_RANGES: { label: string; value: TimeRange }[] = [
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "All", value: "all" },
];

// Derived 3-state bridge status shown in the table, computed from job + LZ data.
const BRIDGE_STAGES = [
  {
    key: "pending",
    label: "Pending",
    color: "text-yellow-500",
    bg: "bg-yellow-500/10 border-yellow-500/30",
    hint: "Waiting for bridge TX to be submitted on source chain.",
  },
  {
    key: "unfinalized",
    label: "Unfinalized",
    color: "text-blue-400",
    bg: "bg-blue-400/10 border-blue-400/30",
    hint: "Bridge TX on source chain but not yet finalized (confirmed_at not set).",
  },
  {
    key: "finalized",
    label: "Finalized",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10 border-emerald-500/30",
    hint: "Bridge TX finalized on source chain (confirmed_at set).",
  },
  {
    key: "failed",
    label: "Failed",
    color: "text-red-500",
    bg: "bg-red-500/10 border-red-500/30",
    hint: "TX reverted, max retries exceeded, or LZ delivery failed.",
  },
] as const;

type BridgeStatus = typeof BRIDGE_STAGES[number]["key"];

const LZ_TERMINAL_FAILURES = new Set([
  "FAILED", "BLOCKED", "PAYLOAD_STORED",
  "APPLICATION_BURNED", "APPLICATION_SKIPPED",
  "UNRESOLVABLE_COMMAND", "MALFORMED_COMMAND",
]);

/** True when this row represents an OP Stack native bridge job. Uses
 *  bridgeKind when the BE populates it; falls back to token-address
 *  detection (ETH = native gas = no ERC20 token = zero address) so feed
 *  rendering stays correct even when running against an older BE binary
 *  that doesn't yet return the field. */
function isNativeRow(item: JobFeedItem): boolean {
  if (isNativeBridgeJobKind(item.bridgeKind)) return true;
  if (item.bridgeKind && item.bridgeKind !== "") return false;
  return item.token === "0x0000000000000000000000000000000000000000";
}

function deriveBridgeStatus(item: JobFeedItem): BridgeStatus {
  if (item.status === "failed" || item.nativePhase === "failed") return "failed";

  // Native bridge: derive from the OP Stack phase machine. The native
  // flow has no LZ-style intermediate "delivered" state — finalized (or
  // l2_credited for deposits) IS the terminal success state.
  if (isNativeRow(item)) {
    const np = item.nativePhase ?? "";
    if (np === "finalized" || np === "l2_credited") return "finalized";
    if (np === "proven" || np === "ready_to_finalize" || np === "finalizing")
      return "unfinalized";
    if (np === "" || np === "pending_l1_init" || np === "pending_l2_init")
      return "pending";
    return "unfinalized";
  }

  // LZ flow.
  const lzUp = (item.lzStatus ?? "").toUpperCase().replace(/^LZ_/, "");
  if (LZ_TERMINAL_FAILURES.has(lzUp)) return "failed";
  if (item.confirmedAt || lzUp === "DELIVERED") return "finalized";
  if (item.bridgeTxHash) return "unfinalized";
  return "pending";
}

/* ------------------------------------------------------------------ */
/*  FeedPage                                                           */
/* ------------------------------------------------------------------ */

export function FeedPage() {
  const network = useNetworkStore((s) => s.network);
  const searchParams = useSearchParams();
  const initialJobId = searchParams.get("job") ?? undefined;

  const [filter, setFilter] = useState<JobFeedFilter>({ range: "24h", jobId: initialJobId });
  const [page, setPage] = useState(0);

  // When a specific job ID is linked, fetch it directly (bypasses pagination)
  const { data: linkedJob, isLoading: linkedLoading } = useSWR(
    filter.jobId ? ["job-by-id", filter.jobId, network] : null,
    () => fetchJobById(filter.jobId!, network),
    { refreshInterval: 15_000 },
  );

  // Reset pagination when the network changes to avoid stale out-of-range offsets
  useEffect(() => { setPage(0); }, [network]);

  const swrKey = filter.jobId ? null : ["job-feed", filter, page, network];
  const { data, error: feedError, isLoading: feedLoading } = useSWR(
    swrKey,
    () => fetchJobFeed(filter, PAGE_SIZE, page * PAGE_SIZE, network),
    { refreshInterval: 15_000, keepPreviousData: true },
  );

  const isLoading = filter.jobId ? linkedLoading : feedLoading;
  const hasError = !filter.jobId && feedError && !data;

  const handleFilterChange = useCallback((next: Partial<JobFeedFilter>) => {
    setFilter((f) => ({ ...f, ...next }));
    setPage(0);
  }, []);

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  // Resolve what to display
  const displayItems: JobFeedItem[] = filter.jobId
    ? linkedJob ? [linkedJob] : []
    : data?.items ?? [];

  return (
    <PageShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-mono font-medium text-foreground tracking-wide">
            Request Feed
          </h1>
          <div className="flex items-center gap-3">
            {filter.jobId && (
              <button
                onClick={() => handleFilterChange({ jobId: undefined })}
                className="text-[10px] font-mono text-amber-500 hover:text-amber-400 border border-amber-500/30 rounded px-2 py-0.5 hover:bg-amber-500/10 transition-colors"
              >
                ✕ job filter
              </button>
            )}
            {!filter.jobId && data && (
              <span className="text-[10px] font-mono text-muted-foreground">
                {data.total.toLocaleString()} results
              </span>
            )}
          </div>
        </div>

        <LifecyclePanel />
        <FilterBar filter={filter} onChange={handleFilterChange} />

        <div className="border border-border/50 bg-card rounded-lg overflow-hidden">
          {isLoading && !data ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : hasError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-red-400">
              <span className="text-xs font-mono">Failed to load feed</span>
            </div>
          ) : !displayItems.length ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
              <Search className="h-5 w-5" />
              <span className="text-xs font-mono">
                {filter.jobId ? "Job not found" : "No results found"}
              </span>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-border/30 text-[10px] text-muted-foreground uppercase tracking-wider">
                      <th className="w-6 py-2 pl-3" />
                      <th className="text-left py-2 pr-3 whitespace-nowrap">Time</th>
                      <th className="text-left py-2 pr-3">Dir</th>
                      <th className="text-left py-2 pr-3 whitespace-nowrap">Route</th>
                      <th className="text-left py-2 pr-3 hidden sm:table-cell">Sender</th>
                      <th className="text-right py-2 pr-3 hidden sm:table-cell">Amount</th>
                      <th className="text-left py-2 pr-3">Status</th>
                      <th className="text-left py-2 pr-3 hidden md:table-cell">Bridge</th>
                      <th className="text-center py-2 pr-3 hidden md:table-cell">Retries</th>
                      <th className="text-left py-2 hidden md:table-cell">Error</th>
                      <th className="w-6 py-2 pr-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {displayItems.map((item) => (
                      <JobRow
                        key={item.id}
                        item={item}
                        network={network}
                        highlightId={filter.jobId}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {!filter.jobId && totalPages > 1 && (
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
          )}
        </div>
      </div>
    </PageShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Lifecycle Panel (collapsible)                                      */
/* ------------------------------------------------------------------ */

const STAGE_TIPS: Record<string, string> = {
  pending:   "Waiting to be picked up by an operator.",
  claimed:   "Locked by an operator — TX being built and signed.",
  submitted: "TX broadcast on-chain. Awaiting bridge event and LZ delivery.",
  completed: "Bridge confirmed. Funds delivered to destination.",
  failed:    "Terminal failure — max retries exhausted or TX permanently rejected.",
};

const ARROW_TIPS: Record<string, string> = {
  "p→c":  "Operator claims the job (SELECT FOR UPDATE SKIP LOCKED).",
  "c→s":  "TX sent on-chain. bridge_tx_hash recorded.",
  "s→cp": "On-chain receipt confirmed. Bridge event observed.",
  "s→p":  "TX reorged — bridge_tx_hash cleared, retry_count reset to 0. Also fires on within-limit TX errors.",
  "c→p":  "Stale claim recovery (crash before TX send), or within-limit build/sign errors.",
  "c→f":  "Max retries exhausted during build / sign / submit, or nonce conflict.",
  "s→f":  "TX reverted on-chain, or stuck past finality threshold.",
  "f→p":  "RetryFailedJobs sweep — only if no bridge_tx_hash and retry_count < max.",
};

function LifecyclePanel() {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-border/50 bg-card rounded-lg">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">
          Lifecycle
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="border-t border-border/30 px-4 pb-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <div className="md:border-r md:border-border/20 md:pr-4">
              <p className="text-[9px] font-mono uppercase text-muted-foreground/60 tracking-wider pt-3 pb-1">Request</p>
              <LifecycleDiagram />
            </div>
            <div className="mt-3 border-t border-border/20 pt-3 md:mt-0 md:border-t-0 md:pt-0">
              <p className="text-[9px] font-mono uppercase text-muted-foreground/60 tracking-wider pt-3 pb-1">Bridge Status</p>
              <BridgeStatusDiagram />
            </div>
          </div>
          <p className="text-[9px] font-mono italic text-muted-foreground/40 mt-2 text-center">
            *hover on stages and arrows to see explanation
          </p>
        </div>
      )}
    </div>
  );
}

function LifecycleDiagram() {
  const [tip, setTip] = useState<string | null>(null);
  const show = (key: string) => setTip(STAGE_TIPS[key] ?? ARROW_TIPS[key] ?? null);
  const hide = () => setTip(null);
  const g = (key: string) => ({ onMouseEnter: () => show(key), onMouseLeave: hide, style: { cursor: "default" } });

  return (
    <div className="space-y-2 pt-3">
      <svg viewBox="0 0 490 195" className="w-full" aria-label="Request lifecycle diagram">
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

        {/* ── claimed → pending (short arc below, dashed amber) ── */}
        <g {...g("c→p")}>
          <path d="M151,86 C151,106 34,106 34,86" fill="none" stroke="transparent" strokeWidth="10"/>
          <path d="M151,86 C151,106 34,106 34,86" fill="none" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="4,3" markerEnd="url(#lc-ar)"/>
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
          <path d="M235,158 C160,185 14,185 14,86" fill="none" stroke="transparent" strokeWidth="10"/>
          <path d="M235,158 C160,185 14,185 14,86" fill="none" stroke="#6b7280" strokeWidth="1.2" strokeDasharray="4,3" markerEnd="url(#lc-a)"/>
          <text x="136" y="191" textAnchor="middle" fontSize="9" fontFamily="monospace" fill="#6b7280" opacity="0.7">manual sweep</text>
        </g>
      </svg>

      <div className="h-4 min-h-[16px]">
        {tip && <p className="text-[10px] font-mono text-muted-foreground">{tip}</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  LZ Lifecycle Diagram                                               */
/* ------------------------------------------------------------------ */

const BRIDGE_STATUS_TIPS: Record<string, string> = {
  pending:     "Bridge TX not yet submitted on source chain.",
  unfinalized: "Bridge TX on source chain but not yet finalized (confirmed_at not set).",
  finalized:   "Bridge TX finalized on source chain (confirmed_at set).",
  failed:      "TX reverted, LZ delivery failed, or message permanently blocked.",
};

const BRIDGE_STATUS_ARROW_TIPS: Record<string, string> = {
  "p→u":    "Bridge TX submitted and detected on source chain.",
  "u→f":    "Source chain finalizes the bridge TX (confirmed_at set).",
  "p→f":    "TX reverted or max retries exceeded before bridge TX.",
  "u→fail": "LZ delivery failed or message permanently blocked.",
};

function BridgeStatusDiagram() {
  const [tip, setTip] = useState<string | null>(null);
  const show = (key: string) => setTip(BRIDGE_STATUS_TIPS[key] ?? BRIDGE_STATUS_ARROW_TIPS[key] ?? null);
  const hide = () => setTip(null);
  const g = (key: string) => ({ onMouseEnter: () => show(key), onMouseLeave: hide, style: { cursor: "default" } });

  return (
    <div className="space-y-2">
      <svg viewBox="0 0 490 165" className="w-full" aria-label="Bridge status diagram">
        <defs>
          <marker id="bs-a"  markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0.5 L6,3.5 L0,6.5 Z" fill="#6b7280"/></marker>
          <marker id="bs-af" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0.5 L6,3.5 L0,6.5 Z" fill="#ef4444"/></marker>
        </defs>

        {/* ── Stage boxes ── */}
        <g {...g("pending")}>
          <rect x="5"   y="50" width="72" height="24" rx="4" fill="rgba(234,179,8,.08)"   stroke="#eab308" strokeWidth="1"/>
          <text x="41"  y="66" textAnchor="middle" fontSize="10" fontFamily="monospace" fill="#eab308">pending</text>
        </g>
        <g {...g("unfinalized")}>
          <rect x="155" y="50" width="90" height="24" rx="4" fill="rgba(96,165,250,.08)"  stroke="#60a5fa" strokeWidth="1"/>
          <text x="200" y="66" textAnchor="middle" fontSize="10" fontFamily="monospace" fill="#60a5fa">unfinalized</text>
        </g>
        <g {...g("finalized")}>
          <rect x="370" y="50" width="78" height="24" rx="4" fill="rgba(16,185,129,.08)"  stroke="#10b981" strokeWidth="1"/>
          <text x="409" y="66" textAnchor="middle" fontSize="10" fontFamily="monospace" fill="#10b981">finalized</text>
        </g>
        <g {...g("failed")}>
          <rect x="210" y="118" width="60" height="24" rx="4" fill="rgba(239,68,68,.08)"  stroke="#ef4444" strokeWidth="1"/>
          <text x="240" y="134" textAnchor="middle" fontSize="10" fontFamily="monospace" fill="#ef4444">failed</text>
        </g>

        {/* ── Happy path ── */}
        <g {...g("p→u")}>
          <line x1="77"  y1="62" x2="153" y2="62" stroke="transparent" strokeWidth="10"/>
          <line x1="77"  y1="62" x2="153" y2="62" stroke="#6b7280" strokeWidth="1.2" markerEnd="url(#bs-a)"/>
        </g>
        <g {...g("u→f")}>
          <line x1="245" y1="62" x2="368" y2="62" stroke="transparent" strokeWidth="10"/>
          <line x1="245" y1="62" x2="368" y2="62" stroke="#6b7280" strokeWidth="1.2" markerEnd="url(#bs-a)"/>
          <text x="305" y="57" textAnchor="middle" fontSize="8" fontFamily="monospace" fill="#6b7280" opacity="0.5">src finalized</text>
        </g>

        {/* ── Failure paths ── */}
        <g {...g("p→f")}>
          <path d="M41,74 L218,118" fill="none" stroke="transparent" strokeWidth="10"/>
          <path d="M41,74 L218,118" fill="none" stroke="#ef4444" strokeWidth="1.2" markerEnd="url(#bs-af)"/>
        </g>
        <g {...g("u→fail")}>
          <path d="M227,74 L227,118" fill="none" stroke="transparent" strokeWidth="10"/>
          <path d="M227,74 L227,118" fill="none" stroke="#ef4444" strokeWidth="1.2" markerEnd="url(#bs-af)"/>
        </g>
      </svg>

      <div className="h-4 min-h-[16px]">
        {tip && <p className="text-[10px] font-mono text-muted-foreground">{tip}</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Filter Bar                                                         */
/* ------------------------------------------------------------------ */

function useDebounce<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function FilterBar({
  filter,
  onChange,
}: {
  filter: JobFeedFilter;
  onChange: (f: Partial<JobFeedFilter>) => void;
}) {
  const [addressInput, setAddressInput] = useState(filter.address ?? "");
  const [vaultInput, setVaultInput] = useState(filter.vaultAddress ?? "");
  const debouncedAddress = useDebounce(addressInput);
  const debouncedVault = useDebounce(vaultInput);

  useEffect(() => { onChange({ address: debouncedAddress || undefined }); }, [debouncedAddress]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onChange({ vaultAddress: debouncedVault || undefined }); }, [debouncedVault]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="border border-border/50 bg-card rounded-lg p-3">
      <div className="flex flex-wrap gap-2">
        {/* Address */}
        <div className="flex items-center gap-1.5 min-w-[200px] flex-1">
          <span className="text-[10px] font-mono text-muted-foreground shrink-0">Address</span>
          <input
            type="text"
            placeholder="0x… sender or receiver"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            className="flex-1 bg-muted/30 border border-border/50 rounded px-2 py-1 text-[11px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
          />
        </div>

        {/* Vault Address */}
        <div className="flex items-center gap-1.5 min-w-[180px] flex-1">
          <span className="text-[10px] font-mono text-muted-foreground shrink-0">Vault</span>
          <input
            type="text"
            placeholder="0x… vault address"
            value={vaultInput}
            onChange={(e) => setVaultInput(e.target.value)}
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

function JobRow({
  item,
  network,
  highlightId,
}: {
  item: JobFeedItem;
  network: "mainnet" | "testnet";
  highlightId?: string;
}) {
  const [expanded, setExpanded] = useState(item.id === highlightId);
  const [linkCopied, setLinkCopied] = useState(false);
  const srcMeta = eidToChainMeta(item.srcEid);
  const dstMeta = eidToChainMeta(item.dstEid);
  const bridgeStatus = deriveBridgeStatus(item);
  const jobStage = JOB_STAGES.find((s) => s.key === item.status);

  const copyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`${window.location.origin}/feed?job=${item.id}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1500);
  };

  return (
    <>
      <tr
        className={cn(
          "border-b border-border/20 cursor-pointer transition-colors",
          expanded ? "bg-muted/20" : "hover:bg-muted/10",
          item.id === highlightId && "ring-1 ring-inset ring-primary/20",
        )}
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="py-2 pl-3 text-muted-foreground">
          {expanded
            ? <ChevronDown className="h-3 w-3" />
            : <ChevronRight className="h-3 w-3" />}
        </td>

        <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">
          {formatTimeAgo(item.createdAt)}
        </td>

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

        <td className="py-2 pr-3 whitespace-nowrap">
          <NativeKindBadge kind={isNativeRow(item) ? "native" : "lz"} className="mr-1.5 align-middle" />
          <span className="text-foreground">{srcMeta?.shortLabel ?? item.srcEid}</span>
          <ArrowRight className="inline h-3 w-3 mx-1 text-muted-foreground" />
          <span className="text-foreground">{dstMeta?.shortLabel ?? item.dstEid}</span>
        </td>

        <td className="py-2 pr-3 hidden sm:table-cell">
          <CopyableAddress address={item.sender} />
        </td>

        <td className="py-2 pr-3 text-right text-foreground tabular-nums hidden sm:table-cell whitespace-nowrap">
          {(() => {
            const { display, symbol } = formatTokenAmount(item.amount, item.token);
            return (
              <>
                {display}
                <span className="text-muted-foreground/70 ml-1">{symbol}</span>
              </>
            );
          })()}
        </td>

        <td className="py-2 pr-3">
          <span className={cn(
            "px-1.5 py-0.5 rounded text-[10px] border",
            jobStage?.bg ?? "bg-muted/30 border-border/50",
            jobStage?.color ?? "text-muted-foreground",
          )}>
            {item.status}
          </span>
        </td>

        <td className="py-2 pr-3 hidden md:table-cell">
          <BridgeStatusBadge status={bridgeStatus} />
        </td>

        <td className="py-2 pr-3 text-center hidden md:table-cell">
          {item.retryCount > 0 ? (
            <span className="text-amber-500">{item.retryCount}</span>
          ) : (
            <span className="text-muted-foreground/40">0</span>
          )}
        </td>

        <td className="py-2 max-w-[180px] hidden md:table-cell">
          {item.errorMessage ? (
            <span className="text-red-400/80 truncate block">{item.errorMessage}</span>
          ) : (
            <span className="text-muted-foreground/40">—</span>
          )}
        </td>

        <td className="py-2 pr-3">
          <button
            onClick={copyLink}
            title="Copy shareable link"
            className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          >
            {linkCopied
              ? <Check className="h-3 w-3 text-emerald-500" />
              : <Link2 className="h-3 w-3" />}
          </button>
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-border/20 bg-muted/10">
          <td colSpan={11} className="px-6 py-4">
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
  const isNative = isNativeRow(item);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-4 text-[11px] font-mono">
      {/* Job details */}
      <div className="space-y-1.5">
        <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-2">Job</p>
        <DetailRow label="ID"       value={item.id}       copyable adaptive />
        <DetailRow label="Sender"   value={item.sender}   copyable adaptive />
        <DetailRow label="Receiver" value={item.receiver} copyable adaptive />
        <DetailRow label="Token"    value={item.token}    copyable adaptive />
        {(() => {
          const a = formatTokenAmount(item.amount, item.token);
          return <DetailRow label="Amount" value={`${a.display} ${a.symbol}`} />;
        })()}
        {item.fee && (() => {
          const f = formatTokenAmount(item.fee, item.token);
          return <DetailRow label="Fee" value={`${f.display} ${f.symbol}`} />;
        })()}
        <DetailRow label="Retries"  value={String(item.retryCount)} />
        <DetailRow label="Created"  value={formatDateTime(item.createdAt)} />
        <DetailRow label="Updated"  value={formatDateTime(item.updatedAt)} />
        {item.errorMessage && (
          <div className="mt-1 p-2 rounded bg-red-500/10 border border-red-500/20 text-red-400 break-all">
            {item.errorMessage}
          </div>
        )}
      </div>

      {/* Source panel — chain = srcEid. Native deposit shows the user's L1
          bridgeETHTo tx; native withdrawal shows the user's L2 init tx. */}
      {isNative ? (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-2">
            {srcMeta?.label ?? `EID ${item.srcEid}`} (source)
          </p>
          {(() => {
            const txHash = item.direction === "deposit"
              ? item.nativeDepositL1TxHash
              : item.nativeWithdrawL2TxHash;
            if (!txHash) return <span className="text-muted-foreground">Awaiting source tx</span>;
            return (
              <DetailRow
                label={item.direction === "deposit" ? "L1 Deposit" : "L2 Withdraw"}
                value={shortHash(txHash)}
                copyable
                fullValue={txHash}
                icon={srcMeta ? { href: srcMeta.explorerTxUrl(txHash), chainKey: srcMeta.iconKey, label: `View on ${srcMeta.label}` } : undefined}
              />
            );
          })()}
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-2">
            {srcMeta?.label ?? `EID ${item.srcEid}`} (source)
          </p>
          {item.bridgeTxHash ? (
            <DetailRow
              label="Bridge TX"
              value={shortHash(item.bridgeTxHash)}
              copyable
              fullValue={item.bridgeTxHash}
              icon={srcMeta ? { href: srcMeta.explorerTxUrl(item.bridgeTxHash), chainKey: srcMeta.iconKey, label: `View on ${srcMeta.label}` } : undefined}
            />
          ) : (
            <span className="text-muted-foreground">Not yet submitted</span>
          )}
        </div>
      )}

      {/* Destination panel — chain = dstEid. Native deposit shows the OP Stack
          system tx that emitted ETHBridgeFinalized; native withdrawal shows
          prove + finalize on L1. */}
      {isNative ? (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-2">
            OP Stack → {dstMeta?.label ?? `EID ${item.dstEid}`}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Status</span>
            <BridgeStatusBadge status={deriveBridgeStatus(item)} />
          </div>
          {item.nativePhase && (
            <div className="pt-1">
              <NativePhaseTimeline
                direction={item.direction === "deposit" ? "deposit" : "withdraw"}
                phase={item.nativePhase}
              />
            </div>
          )}
          {item.direction === "deposit" ? (
            item.nativeDepositL2TxHash ? (
              <DetailRow
                label="L2 Credit"
                value={shortHash(item.nativeDepositL2TxHash)}
                copyable
                fullValue={item.nativeDepositL2TxHash}
                icon={dstMeta ? { href: dstMeta.explorerTxUrl(item.nativeDepositL2TxHash), chainKey: dstMeta.iconKey, label: `View on ${dstMeta.label}` } : undefined}
              />
            ) : (
              <span className="text-muted-foreground/60">Awaiting L2 credit</span>
            )
          ) : (
            <>
              {item.nativeWithdrawProveTxHash ? (
                <DetailRow
                  label="Prove TX"
                  value={shortHash(item.nativeWithdrawProveTxHash)}
                  copyable
                  fullValue={item.nativeWithdrawProveTxHash}
                  icon={dstMeta ? { href: dstMeta.explorerTxUrl(item.nativeWithdrawProveTxHash), chainKey: dstMeta.iconKey, label: `View on ${dstMeta.label}` } : undefined}
                />
              ) : (
                <span className="text-muted-foreground/60">Awaiting prove</span>
              )}
              {item.nativeWithdrawFinalizeTxHash ? (
                <DetailRow
                  label="Finalize TX"
                  value={shortHash(item.nativeWithdrawFinalizeTxHash)}
                  copyable
                  fullValue={item.nativeWithdrawFinalizeTxHash}
                  icon={dstMeta ? { href: dstMeta.explorerTxUrl(item.nativeWithdrawFinalizeTxHash), chainKey: dstMeta.iconKey, label: `View on ${dstMeta.label}` } : undefined}
                />
              ) : (
                <span className="text-muted-foreground/60">Awaiting finalize</span>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-2">
            LZ → {dstMeta?.label ?? `EID ${item.dstEid}`}
          </p>
          {item.bridgeTxHash ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Status</span>
                <BridgeStatusBadge status={deriveBridgeStatus(item)} />
              </div>
              {item.lzGuid ? (
                <DetailRow
                  label="GUID"
                  value={shortHash(item.lzGuid)}
                  copyable
                  fullValue={item.lzGuid}
                  icon={{ href: `${lzBase}/tx/${item.lzGuid}`, chainKey: "layerzero", label: "LayerZero Scan" }}
                />
              ) : (
                <span className="text-muted-foreground/60">Awaiting LZ indexing</span>
              )}
              {item.lzDstTxHash && (
                <DetailRow
                  label="Dst TX"
                  value={shortHash(item.lzDstTxHash)}
                  copyable
                  fullValue={item.lzDstTxHash}
                  icon={dstMeta ? { href: dstMeta.explorerTxUrl(item.lzDstTxHash), chainKey: dstMeta.iconKey, label: `View on ${dstMeta.label}` } : undefined}
                />
              )}
            </>
          ) : (
            <span className="text-muted-foreground">Awaiting bridge TX</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small components                                                   */
/* ------------------------------------------------------------------ */

function ExplorerIconLink({ href, chainKey, label }: { href: string; chainKey: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={label}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/5 border border-white/10 transition-all duration-200 hover:bg-white/15 hover:border-white/25 hover:shadow-[0_0_10px_rgba(255,255,255,0.3)]"
    >
      <ChainIcon chainKey={chainKey} className="w-3.5 h-3.5" />
    </a>
  );
}

function BridgeStatusBadge({ status }: { status: BridgeStatus }) {
  const stage = BRIDGE_STAGES.find((s) => s.key === status);
  return (
    <span className={cn(
      "px-1.5 py-0.5 rounded text-[10px] border",
      stage?.bg ?? "bg-muted/30 border-border/50",
      stage?.color ?? "text-muted-foreground",
    )}>
      {stage?.label ?? status}
    </span>
  );
}

function AdaptiveAddress({ address }: { address: string }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [fits, setFits] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    const check = () => setFits(measure.scrollWidth <= container.clientWidth);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(container);
    return () => ro.disconnect();
  }, [address]);

  const prefix = address.slice(0, 6);
  const middle = address.slice(6, -4);
  const suffix = address.slice(-4);

  return (
    <span ref={containerRef} className="relative min-w-0 overflow-hidden flex-1 block">
      {/* invisible full-text for measurement */}
      <span ref={measureRef} className="invisible absolute whitespace-nowrap pointer-events-none" aria-hidden>
        {address}
      </span>
      {fits ? (
        <span className="whitespace-nowrap">
          {prefix}
          <span className="text-foreground/40">{middle}</span>
          {suffix}
        </span>
      ) : (
        <span className="whitespace-nowrap">
          {address.slice(0, 10)}
          <span className="text-foreground/40">…</span>
          {address.slice(-6)}
        </span>
      )}
    </span>
  );
}

function DetailRow({
  label,
  value,
  copyable,
  fullValue,
  adaptive,
  icon,
}: {
  label: string;
  value: string;
  copyable?: boolean;
  fullValue?: string;
  adaptive?: boolean;
  icon?: { href: string; chainKey: string; label: string };
}) {
  const [copied, setCopied] = useState(false);
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(fullValue ?? value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-muted-foreground shrink-0 min-w-[70px]">{label}</span>
      {adaptive ? (
        <AdaptiveAddress address={value} />
      ) : (
        <span className="text-foreground truncate">{value}</span>
      )}
      {copyable && (
        <button onClick={copy} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
          {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
        </button>
      )}
      {icon && <ExplorerIconLink href={icon.href} chainKey={icon.chainKey} label={icon.label} />}
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
    <button onClick={copy} className="flex items-center gap-1 text-foreground hover:text-primary transition-colors group">
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

/** Format a token amount (raw integer string in smallest units) using
 *  the right decimals for the token. ETH (zero address) → 18 decimals;
 *  every other token assumed USDC (6 decimals) for now. Pads to 6 sig
 *  figs for ETH so very small bridges (0.0001) read correctly. */
function formatTokenAmount(raw: string | null | undefined, tokenAddr: string): {
  display: string;
  symbol: string;
} {
  if (!raw || raw === "0") return { display: "0", symbol: tokenAmountSymbol(tokenAddr) };
  const isETH = tokenAddr === "0x0000000000000000000000000000000000000000";
  const decimals = isETH ? 18 : 6;
  // Number() loses precision past ~15 sig figs which is fine for display
  // (largest bridge amount is well under 2^53 wei = ~9007 ETH).
  const n = Number(raw) / 10 ** decimals;
  return {
    display: n.toLocaleString(undefined, {
      minimumFractionDigits: isETH ? 4 : 2,
      maximumFractionDigits: isETH ? 6 : 2,
    }),
    symbol: tokenAmountSymbol(tokenAddr),
  };
}

function tokenAmountSymbol(tokenAddr: string): string {
  return tokenAddr === "0x0000000000000000000000000000000000000000" ? "ETH" : "USDC";
}

function formatTimeAgo(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "—";
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}
