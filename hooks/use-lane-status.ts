"use client";

import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { type Address, formatUnits } from "viem";
import { riseGlobalWithdrawAbi } from "@/lib/abi";
import {
  getGlobalWithdrawAddress,
  getGlobalDepositAddress,
  getTokenAddress,
} from "@/config/contracts";
import { CHAINS, sepoliaChain, riseTestnetChain } from "@/config/chains";
import type { LaneInfo, RateLimitData } from "@/components/bridge/lane-status";

interface UseLaneStatusReturn {
  lanes: LaneInfo[];
  isLoading: boolean;
}

/**
 * Fetches real on-chain lane status from the GlobalWithdraw contract.
 *
 * Withdrawal lanes: getLanes() returns registered dstEids.
 * For each lane: isLanePaused(eid) + getRateLimitBucket(usdcAddr, eid).
 *
 * Deposit lane: always active if the GlobalDeposit contract exists.
 */
export function useLaneStatus(): UseLaneStatusReturn {
  const riseChainId = riseTestnetChain.id;
  const sepoliaChainId = sepoliaChain.id;
  const globalWithdrawAddr = getGlobalWithdrawAddress(riseChainId);
  const globalDepositAddr = getGlobalDepositAddress(sepoliaChainId);
  const usdcOnRise = getTokenAddress("USDC", riseChainId);

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

  // --- Batch: isLanePaused + getRateLimitBucket for each lane ---
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
        functionName: "getRateLimitBucket" as const,
        args: [usdcOnRise!, eid] as const,
        chainId: riseChainId,
      },
    ]);
  }, [globalWithdrawAddr, dstEids, usdcOnRise, riseChainId]);

  const { data: batchData, isLoading: isBatchLoading } = useReadContracts({
    contracts: batchContracts,
    query: {
      enabled: batchContracts.length > 0,
      refetchInterval: 30 * 1000,
    },
  });

  // --- Build lane infos ---
  const lanes = useMemo<LaneInfo[]>(() => {
    const result: LaneInfo[] = [];

    // Deposit lane (Sepolia → RISE): always active if contract exists
    if (globalDepositAddr) {
      result.push({
        sourceChainId: sepoliaChainId,
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

      let rateLimit: RateLimitData | undefined;
      if (bucketResult?.status === "success" && bucketResult.result) {
        const bucket = bucketResult.result as {
          lastBlock: bigint;
          available: bigint;
          capacity: bigint;
          refillPerBlock: bigint;
        };
        rateLimit = {
          available: Number(formatUnits(bucket.available, 6)),
          capacity: Number(formatUnits(bucket.capacity, 6)),
          symbol: "USDC",
        };
      }

      result.push({
        sourceChainId: riseChainId,
        destChainId,
        active: !paused,
        paused,
        rateLimit,
      });
    });

    return result;
  }, [globalDepositAddr, sepoliaChainId, riseChainId, dstEids, batchData]);

  return {
    lanes,
    isLoading: isLanesLoading || isBatchLoading,
  };
}
