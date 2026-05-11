"use client";

import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { type Address, formatUnits } from "viem";
import { oftRateLimitAbi, riseGlobalWithdrawAbi } from "@/lib/abi";
import {
  CONTRACTS,
  getGlobalWithdrawAddress,
  getGlobalDepositAddress,
} from "@/config/contracts";
import { CHAINS } from "@/config/chains";
import { type BridgeConfig, type ConfigToken, useBridgeConfig } from "@/lib/bridge-config";
import { useNetworkStore, NETWORK_CHAIN_IDS } from "@/lib/network-store";
import type { LaneInfo, RateLimitData } from "@/components/bridge/lane-status";

interface UseLaneStatusReturn {
  lanes: LaneInfo[];
  isLoading: boolean;
}

type PoolLimitKind = "outbound" | "inbound";

type PoolLimitDescriptor = {
  eid: number;
  kind: PoolLimitKind;
  decimals: number;
  symbol: string;
};

type PoolLimitContract = {
  address: Address;
  abi: typeof oftRateLimitAbi;
  functionName: "getOutboundRateLimitBucket" | "getInboundRateLimitBucket";
  args: readonly [number];
  chainId: number;
};

type RateLimitBucket = {
  available: bigint;
  capacity: bigint;
  enabled: boolean;
};

type PoolLimit = {
  available: number;
  capacity: number;
  symbol: string;
};

const LANE_LIMIT_TOKEN_SYMBOL = "USDC";
const LANE_STATUS_REFETCH_INTERVAL_MS = 2_000;

function normalizeTokenSymbol(symbol: string): string {
  return symbol.replace(/\.e$/i, "").toUpperCase();
}

function findRouteTokenBySymbol(
  config: BridgeConfig | undefined,
  eid: number,
  tokenIds: string[] | undefined,
  symbol: string,
): ConfigToken[] {
  if (!config || !tokenIds?.length) return [];

  const allowedTokenIds = new Set(tokenIds.map((id) => id.toLowerCase()));
  return config.tokens.filter((token) => {
    if (!allowedTokenIds.has(token.id.toLowerCase())) return false;

    const tokenChain = token.chains[String(eid)];
    return !!tokenChain && normalizeTokenSymbol(tokenChain.symbol) === symbol;
  });
}

function findRouteTokens(
  config: BridgeConfig | undefined,
  srcEid: number,
  dstEid: number,
  direction: "deposit" | "withdraw",
  tokenEid: number,
): ConfigToken[] {
  const route = config?.routes.find((candidate) =>
    candidate.srcEid === srcEid &&
    candidate.dstEid === dstEid &&
    candidate.direction === direction
  );

  return findRouteTokenBySymbol(config, tokenEid, route?.tokens, LANE_LIMIT_TOKEN_SYMBOL);
}

function normalizeRateLimitBucket(value: unknown): RateLimitBucket | undefined {
  if (!value) return undefined;

  if (Array.isArray(value)) {
    const [capacity, , available, , enabled] = value;
    if (
      typeof capacity === "bigint" &&
      typeof available === "bigint" &&
      typeof enabled === "boolean"
    ) {
      return { available, capacity, enabled };
    }
  }

  const bucket = value as Partial<RateLimitBucket>;
  if (
    typeof bucket.available === "bigint" &&
    typeof bucket.capacity === "bigint" &&
    typeof bucket.enabled === "boolean"
  ) {
    return {
      available: bucket.available,
      capacity: bucket.capacity,
      enabled: bucket.enabled,
    };
  }

  return undefined;
}

/**
 * Fetches real on-chain lane status from the GlobalWithdraw contract.
 *
 * Withdrawal lanes: getLanes() returns registered dstEids.
 * For each lane: isLanePaused(eid) + getLaneRateLimitBucket(eid).
 *
 * Deposit lane: always active if the GlobalDeposit contract exists.
 */
