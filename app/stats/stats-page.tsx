"use client";

import { useState } from "react";
import useSWR from "swr";
import { PageShell } from "@/components/bridge/page-shell";
import {
  fetchStatsSummary,
  fetchStatsVolume,
  fetchStatsJobs,
  fetchSyncProgress,
  type TimeRange,
  type StatsSummary,
  type VolumeResponse,
  type JobHealthResponse,
  type SyncProgressResponse,
} from "@/lib/stats-service";
import { eidToChainMeta } from "@/config/chains";
import { useNetworkStore } from "@/lib/network-store";
import { cn } from "@/lib/utils";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";
import {
  DollarSign,
  Activity,
  Users,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Loader2,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TIME_RANGES: { label: string; value: TimeRange }[] = [
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "All", value: "all" },
];

const VOLUME_CHART_CONFIG: ChartConfig = {
  deposits: { label: "Deposits", color: "hsl(142, 76%, 36%)" },
  withdrawals: { label: "Withdrawals", color: "hsl(217, 91%, 60%)" },
};

const DIRECTION_COLORS = ["hsl(142, 76%, 36%)", "hsl(217, 91%, 60%)"];

const JOB_STATUS_COLORS: Record<string, string> = {
  completed: "hsl(142, 76%, 36%)",
  submitted: "hsl(217, 91%, 60%)",
  claimed: "hsl(38, 92%, 50%)",
  pending: "hsl(48, 96%, 53%)",
  failed: "hsl(0, 84%, 60%)",
};

/* ------------------------------------------------------------------ */
/*  StatsPage                                                          */
/* ------------------------------------------------------------------ */

