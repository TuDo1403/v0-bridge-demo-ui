"use client";

import { useBlockNumber, useTransactionReceipt } from "wagmi";
import { REQUIRED_CONFIRMATIONS, BLOCK_TIME_SECONDS } from "@/config/chains";

interface BlockConfirmations {
  /** Current confirmations achieved */
  current: number;
  /** Total confirmations required */
  required: number;
  /** Progress 0-1 (clamped) */
  progress: number;
  /** Estimated seconds remaining */
  etaSeconds: number | null;
  /** Whether we have valid data */
  isLoading: boolean;
}

/**
 * Tracks block confirmations for a bridge tx on the source chain.
 * Returns progress towards the required ULN302 confirmation threshold.
 */
export function useBlockConfirmations(
  sourceChainId: number | undefined,
  txHash: string | undefined
): BlockConfirmations {
  const required = sourceChainId ? (REQUIRED_CONFIRMATIONS[sourceChainId] ?? 0) : 0;
  const blockTimeSec = sourceChainId ? (BLOCK_TIME_SECONDS[sourceChainId] ?? 1) : 1;

  const { data: receipt } = useTransactionReceipt({
    hash: txHash as `0x${string}` | undefined,
    chainId: sourceChainId,
    query: {
      enabled: !!txHash && !!sourceChainId && required > 0,
    },
  });

  const { data: currentBlock } = useBlockNumber({
    chainId: sourceChainId,
    watch: true,
    query: {
      enabled: !!receipt?.blockNumber && required > 0,
      refetchInterval: blockTimeSec < 5 ? 2_000 : 6_000,
    },
  });

  if (!receipt?.blockNumber || !currentBlock || required === 0) {
    return { current: 0, required, progress: 0, etaSeconds: null, isLoading: !receipt };
  }

  const txBlock = receipt.blockNumber;
  const current = Number(currentBlock - txBlock);
  const clamped = Math.min(Math.max(current, 0), required);
  const progress = clamped / required;
  const remaining = required - clamped;
  const etaSeconds = remaining > 0 ? remaining * blockTimeSec : 0;

  return { current: clamped, required, progress, etaSeconds, isLoading: false };
}