export function useLaneStatus(): UseLaneStatusReturn {
  const network = useNetworkStore((s) => s.network);
  const { config: bridgeConfig, isLoading: isConfigLoading } = useBridgeConfig();
  const { rise: riseChainId } = NETWORK_CHAIN_IDS[network];
  const globalWithdrawAddr = getGlobalWithdrawAddress(riseChainId);
  const depositChainIds = useMemo(
    () => Object.values(CHAINS)
      .filter((chain) => chain.network === network && chain.chain.id !== riseChainId && !!getGlobalDepositAddress(chain.chain.id))
      .map((chain) => chain.chain.id),
    [network, riseChainId],
  );

  // --- Withdrawal lanes: get registered dstEids ---
  const { data: rawLanes, isLoading: isLanesLoading } = useReadContract({
    address: globalWithdrawAddr,
    abi: riseGlobalWithdrawAbi,
    functionName: "getLanes",
    chainId: riseChainId,
    query: {
      enabled: !!globalWithdrawAddr,
      staleTime: LANE_STATUS_REFETCH_INTERVAL_MS,
      refetchInterval: LANE_STATUS_REFETCH_INTERVAL_MS,
    },
  });

  const dstEids = (rawLanes as number[] | undefined) ?? [];

  // --- Batch: isLanePaused + getLaneRateLimitBucket for each lane ---
  const batchContracts = useMemo(() => {
    if (!globalWithdrawAddr || dstEids.length === 0) return [];
    return dstEids.flatMap((eid) => [
      {
        address: globalWithdrawAddr,
        abi: riseGlobalWithdrawAbi,
        functionName: "isLanePaused" as const,
        args: [eid] as const,
        chainId: riseChainId,
      },
      {
        address: globalWithdrawAddr,
        abi: riseGlobalWithdrawAbi,
        functionName: "getLaneRateLimitBucket" as const,
        args: [eid] as const,
        chainId: riseChainId,
      },
    ]);
  }, [globalWithdrawAddr, dstEids, riseChainId]);

  const { data: batchData, isLoading: isBatchLoading } = useReadContracts({
    contracts: batchContracts,
    query: {
      enabled: batchContracts.length > 0,
      refetchInterval: LANE_STATUS_REFETCH_INTERVAL_MS,
    },
  });

  const fallbackUsdcToken = useMemo(
    () => bridgeConfig?.tokens.find((token) =>
      Object.values(token.chains).some((chain) =>
        normalizeTokenSymbol(chain.symbol) === LANE_LIMIT_TOKEN_SYMBOL
      )
    ),
    [bridgeConfig],
  );

  const riseEid = CHAINS[riseChainId]?.lzEid;

  const poolLimitReadPlan = useMemo(() => {
    const contracts: PoolLimitContract[] = [];
    const descriptors: PoolLimitDescriptor[] = [];

    if (!riseEid || dstEids.length === 0) return { contracts, descriptors };

    for (const eid of dstEids) {
      const destChainId = Object.values(CHAINS).find((c) => c.lzEid === eid)?.chain.id;
      if (!destChainId) continue;

      const sourceTokens = findRouteTokens(
        bridgeConfig,
        riseEid,
        eid,
        "withdraw",
        riseEid,
      );
      const destTokens = findRouteTokens(
        bridgeConfig,
        eid,
        riseEid,
        "deposit",
        eid,
      );
      const sourceCandidates = sourceTokens.length > 0
        ? sourceTokens.map((token) => ({ token, tokenChain: token.chains[String(riseEid)] }))
        : [{
          token: fallbackUsdcToken,
          tokenChain: fallbackUsdcToken?.chains[String(riseEid)] ?? (
            CONTRACTS[riseChainId]?.mintBurnOFT
              ? { oft: CONTRACTS[riseChainId].mintBurnOFT, symbol: LANE_LIMIT_TOKEN_SYMBOL }
              : undefined
          ),
        }];
      const destCandidates = destTokens.length > 0
        ? destTokens.map((token) => ({ token, tokenChain: token.chains[String(eid)] }))
        : [{
          token: fallbackUsdcToken,
          tokenChain: fallbackUsdcToken?.chains[String(eid)] ?? (
            CONTRACTS[destChainId]?.lockReleaseOFT
              ? { oft: CONTRACTS[destChainId].lockReleaseOFT, symbol: LANE_LIMIT_TOKEN_SYMBOL }
              : undefined
          ),
        }];

      for (const { token, tokenChain } of sourceCandidates) {
        const sourceOft = tokenChain?.oft;
        if (!sourceOft) continue;
        contracts.push({
          address: sourceOft as Address,
          abi: oftRateLimitAbi,
          functionName: "getOutboundRateLimitBucket",
          args: [eid] as const,
          chainId: riseChainId,
        });
        descriptors.push({
          eid,
          kind: "outbound",
          decimals: token?.decimals ?? fallbackUsdcToken?.decimals ?? 6,
          symbol: normalizeTokenSymbol(tokenChain?.symbol ?? LANE_LIMIT_TOKEN_SYMBOL),
        });
      }

      for (const { token, tokenChain } of destCandidates) {
        const destOft = tokenChain?.oft;
        if (!destOft) continue;
        contracts.push({
          address: destOft as Address,
          abi: oftRateLimitAbi,
          functionName: "getInboundRateLimitBucket",
          args: [riseEid] as const,
          chainId: destChainId,
        });
        descriptors.push({
          eid,
          kind: "inbound",
          decimals: token?.decimals ?? fallbackUsdcToken?.decimals ?? 6,
          symbol: normalizeTokenSymbol(tokenChain?.symbol ?? LANE_LIMIT_TOKEN_SYMBOL),
        });
      }
    }

    return { contracts, descriptors };
  }, [bridgeConfig, dstEids, fallbackUsdcToken, riseChainId, riseEid]);

  const { data: poolLimitData, isLoading: isPoolLimitLoading } = useReadContracts({
    contracts: poolLimitReadPlan.contracts,
    allowFailure: true,
    query: {
      enabled: poolLimitReadPlan.contracts.length > 0,
      refetchInterval: LANE_STATUS_REFETCH_INTERVAL_MS,
    },
  });

  const poolLimitsByEid = useMemo(() => {
    const limits = new Map<number, Partial<Record<PoolLimitKind, PoolLimit>>>();

    poolLimitReadPlan.descriptors.forEach((descriptor, index) => {
      const result = poolLimitData?.[index];
      if (result?.status !== "success") return;

      const bucket = normalizeRateLimitBucket(result.result);
      if (!bucket?.enabled) return;

      const laneLimits = limits.get(descriptor.eid) ?? {};
      laneLimits[descriptor.kind] = {
        available: Number(formatUnits(bucket.available, descriptor.decimals)),
        capacity: Number(formatUnits(bucket.capacity, descriptor.decimals)),
        symbol: descriptor.symbol,
      };
      limits.set(descriptor.eid, laneLimits);
    });

    return limits;
  }, [poolLimitData, poolLimitReadPlan]);

  // --- Build lane infos ---
  const lanes = useMemo<LaneInfo[]>(() => {
    const result: LaneInfo[] = [];

    // Deposit lanes are currently not rate-limited, but show each configured home chain.
    for (const sourceChainId of depositChainIds) {
      result.push({
        sourceChainId,
        destChainId: riseChainId,
        active: true,
        paused: false,
      });
    }

    // Withdrawal lanes (RISE → various destinations)
    dstEids.forEach((eid, i) => {
      // Find the chain for this EID
      const destChainId = Object.values(CHAINS).find((c) => c.lzEid === eid)?.chain.id;
      if (!destChainId) return;

      const pauseResult = batchData?.[i * 2];
      const bucketResult = batchData?.[i * 2 + 1];

      const paused = pauseResult?.status === "success" ? (pauseResult.result as boolean) : false;

      const rateLimits: RateLimitData[] = [];
      if (bucketResult?.status === "success" && bucketResult.result) {
        const bucket = bucketResult.result as {
          lastBlock: bigint;
          available: bigint;
          capacity: bigint;
          refillPerBlock: bigint;
          enabled: boolean;
        };
        if (bucket.enabled) {
          rateLimits.push({
            label: "Withdraw router USD limit",
            available: Number(formatUnits(bucket.available, 18)),
            capacity: Number(formatUnits(bucket.capacity, 18)),
            symbol: "USD",
          });
        }
      }

      const poolLimits = poolLimitsByEid.get(eid);
      const outboundPoolLimit = poolLimits?.outbound;
      const inboundPoolLimit = poolLimits?.inbound;

      if (outboundPoolLimit) {
        rateLimits.push({
          label: "RISE MintBurn outbound",
          available: outboundPoolLimit.available,
          capacity: outboundPoolLimit.capacity,
          symbol: outboundPoolLimit.symbol,
        });
      }

      if (inboundPoolLimit) {
        rateLimits.push({
          label: `${Object.values(CHAINS).find((c) => c.lzEid === eid)?.shortLabel ?? "Dest"} LockRelease inbound`,
          available: inboundPoolLimit.available,
          capacity: inboundPoolLimit.capacity,
          symbol: inboundPoolLimit.symbol,
        });
      }

      result.push({
        sourceChainId: riseChainId,
        destChainId,
        active: !paused,
        paused,
        rateLimit: rateLimits[0],
        rateLimits,
      });
    });

    return result;
  }, [depositChainIds, riseChainId, dstEids, batchData, poolLimitsByEid]);

  return {
    lanes,
    isLoading:
      isLanesLoading ||
      isBatchLoading ||
      isConfigLoading ||
      isPoolLimitLoading,
  };
}
