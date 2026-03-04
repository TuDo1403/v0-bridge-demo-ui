"use client";

import { useMemo } from "react";
import { useReadContract } from "wagmi";
import { type Address, parseUnits } from "viem";
import { riseGlobalDepositAbi } from "@/lib/abi";
import {
  TOKENS,
  getTokenAddress,
  getGlobalDepositAddress,
  type BridgeDirection,
} from "@/config/contracts";

interface UseComposeMsgParams {
  sourceChainId: number;
  destChainId: number;
  tokenKey: string;
  amount: string;
  dappId: number;
  address?: Address;
  recipientAddress?: string;
  direction: BridgeDirection;
  feeBps: bigint;
  dustRate: bigint;
  feeMode: number;   // 0 = Percentage, 1 = Flat (from on-chain getTokenFeeConfig)
  flatFee: bigint;   // flat fee in token decimals (from on-chain getTokenFeeConfig)
}

interface UseComposeMsgReturn {
  /** On-chain compose msg from buildComposeMsg() — authoritative */
  onChainComposeMsg: string | undefined;
  /** Whether on-chain call is still loading */
  isLoading: boolean;
  /** The compose msg to use (on-chain if available, else "0x") */
  composeMsg: string;
}

/**
 * Fetches the authoritative compose msg from on-chain
 * `buildComposeMsg(dappId, dstAddress, srcToken, bridgeAmount)`.
 *
 * Only relevant for deposits with dappId > 0.
 * For dappId=0 or withdrawals, returns "0x".
 */
export function useComposeMsg({
  sourceChainId,
  tokenKey,
  amount,
  dappId,
  address,
  recipientAddress,
  direction,
  feeBps,
  dustRate,
  feeMode,
  flatFee,
}: UseComposeMsgParams): UseComposeMsgReturn {
  const isDeposit = direction === "deposit";
  const needsCompose = isDeposit && dappId > 0;
  const token = TOKENS[tokenKey];
  const tokenAddress = getTokenAddress(tokenKey, sourceChainId);
  const globalDepositAddr = getGlobalDepositAddress(sourceChainId);
  const dstAddress = (recipientAddress || address) as Address | undefined;

  // --- Derive bridgeAmount from on-chain fee config (no separate utility function) ---
  const bridgeAmount = useMemo(() => {
    if (!needsCompose || !token || !amount || parseFloat(amount) <= 0) return 0n;
    const gross = parseUnits(amount, token.decimals);
    const fee = feeMode === 1 ? flatFee : (gross * feeBps) / 10000n;
    if (fee >= gross) return 0n;
    const afterFee = gross - fee;
    return (afterFee / dustRate) * dustRate;
  }, [needsCompose, token, amount, feeBps, dustRate, feeMode, flatFee]);

  // --- On-chain: buildComposeMsg(dappId, dstAddress, srcToken, bridgeAmount) ---
  const { data: onChainResult, isLoading } = useReadContract({
    address: globalDepositAddr,
    abi: riseGlobalDepositAbi,
    functionName: "buildComposeMsg",
    args: dstAddress && tokenAddress
      ? [dappId, dstAddress, tokenAddress, bridgeAmount]
      : undefined,
    chainId: sourceChainId,
    query: {
      enabled: needsCompose && !!globalDepositAddr && !!dstAddress && !!tokenAddress && bridgeAmount > 0n,
      staleTime: 30_000,
      refetchInterval: 30_000,
      retry: 2,
    },
  });

  const onChainComposeMsg = onChainResult
    ? (onChainResult as string)
    : undefined;

  // Use on-chain as authoritative; "0x" as default
  const composeMsg = needsCompose ? (onChainComposeMsg ?? "0x") : "0x";

  return {
    onChainComposeMsg,
    isLoading,
    composeMsg,
  };
}
