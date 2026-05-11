"use client";

import { useState } from "react";
import useSWR from "swr";
import { PageShell } from "@/components/bridge/page-shell";
import { useBridgeConfig, type BridgeConfig, type ConfigToken } from "@/lib/bridge-config";
import {
  fetchStatsSummary,
  fetchStatsVolume,
  fetchStatsTrends,
  fetchStatsJobs,
  fetchSyncProgress,
  type TimeRange,
  type StatsSummary,
  type VolumeResponse,
  type TrendsResponse,
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
  LineChart,
  Line,
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
  Coins,
  ReceiptText,
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

const TREND_COLORS = [
  "hsl(217, 91%, 60%)",
  "hsl(142, 76%, 36%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 84%, 60%)",
  "hsl(280, 65%, 60%)",
  "hsl(185, 70%, 42%)",
  "hsl(24, 95%, 53%)",
  "hsl(330, 81%, 60%)",
];

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
  const { config: bridgeConfig, isLoading: configLoading } = useBridgeConfig();
  const { data: prices, isLoading: pricesLoading } = useSWR(
    "stats-token-prices",
    fetchTokenPrices,
    {
      refreshInterval: 300_000,
      revalidateOnFocus: false,
    },
  );

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

  const { data: trends, isLoading: trendsLoading } = useSWR(
    ["stats-trends", timeRange, network],
    () => fetchStatsTrends(timeRange, timeRange === "24h" ? "hour" : "day", network),
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
        <SummaryCards
          data={summary}
          config={bridgeConfig}
          prices={prices}
          loading={summaryLoading || configLoading || pricesLoading}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <TokenVolumeBreakdown
            data={summary}
            config={bridgeConfig}
            loading={summaryLoading || configLoading}
          />
          <ChainFeesTable
            data={summary}
            config={bridgeConfig}
            prices={prices}
            loading={summaryLoading || configLoading || pricesLoading}
          />
        </div>

        {/* Volume Chart */}
        <VolumeChart data={volume} loading={volumeLoading} />

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          <FeeTrendChart
            data={trends}
            config={bridgeConfig}
            prices={prices}
            loading={trendsLoading || configLoading || pricesLoading}
          />
          <OperatorTxCostTrendChart
            data={trends}
            prices={prices}
            loading={trendsLoading || pricesLoading}
          />
          <TokenTrendChart
            data={trends}
            config={bridgeConfig}
            prices={prices}
            loading={trendsLoading || configLoading || pricesLoading}
          />
        </div>

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
/*  Token Volume Breakdown                                             */
/* ------------------------------------------------------------------ */

function TokenVolumeBreakdown({
  data,
  config,
  loading,
}: {
  data: StatsSummary | undefined;
  config: BridgeConfig | undefined;
  loading: boolean;
}) {
  const rows = data?.tokenVolumes ?? [];

  return (
    <div className="border border-border/50 bg-card rounded-lg p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <Coins className="h-3 w-3 text-primary" />
        <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">
          Volume by Token
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-xs font-mono text-muted-foreground">
          No volume
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border/30">
                <th className="text-left py-2 pr-3">Token</th>
                <th className="text-right py-2 pr-3">Total</th>
                <th className="text-right py-2 pr-3">Deposits</th>
                <th className="text-right py-2">Withdrawals</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const token = resolveStatsToken(config, row.token, statsTokenEid(row));
                const total = formatTokenUnits(row.totalVolume, token.decimals);
                const deposits = formatTokenUnits(row.depositVolume, token.decimals);
                const withdrawals = formatTokenUnits(row.withdrawVolume, token.decimals);

                return (
                  <tr
                    key={`${row.chainId}:${row.token}`}
                    className="border-b border-border/20 last:border-0"
                  >
                    <td className="py-2 pr-3">
                      <div className="text-foreground">{token.symbol}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {row.chainName} · {row.transactionCount.toLocaleString()} tx
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right text-foreground tabular-nums">
                      {total}
                    </td>
                    <td className="py-2 pr-3 text-right text-muted-foreground tabular-nums">
                      {deposits}
                    </td>
                    <td className="py-2 text-right text-muted-foreground tabular-nums">
                      {withdrawals}
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
/*  Chain Fees                                                         */
/* ------------------------------------------------------------------ */

function ChainFeesTable({
  data,
  config,
  prices,
  loading,
}: {
  data: StatsSummary | undefined;
  config: BridgeConfig | undefined;
  prices: TokenPrices | undefined;
  loading: boolean;
}) {
  const rows = data?.chainFees ?? [];

  return (
    <div className="border border-border/50 bg-card rounded-lg p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <ReceiptText className="h-3 w-3 text-primary" />
        <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">
          Bridge Fees by Chain
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-xs font-mono text-muted-foreground">
          No fees
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border/30">
                <th className="text-left py-2 pr-3">Chain</th>
                <th className="text-right py-2 pr-3">Fee</th>
                <th className="text-right py-2">USD</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const token = resolveStatsToken(config, row.token, statsTokenEid(row));
                const fee = tokenAmountNumber(row.fee, token.decimals);
                const usd = fee * tokenUsdPrice(token.symbol, prices);

                return (
                  <tr
                    key={`${row.chainId}:${row.token}`}
                    className="border-b border-border/20 last:border-0"
                  >
                    <td className="py-2 pr-3">
                      <div className="text-foreground">{row.chainName}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {row.transactionCount.toLocaleString()} tx
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right text-muted-foreground tabular-nums">
                      {formatTokenUnits(row.fee, token.decimals)} {token.symbol}
                    </td>
                    <td className="py-2 text-right text-foreground tabular-nums">
                      {Number.isFinite(usd) ? formatUSD(usd) : "--"}
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
  config,
  prices,
  loading,
}: {
  data: StatsSummary | undefined;
  config: BridgeConfig | undefined;
  prices: TokenPrices | undefined;
  loading: boolean;
}) {
  const tokenVolumeUsd = data ? summaryTokenVolumeUsd(data, config, prices) : Number.NaN;
  const cards = [
    {
      label: "Total Volume",
      value: data
        ? Number.isFinite(tokenVolumeUsd)
          ? formatUSD(tokenVolumeUsd)
          : `$${Number(data.totalVolumeFormatted).toLocaleString()}`
        : "--",
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
/*  Trend Line Charts                                                  */
/* ------------------------------------------------------------------ */

function FeeTrendChart({
  data,
  config,
  prices,
  loading,
}: {
  data: TrendsResponse | undefined;
  config: BridgeConfig | undefined;
  prices: TokenPrices | undefined;
  loading: boolean;
}) {
  const chart = buildFeeTrendChart(data, config, prices);
  return (
    <TrendLineChart
      title="Bridge Fee Over Time (USD)"
      data={chart.data}
      series={chart.series}
      groupBy={data?.groupBy}
      loading={loading}
    />
  );
}

function TokenTrendChart({
  data,
  config,
  prices,
  loading,
}: {
  data: TrendsResponse | undefined;
  config: BridgeConfig | undefined;
  prices: TokenPrices | undefined;
  loading: boolean;
}) {
  const chart = buildTokenTrendChart(data, config, prices);
  return (
    <TrendLineChart
      title="Token Volume Over Time (USD)"
      data={chart.data}
      series={chart.series}
      groupBy={data?.groupBy}
      loading={loading}
    />
  );
}

function OperatorTxCostTrendChart({
  data,
  prices,
  loading,
}: {
  data: TrendsResponse | undefined;
  prices: TokenPrices | undefined;
  loading: boolean;
}) {
  const chart = buildOperatorTxCostTrendChart(data, prices);
  return (
    <TrendLineChart
      title="Operator Tx Cost Over Time (USD)"
      data={chart.data}
      series={chart.series}
      groupBy={data?.groupBy}
      loading={loading}
    />
  );
}

function TrendLineChart({
  title,
  data,
  series,
  groupBy,
  loading,
}: {
  title: string;
  data: TrendChartRow[];
  series: TrendSeries[];
  groupBy: string | undefined;
  loading: boolean;
}) {
  const chartConfig = series.reduce<ChartConfig>((acc, item) => {
    acc[item.key] = { label: item.label, color: item.color };
    return acc;
  }, {});

  return (
    <div className="border border-border/50 bg-card rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">
          {title}
        </span>
        {groupBy && (
          <span className="text-[10px] font-mono text-muted-foreground">
            {groupBy === "hour" ? "Hourly" : "Daily"}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-[250px]">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : data.length === 0 || series.length === 0 ? (
        <div className="flex items-center justify-center h-[250px] text-xs font-mono text-muted-foreground">
          No data for this period
        </div>
      ) : (
        <ChartContainer config={chartConfig} className="h-[250px] w-full">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
            <XAxis
              dataKey="date"
              tickFormatter={formatChartDateTick}
              className="text-[10px]"
              tick={{ fontSize: 10 }}
            />
            <YAxis
              tickFormatter={(v: number) => compactUSD(v)}
              className="text-[10px]"
              tick={{ fontSize: 10 }}
              width={64}
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
            {series.map((item) => (
              <Line
                key={item.key}
                type="monotone"
                dataKey={item.key}
                stroke={`var(--color-${item.key})`}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            ))}
          </LineChart>
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

interface StatsTokenMeta {
  symbol: string;
  decimals?: number;
}

interface TrendSeries {
  key: string;
  label: string;
  color: string;
  total: number;
}

type TrendChartRow = { date: string } & Record<string, number | string | null>;

interface TokenPrices {
  ethUsd?: number;
}

async function fetchTokenPrices(): Promise<TokenPrices> {
  const res = await fetch("https://coins.llama.fi/prices/current/coingecko:ethereum", {
    cache: "no-store",
  });
  if (!res.ok) return {};
  const data = await res.json();
  const price = data?.coins?.["coingecko:ethereum"]?.price;
  return typeof price === "number" ? { ethUsd: price } : {};
}

function resolveStatsToken(
	config: BridgeConfig | undefined,
	tokenAddress: string,
	eid?: number,
): StatsTokenMeta {
  if (tokenAddress === "native:ETH") {
    return { symbol: "ETH", decimals: 18 };
  }

  const token = findStatsToken(config, tokenAddress, eid);
  if (token) {
    const chain =
      (eid ? token.chains[String(eid)] : undefined) ??
      Object.values(token.chains)[0];
    return {
      symbol: chain?.symbol ?? shortAddress(tokenAddress),
      decimals: token.decimals,
    };
  }

  return { symbol: shortAddress(tokenAddress) };
}

function statsTokenEid(row: { lzEid?: number; eid?: number }): number | undefined {
  return row.lzEid ?? (row.eid && row.eid > 0 ? row.eid : undefined);
}

function findStatsToken(
  config: BridgeConfig | undefined,
  tokenAddress: string,
  eid?: number,
): ConfigToken | undefined {
  if (!config) return undefined;
  const addr = tokenAddress.toLowerCase();
  if (eid) {
    const chainKey = String(eid);
    const exact = config.tokens.find(
      (token) => token.chains[chainKey]?.address.toLowerCase() === addr,
    );
    if (exact) return exact;
    return undefined;
  }
  return config.tokens.find((token) =>
    Object.values(token.chains).some((chain) => chain.address.toLowerCase() === addr),
  );
}

function formatTokenUnits(raw: string, decimals?: number, maxFraction = 4): string {
  if (decimals == null) {
    return `${raw || "0"} raw`;
  }

  let value: bigint;
  try {
    value = BigInt(raw || "0");
  } catch {
    return "0";
  }
  const zero = BigInt(0);
  const negative = value < zero;
  if (negative) value = -value;

  let scale = BigInt(1);
  for (let i = 0; i < decimals; i++) {
    scale *= BigInt(10);
  }
  const whole = value / scale;
  const fraction = value % scale;
  let out = whole.toLocaleString("en-US");
  if (maxFraction > 0 && fraction > zero) {
    const padded = fraction.toString().padStart(decimals, "0");
    const trimmed = padded.slice(0, maxFraction).replace(/0+$/, "");
    if (trimmed) out += `.${trimmed}`;
  }
  return negative ? `-${out}` : out;
}

function tokenAmountNumber(raw: string, decimals?: number): number {
  if (decimals == null) return Number.NaN;
  let value: bigint;
  try {
    value = BigInt(raw || "0");
  } catch {
    return Number.NaN;
  }

  const zero = BigInt(0);
  const negative = value < zero;
  if (negative) value = -value;

  let scale = BigInt(1);
  for (let i = 0; i < decimals; i++) {
    scale *= BigInt(10);
  }

  const whole = value / scale;
  const fraction = value % scale;
  const precision = 12;
  const decimal = `${whole.toString()}.${fraction.toString().padStart(decimals, "0").slice(0, precision)}`;
  const amount = Number(decimal);
  if (!Number.isFinite(amount)) return Number.NaN;
  return negative ? -amount : amount;
}

function tokenUsdPrice(symbol: string, prices: TokenPrices | undefined): number {
  const normalized = symbol.replace(/\.e$/i, "").toUpperCase();
  if (["USDC", "USDT", "DAI", "USD"].includes(normalized)) return 1;
  if (normalized === "ETH") return prices?.ethUsd ?? Number.NaN;
  return Number.NaN;
}

function buildFeeTrendChart(
  data: TrendsResponse | undefined,
  config: BridgeConfig | undefined,
  prices: TokenPrices | undefined,
): { data: TrendChartRow[]; series: TrendSeries[] } {
  const buckets = new Map<string, TrendChartRow>();
  const series = new Map<string, TrendSeries>();

  for (const point of data?.chainFees ?? []) {
    const token = resolveStatsToken(config, point.token, statsTokenEid(point));
    const fee = tokenAmountNumber(point.fee, token.decimals);
    const usd = fee * tokenUsdPrice(token.symbol, prices);

    const key = `fee${point.chainId}`;
    const value = Number.isFinite(usd) ? usd : null;
    const existing = series.get(key);
    if (existing) {
      existing.total += value ?? 0;
    } else {
      series.set(key, {
        key,
        label: point.chainName,
        color: TREND_COLORS[series.size % TREND_COLORS.length],
        total: value ?? 0,
      });
    }

    const bucket = buckets.get(point.date) ?? { date: point.date };
    addTrendValue(bucket, key, value);
    buckets.set(point.date, bucket);
  }

  return finalizeTrendChart(buckets, series);
}

function buildTokenTrendChart(
  data: TrendsResponse | undefined,
  config: BridgeConfig | undefined,
  prices: TokenPrices | undefined,
): { data: TrendChartRow[]; series: TrendSeries[] } {
  const buckets = new Map<string, TrendChartRow>();
  const series = new Map<string, TrendSeries>();

  for (const point of data?.tokenVolumes ?? []) {
    const token = resolveStatsToken(config, point.token, statsTokenEid(point));
    const amount = tokenAmountNumber(point.totalVolume, token.decimals);
    const usd = amount * tokenUsdPrice(token.symbol, prices);

    const key = `token${point.chainId}_${hashTrendKey(point.token)}`;
    const value = Number.isFinite(usd) ? usd : null;
    const label = `${token.symbol} ${point.chainName}`;
    const existing = series.get(key);
    if (existing) {
      existing.total += value ?? 0;
    } else {
      series.set(key, {
        key,
        label,
        color: TREND_COLORS[series.size % TREND_COLORS.length],
        total: value ?? 0,
      });
    }

    const bucket = buckets.get(point.date) ?? { date: point.date };
    addTrendValue(bucket, key, value);
    buckets.set(point.date, bucket);
  }

  return finalizeTrendChart(buckets, series);
}

function buildOperatorTxCostTrendChart(
  data: TrendsResponse | undefined,
  prices: TokenPrices | undefined,
): { data: TrendChartRow[]; series: TrendSeries[] } {
  const buckets = new Map<string, TrendChartRow>();
  const series = new Map<string, TrendSeries>();
  const ethUsd = prices?.ethUsd ?? Number.NaN;

  for (const point of data?.operatorTxCosts ?? []) {
    const gasCostWei = BigInt(point.gasCostWei || "0");
    const sentWei = BigInt(point.sentWei || "0");
    const totalCostEth = tokenAmountNumber((gasCostWei + sentWei).toString(), 18);
    const usd = totalCostEth * ethUsd;

    const key = `operator${point.chainId}_${hashTrendKey(point.role)}`;
    const value = Number.isFinite(usd) ? usd : null;
    const label =
      point.role === "operator_bridge"
        ? point.chainName
        : `${point.chainName} ${formatTrendRole(point.role)}`;
    const existing = series.get(key);
    if (existing) {
      existing.total += value ?? 0;
    } else {
      series.set(key, {
        key,
        label,
        color: TREND_COLORS[series.size % TREND_COLORS.length],
        total: value ?? 0,
      });
    }

    const bucket = buckets.get(point.date) ?? { date: point.date };
    addTrendValue(bucket, key, value);
    buckets.set(point.date, bucket);
  }

  return finalizeTrendChart(buckets, series);
}

function finalizeTrendChart(
  buckets: Map<string, TrendChartRow>,
  seriesMap: Map<string, TrendSeries>,
): { data: TrendChartRow[]; series: TrendSeries[] } {
  const series = Array.from(seriesMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, TREND_COLORS.length)
    .map((item, index) => ({
      ...item,
      color: TREND_COLORS[index],
    }));
  const rows = Array.from(buckets.values())
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map((bucket) => {
      const row: TrendChartRow = { date: String(bucket.date) };
      for (const item of series) {
        const value = bucket[item.key];
        row[item.key] = typeof value === "number" || value === null ? value : 0;
      }
      return row;
    });
  return {
    data: rows,
    series,
  };
}

function addTrendValue(row: TrendChartRow, key: string, value: number | null) {
  if (value === null) {
    if (!(key in row)) row[key] = null;
    return;
  }
  row[key] = Number(row[key] ?? 0) + value;
}

function formatTrendRole(role: string): string {
  return role.replace(/^op_/, "").replace(/_/g, " ");
}

function hashTrendKey(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function formatChartDateTick(value: string): string {
  if (value.includes("T")) return value.split("T")[1];
  const parts = value.split("-");
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : value;
}

function compactUSD(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}m`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  if (value >= 1) return `$${value.toFixed(0)}`;
  if (value > 0) return `$${value.toFixed(4)}`;
  return "$0";
}

function summaryTokenVolumeUsd(
  data: StatsSummary,
  config: BridgeConfig | undefined,
  prices: TokenPrices | undefined,
): number {
  if (!data.tokenVolumes.length) return Number.NaN;
  let total = 0;
  for (const row of data.tokenVolumes) {
    const token = resolveStatsToken(config, row.token, statsTokenEid(row));
    const amount = tokenAmountNumber(row.totalVolume, token.decimals);
    const price = tokenUsdPrice(token.symbol, prices);
    if (!Number.isFinite(amount) || !Number.isFinite(price)) {
      return Number.NaN;
    }
    total += amount * price;
  }
  return total;
}

function formatUSD(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : value >= 1 ? 2 : 4,
  });
}

function shortAddress(value: string): string {
  return value.length > 10 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}
