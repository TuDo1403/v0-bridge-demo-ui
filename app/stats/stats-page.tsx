"use client";

import { useState } from "react";
import useSWR from "swr";
import { PageShell } from "@/components/bridge/page-shell";
import {
  fetchStatsSummary,
  fetchStatsVolume,
  fetchStatsJobs,
  type TimeRange,
  type StatsSummary,
  type VolumeResponse,
  type JobHealthResponse,
} from "@/lib/stats-service";
import { eidToChainMeta } from "@/config/chains";
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

  const { data: summary, isLoading: summaryLoading } = useSWR(
    ["stats-summary", timeRange],
    () => fetchStatsSummary(timeRange),
    { refreshInterval: 30_000 },
  );

  const { data: volume, isLoading: volumeLoading } = useSWR(
    ["stats-volume", timeRange],
    () => fetchStatsVolume(timeRange, timeRange === "24h" ? "hour" : "day"),
    { refreshInterval: 30_000 },
  );

  const { data: jobs, isLoading: jobsLoading } = useSWR(
    ["stats-jobs", timeRange],
    () => fetchStatsJobs(timeRange),
    { refreshInterval: 15_000 },
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
