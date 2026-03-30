/* ------------------------------------------------------------------ */
/*  Dynamic bridge configuration types + hook                          */
/* ------------------------------------------------------------------ */

import useSWR from "swr";
import { useNetworkStore } from "@/lib/network-store";

/* ── Response types (mirror backend BridgeConfigResponse) ─────────── */

export interface ConfigChain {
  eid: number;
  chainId: number;
  name: string;
  role: "home" | "remote";
  explorerUrl: string;
  globalDeposit?: string;
  globalWithdraw?: string;
  paused: boolean;
}

export interface ConfigTokenChain {
  address: string;
  oft: string;
  symbol: string;
  name: string;
}

export interface ConfigToken {
  /** Canonical address (lowest EID) — stable identity for keying */
  id: string;
  decimals: number;
  /** Per-chain metadata: address, OFT, symbol, name */
  chains: Record<string, ConfigTokenChain>;
}

export interface ConfigDapp {
  dappId: number;
  label: string;
  description: string;
  roundTrip: boolean;
  composer?: string;
  /** Supported token addresses per home EID */
  supportedTokens: Record<string, string[]>;
}

export interface ConfigRoute {
  srcEid: number;
  dstEid: number;
  direction: "deposit" | "withdraw";
  paused: boolean;
  /** Token IDs (canonical addresses) enabled on this lane */
  tokens: string[];
}

export interface ConfigTokenFee {
  mode: number;
  flatFee: string;
}

export interface ConfigFee {
  feeBps: number;
  tokenFees: Record<string, ConfigTokenFee>;
}

export interface BridgeConfig {
  chains: ConfigChain[];
  tokens: ConfigToken[];
  dapps: ConfigDapp[];
  routes: ConfigRoute[];
  fees: Record<string, ConfigFee>;
}

/* ── SWR hook ─────────────────────────────────────────────────────── */

const fetcher = async (url: string): Promise<BridgeConfig> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Config fetch failed: ${res.status}`);
  return res.json();
};

/**
 * Fetches and caches the dynamic bridge config from the backend.
 * Revalidates every 60s and on focus. Falls back gracefully on error.
 */
export function useBridgeConfig() {
  const network = useNetworkStore((s) => s.network);

  const { data, error, isLoading } = useSWR<BridgeConfig>(
    `/api/bridge/config?net=${network}`,
    fetcher,
    {
      refreshInterval: 60_000,
      revalidateOnFocus: true,
      dedupingInterval: 10_000,
      errorRetryCount: 3,
    }
  );

  return {
    config: data,
    isLoading,
    error,
  };
}

/* ── Helpers ──────────────────────────────────────────────────────── */

/** Find the token entry by its canonical ID */
export function findTokenById(config: BridgeConfig | undefined, id: string): ConfigToken | undefined {
  return config?.tokens.find((t) => t.id === id);
}

/** Find a token by its address on a specific chain */
export function findTokenByAddress(
  config: BridgeConfig | undefined,
  eid: number,
  address: string
): ConfigToken | undefined {
  const addr = address.toLowerCase();
  return config?.tokens.find((t) => t.chains[String(eid)]?.address === addr);
}

/** Get dapps available for a given token on a given source chain */
export function getAvailableDapps(
  config: BridgeConfig | undefined,
  srcEid: number,
  tokenAddress: string
): ConfigDapp[] {
  if (!config) return [];
  const addr = tokenAddress.toLowerCase();
  const eidStr = String(srcEid);
  return config.dapps.filter((d) =>
    d.supportedTokens[eidStr]?.includes(addr)
  );
}

/** Get tokens available on a specific route */
export function getRouteTokens(
  config: BridgeConfig | undefined,
  srcEid: number,
  dstEid: number
): ConfigToken[] {
  if (!config) return [];
  const route = config.routes.find(
    (r) => r.srcEid === srcEid && r.dstEid === dstEid
  );
  if (!route) return [];
  return config.tokens.filter((t) => route.tokens.includes(t.id));
}

/** Check if a dapp is round-trip from dynamic config */
export function isDappRoundTrip(config: BridgeConfig | undefined, dappId: number): boolean {
  return config?.dapps.find((d) => d.dappId === dappId)?.roundTrip ?? false;
}

/** A token option for the UI selector, derived from dynamic config */
export interface TokenOption {
  /** Stable key for the selector (source chain symbol, e.g. "USDC") */
  key: string;
  /** Display symbol on source chain */
  symbol: string;
  /** Display name on source chain */
  name: string;
  /** Token address on source chain */
  address: string;
  /** Decimals */
  decimals: number;
  /** Canonical token ID */
  id: string;
}

/** Get token options available for a route, keyed by source-chain symbol for UI compatibility */
export function getTokenOptions(
  config: BridgeConfig | undefined,
  srcEid: number,
  dstEid: number,
): TokenOption[] {
  if (!config) return [];
  const route = config.routes.find(
    (r) => r.srcEid === srcEid && r.dstEid === dstEid
  );
  if (!route) return [];

  const srcEidStr = String(srcEid);
  const options: TokenOption[] = [];

  for (const token of config.tokens) {
    const srcChain = token.chains[srcEidStr];
    if (!srcChain) continue;
    if (!route.tokens.includes(token.id)) continue;

    options.push({
      key: srcChain.symbol, // use symbol as key for backward compat with tokenKey
      symbol: srcChain.symbol,
      name: srcChain.name,
      address: srcChain.address,
      decimals: token.decimals,
      id: token.id,
    });
  }

  return options;
}

/** Resolve token address from dynamic config, falling back to hardcoded */
export function resolveTokenAddress(
  config: BridgeConfig | undefined,
  tokenKey: string,
  eid: number,
): string | undefined {
  if (!config) return undefined;
  const eidStr = String(eid);
  // Find by symbol match on the given chain
  for (const token of config.tokens) {
    const chain = token.chains[eidStr];
    if (chain && chain.symbol === tokenKey) {
      return chain.address;
    }
  }
  return undefined;
}

/** Resolve token metadata from dynamic config */
export function resolveTokenMeta(
  config: BridgeConfig | undefined,
  tokenKey: string,
  eid: number,
): { symbol: string; name: string; decimals: number; address: string } | undefined {
  if (!config) return undefined;
  const eidStr = String(eid);
  for (const token of config.tokens) {
    const chain = token.chains[eidStr];
    if (chain && chain.symbol === tokenKey) {
      return { symbol: chain.symbol, name: chain.name, decimals: token.decimals, address: chain.address };
    }
  }
  return undefined;
}
