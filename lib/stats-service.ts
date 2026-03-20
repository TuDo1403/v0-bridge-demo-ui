const API_BASE = "/api/bridge/stats";

// ── Types ────────────────────────────────────────────────────────────────────

export interface StatsSummary {
  totalVolume: string;
  totalVolumeFormatted: string;
  totalTransactions: number;
  uniqueUsers: number;
  totalFees: string;
  totalFeesFormatted: string;
  depositCount: number;
  withdrawCount: number;
  depositVolume: string;
  depositVolumeFormatted: string;
  withdrawVolume: string;
  withdrawVolumeFormatted: string;
  gasSponsoredCount: number;
  timeRange: string;
}

export interface VolumePoint {
  date: string;
  depositVolume: string;
  depositVolumeFormatted: string;
  withdrawVolume: string;
  withdrawVolumeFormatted: string;
  depositCount: number;
  withdrawCount: number;
  totalVolume: string;
  totalVolumeFormatted: string;
}

export interface VolumeResponse {
  points: VolumePoint[];
  timeRange: string;
  groupBy: string;
}

export interface JobHealthResponse {
  statusCounts: Record<string, number>;
  totalJobs: number;
  successRate: number;
  recentFailures: FailureItem[];
  timeRange: string;
}

export interface FailureItem {
  id: string;
  direction: string;
  srcEid: number;
  dstEid: number;
  sender: string;
  amount: string;
  amountFormatted: string;
  errorMessage: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChainSyncInfo {
  eid: number;
  chainName: string;
  role: string;
  blockTag: string;
  lastBlock: number;
  startBlock: number;
  updatedAt: string;
  updatedAgo: string;
}

export interface SyncProgressResponse {
  chains: ChainSyncInfo[];
}

export type TimeRange = "24h" | "7d" | "30d" | "all";

// ── Fetchers ─────────────────────────────────────────────────────────────────

export async function fetchStatsSummary(
  range_: TimeRange = "all",
  network: "mainnet" | "testnet" = "mainnet",
): Promise<StatsSummary> {
  const res = await fetch(`${API_BASE}/summary?range=${range_}&net=${network}`);
  if (!res.ok) throw new Error("Failed to fetch stats summary");
  return res.json();
}

export async function fetchStatsVolume(
  range_: TimeRange = "30d",
  groupBy = "day",
  network: "mainnet" | "testnet" = "mainnet",
): Promise<VolumeResponse> {
  const res = await fetch(
    `${API_BASE}/volume?range=${range_}&groupBy=${groupBy}&net=${network}`,
  );
  if (!res.ok) throw new Error("Failed to fetch volume data");
  return res.json();
}

export async function fetchStatsJobs(
  range_: TimeRange = "24h",
  network: "mainnet" | "testnet" = "mainnet",
): Promise<JobHealthResponse> {
  const res = await fetch(`${API_BASE}/jobs?range=${range_}&net=${network}`);
  if (!res.ok) throw new Error("Failed to fetch job health");
  return res.json();
}

export async function fetchSyncProgress(
  network: "mainnet" | "testnet" = "mainnet",
): Promise<SyncProgressResponse> {
  const res = await fetch(`${API_BASE}/sync?net=${network}`);
  if (!res.ok) throw new Error("Failed to fetch sync progress");
  return res.json();
}