export function StatsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const network = useNetworkStore((s) => s.network);

  const { data: summary, isLoading: summaryLoading } = useSWR(
    ["stats-summary", timeRange, network],
    () => fetchStatsSummary(timeRange, network),
    { refreshInterval: 30_000 },
  );

  const { data: volume, isLoading: volumeLoading } = useSWR(
    ["stats-volume", timeRange, network],
    () => fetchStatsVolume(timeRange, timeRange === "24h" ? "hour" : "day", network),
    { refreshInterval: 30_000 },
  );

  const { data: jobs, isLoading: jobsLoading } = useSWR(
    ["stats-jobs", timeRange, network],
    () => fetchStatsJobs(timeRange, network),
    { refreshInterval: 15_000 },
  );

  const { data: syncData, isLoading: syncLoading } = useSWR(
    ["stats-sync", network],
    () => fetchSyncProgress(network),
    { refreshInterval: 5_000 },
  );

  return (
    <PageShell>
      <div className="space-y-4">
        {/* Header + Time Range */}
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-mono font-medium text-foreground tracking-wide">
            Bridge Analytics
          </h1>
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
        </div>

        {/* Block Sync Progress */}
        <BlockSyncProgress data={syncData} loading={syncLoading} />

        {/* Summary Cards */}
        <SummaryCards data={summary} loading={summaryLoading} />

        {/* Volume Chart */}
        <VolumeChart data={volume} loading={volumeLoading} />

        {/* Pie Charts Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <DirectionPie data={summary} loading={summaryLoading} />
          <JobStatusPie data={jobs} loading={jobsLoading} />
        </div>

        {/* Recent Failures */}
        <RecentFailures data={jobs} loading={jobsLoading} />
      </div>
    </PageShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Time Range Selector                                                */
/* ------------------------------------------------------------------ */

function TimeRangeSelector({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (v: TimeRange) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-muted/30 border border-border/50">
      {TIME_RANGES.map((r) => (
        <button
          key={r.value}
          onClick={() => onChange(r.value)}
          className={cn(
            "px-2.5 py-1 rounded text-[10px] font-mono transition-colors",
            value === r.value
              ? "bg-primary/15 text-primary border border-primary/20"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Summary Cards                                                      */
/* ------------------------------------------------------------------ */

function SummaryCards({
  data,
  loading,
}: {
  data: StatsSummary | undefined;
  loading: boolean;
}) {
  const cards = [
    {
      label: "Total Volume",
      value: data ? `$${Number(data.totalVolumeFormatted).toLocaleString()}` : "--",
      sub: data ? `${data.totalFeesFormatted} fees` : "",
      icon: DollarSign,
    },
    {
      label: "Transactions",
      value: data ? data.totalTransactions.toLocaleString() : "--",
      sub: data
        ? `${data.depositCount} dep / ${data.withdrawCount} wdraw`
        : "",
      icon: Activity,
    },
    {
      label: "Unique Users",
      value: data ? data.uniqueUsers.toLocaleString() : "--",
      sub: data ? `${data.gasSponsoredCount} gas sponsored` : "",
      icon: Users,
    },
    {
      label: "Success Rate",
      value: "--",
      sub: "",
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className="border border-border/50 bg-card rounded-lg p-4 space-y-1"
        >
          <div className="flex items-center gap-1.5">
            <c.icon className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">
              {c.label}
            </span>
          </div>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-1" />
          ) : (
            <>
              <div className="text-xl font-mono font-semibold text-foreground">
                {c.value}
              </div>
              {c.sub && (
                <div className="text-[10px] font-mono text-muted-foreground">
                  {c.sub}
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Volume Area Chart                                                  */
/* ------------------------------------------------------------------ */

function VolumeChart({
  data,
  loading,
}: {
  data: VolumeResponse | undefined;
  loading: boolean;
}) {
  const chartData = (data?.points ?? []).map((p) => ({
    date: p.date,
    deposits: Number(p.depositVolumeFormatted),
    withdrawals: Number(p.withdrawVolumeFormatted),
  }));

  return (
    <div className="border border-border/50 bg-card rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">
          Volume Over Time (USDC)
        </span>
        {data && (
          <span className="text-[10px] font-mono text-muted-foreground">
            {data.groupBy === "hour" ? "Hourly" : "Daily"}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-[250px]">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex items-center justify-center h-[250px] text-xs font-mono text-muted-foreground">
          No data for this period
        </div>
      ) : (
        <ChartContainer config={VOLUME_CHART_CONFIG} className="h-[250px] w-full">
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
            <XAxis
              dataKey="date"
              tickFormatter={(v: string) => {
                if (v.includes("T")) return v.split("T")[1];
                const parts = v.split("-");
                return `${parts[1]}/${parts[2]}`;
              }}
              className="text-[10px]"
              tick={{ fontSize: 10 }}
            />
            <YAxis
              tickFormatter={(v: number) => `$${v}`}
              className="text-[10px]"
              tick={{ fontSize: 10 }}
              width={60}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(label) => {
                    if (typeof label === "string" && label.includes("T"))
                      return label.replace("T", " ");
                    return String(label);
                  }}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Area
              type="monotone"
              dataKey="deposits"
              stackId="1"
              stroke="var(--color-deposits)"
              fill="var(--color-deposits)"
              fillOpacity={0.4}
            />
            <Area
              type="monotone"
              dataKey="withdrawals"
              stackId="1"
              stroke="var(--color-withdrawals)"
              fill="var(--color-withdrawals)"
              fillOpacity={0.4}
            />
          </AreaChart>
        </ChartContainer>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Direction Split Pie                                                */
/* ------------------------------------------------------------------ */

function DirectionPie({
  data,
  loading,
}: {
  data: StatsSummary | undefined;
  loading: boolean;
}) {
  const pieData = data
    ? [
        { name: "Deposits", value: Number(data.depositVolumeFormatted) },
        { name: "Withdrawals", value: Number(data.withdrawVolumeFormatted) },
      ]
    : [];

  const total = pieData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="border border-border/50 bg-card rounded-lg p-4">
      <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">
        Direction Split
      </span>

      {loading ? (
        <div className="flex items-center justify-center h-[200px]">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : total === 0 ? (
        <div className="flex items-center justify-center h-[200px] text-xs font-mono text-muted-foreground">
          No data
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="h-[200px] w-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={DIRECTION_COLORS[i]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            {pieData.map((d, i) => (
              <div key={d.name} className="flex items-center gap-2">
                <div
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: DIRECTION_COLORS[i] }}
                />
                <span className="text-xs font-mono text-muted-foreground">
                  {d.name}
                </span>
                <span className="text-xs font-mono font-medium text-foreground">
                  ${d.value.toLocaleString()}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">
                  ({total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Job Status Pie                                                     */
/* ------------------------------------------------------------------ */

function JobStatusPie({
  data,
  loading,
}: {
  data: JobHealthResponse | undefined;
  loading: boolean;
}) {
  const statuses = ["completed", "submitted", "claimed", "pending", "failed"];
  const pieData = data
    ? statuses
        .filter((s) => (data.statusCounts[s] ?? 0) > 0)
        .map((s) => ({
          name: s.charAt(0).toUpperCase() + s.slice(1),
          value: data.statusCounts[s] ?? 0,
          key: s,
        }))
    : [];

  return (
    <div className="border border-border/50 bg-card rounded-lg p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">
          Job Pipeline
        </span>
        {data && (
          <span className="text-xs font-mono font-medium text-foreground">
            {data.successRate.toFixed(1)}% success
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-[200px]">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : pieData.length === 0 ? (
        <div className="flex items-center justify-center h-[200px] text-xs font-mono text-muted-foreground">
          No jobs
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="h-[200px] w-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((d) => (
                    <Cell
                      key={d.key}
                      fill={JOB_STATUS_COLORS[d.key] ?? "hsl(0, 0%, 50%)"}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5">
            {pieData.map((d) => (
              <div key={d.key} className="flex items-center gap-2">
                <div
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{
                    backgroundColor:
                      JOB_STATUS_COLORS[d.key] ?? "hsl(0, 0%, 50%)",
                  }}
                />
                <span className="text-xs font-mono text-muted-foreground">
                  {d.name}
                </span>
                <span className="text-xs font-mono font-medium text-foreground">
                  {d.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Recent Failures Table                                              */
/* ------------------------------------------------------------------ */

function RecentFailures({
  data,
  loading,
}: {
  data: JobHealthResponse | undefined;
  loading: boolean;
}) {
  const failures = data?.recentFailures ?? [];

  if (!loading && failures.length === 0) return null;

  return (
    <div className="border border-border/50 bg-card rounded-lg p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <AlertTriangle className="h-3 w-3 text-destructive" />
        <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">
          Recent Failures
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border/30">
                <th className="text-left py-2 pr-3">Time</th>
                <th className="text-left py-2 pr-3">Direction</th>
                <th className="text-left py-2 pr-3">Route</th>
                <th className="text-right py-2 pr-3">Amount</th>
                <th className="text-left py-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {failures.map((f) => {
                const srcMeta = eidToChainMeta(f.srcEid);
                const dstMeta = eidToChainMeta(f.dstEid);
                const timeAgo = formatTimeAgo(f.updatedAt ?? f.createdAt);

                return (
                  <tr
                    key={f.id}
                    className="border-b border-border/20 last:border-0"
                  >
                    <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">
                      {timeAgo}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[10px]",
                          f.direction === "deposit"
                            ? "bg-green-500/10 text-green-500"
                            : "bg-blue-500/10 text-blue-500",
                        )}
                      >
                        {f.direction}
                      </span>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <span className="text-foreground">
                        {srcMeta?.shortLabel ?? f.srcEid}
                      </span>
                      <ArrowRight className="inline h-3 w-3 mx-1 text-muted-foreground" />
                      <span className="text-foreground">
                        {dstMeta?.shortLabel ?? f.dstEid}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right text-foreground">
                      ${f.amountFormatted}
                    </td>
                    <td className="py-2 text-destructive/80 max-w-[200px] truncate">
                      {f.errorMessage || "unknown"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Block Sync Progress                                                */
/* ------------------------------------------------------------------ */

function BlockSyncProgress({
  data,
  loading,
}: {
  data: SyncProgressResponse | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="border border-border/50 bg-card rounded-lg p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <Activity className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">
            Block Sync
          </span>
        </div>
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!data?.chains?.length) return null;

  // Group by chain (eid) — each chain may have multiple block tags (latest, finalized)
  const byChain = new Map<number, typeof data.chains>();
  for (const c of data.chains) {
    const list = byChain.get(c.eid) ?? [];
    list.push(c);
    byChain.set(c.eid, list);
  }

  return (
    <div className="border border-border/50 bg-card rounded-lg p-4">
      <div className="flex items-center gap-1.5 mb-4">
        <Activity className="h-3 w-3 text-primary" />
        <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">
          Block Sync
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {Array.from(byChain.entries()).map(([eid, cursors]) => {
          const primary = cursors.find((c) => c.blockTag === "latest") ?? cursors[0];
          const finality = cursors.find((c) => c.blockTag !== "latest");
          const blocksProcessed = primary.lastBlock - Number(primary.startBlock);
          const isRecent = primary.updatedAgo.includes("s ago") || primary.updatedAgo === "just now";

          return (
            <div
              key={eid}
              className="border border-border/30 rounded-lg p-3 space-y-2.5"
            >
              {/* Chain header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "h-2 w-2 rounded-full",
                      isRecent ? "bg-emerald-500 animate-pulse" : "bg-amber-500",
                    )}
                  />
                  <span className="text-xs font-mono font-medium text-foreground">
                    {primary.chainName}
                  </span>
                  <span
                    className={cn(
                      "text-[9px] font-mono px-1.5 py-0.5 rounded",
                      primary.role === "home"
                        ? "bg-green-500/10 text-green-500"
                        : "bg-blue-500/10 text-blue-500",
                    )}
                  >
                    {primary.role}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">
                  EID {eid}
                </span>
              </div>

              {/* Latest block */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-muted-foreground">
                    HEAD
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {primary.updatedAgo}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        isRecent
                          ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                          : "bg-gradient-to-r from-amber-500 to-amber-400",
                      )}
                      style={{ width: "100%" }}
                    />
                  </div>
                  <span className="text-xs font-mono font-medium text-foreground tabular-nums min-w-[80px] text-right">
                    {primary.lastBlock.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Finality block (if exists) */}
              {finality && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {finality.blockTag.toUpperCase()}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {finality.updatedAgo}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500/70 to-blue-400/70 rounded-full transition-all duration-500"
                        style={{
                          width:
                            primary.lastBlock > 0
                              ? `${Math.min(100, (finality.lastBlock / primary.lastBlock) * 100)}%`
                              : "0%",
                        }}
                      />
                    </div>
                    <span className="text-xs font-mono font-medium text-foreground tabular-nums min-w-[80px] text-right">
                      {finality.lastBlock.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              {/* Stats row */}
              <div className="flex items-center gap-3 pt-1 border-t border-border/20">
                <span className="text-[10px] font-mono text-muted-foreground">
                  {blocksProcessed > 0
                    ? `${blocksProcessed.toLocaleString()} blocks processed`
                    : "starting..."}
                </span>
                {finality && primary.lastBlock > finality.lastBlock && (
                  <span className="text-[10px] font-mono text-amber-500">
                    {(primary.lastBlock - finality.lastBlock).toLocaleString()} behind HEAD
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
