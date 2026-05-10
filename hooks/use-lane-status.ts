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
import { useBridgeConfig } from "@/lib/bridge-config";
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
      staleTime: 30_000,
      refetchInterval: 30_000,
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
      refetchInterval: 30 * 1000,
    },
  });

  const usdcToken = useMemo(
    () => bridgeConfig?.tokens.find((token) =>
      Object.values(token.chains).some((chain) => chain.symbol.toUpperCase().startsWith("USDC"))
    ),
    [bridgeConfig],
  );

  const riseEid = CHAINS[riseChainId]?.lzEid;
  const riseOft = CONTRACTS[riseChainId]?.mintBurnOFT || (riseEid && usdcToken?.chains[String(riseEid)]?.oft);

  const poolLimitReadPlan = useMemo(() => {
    const contracts: PoolLimitContract[] = [];
    const descriptors: PoolLimitDescriptor[] = [];

    if (!riseEid || !riseOft || dstEids.length === 0) return { contracts, descriptors };

    for (const eid of dstEids) {
      const destChainId = Object.values(CHAINS).find((c) => c.lzEid === eid)?.chain.id;
      const destOft = (destChainId ? CONTRACTS[destChainId]?.lockReleaseOFT : undefined) ||
        usdcToken?.chains[String(eid)]?.oft;

      contracts.push({
        address: riseOft as Address,
        abi: oftRateLimitAbi,
        functionName: "getOutboundRateLimitBucket",
        args: [eid] as const,
        chainId: riseChainId,
      });
      descriptors.push({ eid, kind: "outbound" });

      if (destOft && destChainId) {
        contracts.push({
          address: destOft as Address,
          abi: oftRateLimitAbi,
          functionName: "getInboundRateLimitBucket",
          args: [riseEid] as const,
          chainId: destChainId,
        });
        descriptors.push({ eid, kind: "inbound" });
      }
    }

    return { contracts, descriptors };
  }, [dstEids, riseChainId, riseEid, riseOft, usdcToken]);

  const { data: poolLimitData, isLoading: isPoolLimitLoading } = useReadContracts({
    contracts: poolLimitReadPlan.contracts,
    allowFailure: true,
    query: {
      enabled: poolLimitReadPlan.contracts.length > 0,
      refetchInterval: 10_000,
    },
  });

  const poolLimitsByEid = useMemo(() => {
    const limits = new Map<number, Partial<Record<PoolLimitKind, RateLimitBucket>>>();

    poolLimitReadPlan.descriptors.forEach((descriptor, index) => {
      const result = poolLimitData?.[index];
      if (result?.status !== "success") return;

      const bucket = normalizeRateLimitBucket(result.result);
      if (!bucket?.enabled) return;

      const laneLimits = limits.get(descriptor.eid) ?? {};
      laneLimits[descriptor.kind] = bucket;
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
      const outboundPoolBucket = poolLimits?.outbound;
      const inboundPoolBucket = poolLimits?.inbound;
      const tokenDecimals = usdcToken?.decimals ?? 6;

      if (outboundPoolBucket) {
        rateLimits.push({
          label: "RISE MintBurn outbound",
          available: Number(formatUnits(outboundPoolBucket.available, tokenDecimals)),
          capacity: Number(formatUnits(outboundPoolBucket.capacity, tokenDecimals)),
          symbol: "USDC",
        });
      }

      if (inboundPoolBucket) {
        rateLimits.push({
          label: `${Object.values(CHAINS).find((c) => c.lzEid === eid)?.shortLabel ?? "Dest"} LockRelease inbound`,
          available: Number(formatUnits(inboundPoolBucket.available, tokenDecimals)),
          capacity: Number(formatUnits(inboundPoolBucket.capacity, tokenDecimals)),
          symbol: "USDC",
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
  }, [depositChainIds, riseChainId, dstEids, batchData, poolLimitsByEid, usdcToken]);

  return {
    lanes,
    isLoading:
      isLanesLoading ||
      isBatchLoading ||
      isConfigLoading ||
      isPoolLimitLoading,
  };
}
