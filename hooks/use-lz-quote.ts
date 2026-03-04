"use client";

import { useReadContract } from "wagmi";
import { type Address, formatEther } from "viem";
import { riseGlobalDepositAbi, riseGlobalWithdrawAbi } from "@/lib/abi";
import {
  getGlobalDepositAddress,
  getGlobalWithdrawAddress,
  getTokenAddress,
  type BridgeDirection,
} from "@/config/contracts";
import { CHAINS } from "@/config/chains";

interface UseLzQuoteParams {
  sourceChainId: number;
  destChainId: number;
  tokenKey: string;
  amount: string; // human-readable
  dappId: number;
  address?: Address;
  recipientAddress?: string;
  direction: BridgeDirection;
  /** Pre-built compose msg (from useComposeMsg hook). Pass "0x" for direct bridge. */
  composeMsg?: string;
  enabled?: boolean;
}

interface UseLzQuoteReturn {
  /** LZ native fee in wei */
  nativeFee: bigint | undefined;
  /** LZ native fee formatted as ETH string */
  nativeFeeFormatted: string | undefined;
  /** Protocol fee in token units (wei) */
  protocolFee: bigint | undefined;
  isLoading: boolean;
  isError: boolean;
  /** Debug info for troubleshooting */
  debug: {
    enabled: boolean;
    isDeposit: boolean;
    hasArgs: boolean;
    amountWei: string;
    composeMsg: string;
    contractAddr: string;
    error: string | null;
    status: string;
    fetchStatus: string;
  };
}

/**
 * Fetches LZ native fee quote for self-bridge mode.
 * Calls quote() on GlobalDeposit or GlobalWithdraw.
 */
export function useLzQuote({
  sourceChainId,
  destChainId,
  tokenKey,
  amount,
  dappId,
  address,
  recipientAddress,
  direction,
  composeMsg = "0x",
  enabled = true,
}: UseLzQuoteParams): UseLzQuoteReturn {
  const isDeposit = direction === "deposit";
  const tokenAddress = getTokenAddress(tokenKey, sourceChainId);
  const srcAddress = address;
  const dstAddress = (recipientAddress || address) as Address | undefined;
  const destLzEid = CHAINS[destChainId]?.lzEid;

  const composeMsgHex = composeMsg as `0x${string}`;

  // Parse amount to wei for the quote
  const decimals = tokenKey === "USDC" ? 6 : 18;
  let amountWei: bigint;
  try {
    const parts = amount.split(".");
    const whole = parts[0] || "0";
    const frac = (parts[1] || "").padEnd(decimals, "0").slice(0, decimals);
    amountWei = BigInt(whole + frac);
  } catch {
    amountWei = 0n;
  }

  const globalDepositAddr = getGlobalDepositAddress(sourceChainId);
  const globalWithdrawAddr = getGlobalWithdrawAddress(sourceChainId);

  // Deposit quote: quote(token, amount, dappId, srcAddress, dstAddress, composeMsg)
  const depositQuote = useReadContract({
    address: globalDepositAddr,
    abi: riseGlobalDepositAbi,
    functionName: "quote",
    args: tokenAddress && srcAddress && dstAddress
      ? [tokenAddress, amountWei, dappId, srcAddress, dstAddress, composeMsgHex]
      : undefined,
    chainId: sourceChainId,
    query: {
      enabled: enabled && isDeposit && !!globalDepositAddr && !!tokenAddress && !!srcAddress && !!dstAddress && amountWei > 0n,
      staleTime: 15_000,
      refetchInterval: 15_000,
      retry: 2,
    },
  });

  // Withdraw quote: quote(token, amount, dstEid, srcAddress, dstAddress)
  const withdrawQuote = useReadContract({
    address: globalWithdrawAddr,
    abi: riseGlobalWithdrawAbi,
    functionName: "quote",
    args: tokenAddress && destLzEid && srcAddress && dstAddress
      ? [tokenAddress, amountWei, destLzEid, srcAddress, dstAddress]
      : undefined,
    chainId: sourceChainId,
    query: {
      enabled: enabled && !isDeposit && !!globalWithdrawAddr && !!tokenAddress && !!destLzEid && !!srcAddress && !!dstAddress && amountWei > 0n,
      staleTime: 15_000,
      refetchInterval: 15_000,
      retry: 2,
    },
  });

  const result = isDeposit ? depositQuote : withdrawQuote;
  const data = result.data as [bigint, { nativeFee: bigint; lzTokenFee: bigint }] | undefined;

  const depositEnabled = enabled && isDeposit && !!globalDepositAddr && !!tokenAddress && !!srcAddress && !!dstAddress && amountWei > 0n;
  const withdrawEnabled = enabled && !isDeposit && !!globalWithdrawAddr && !!tokenAddress && !!destLzEid && !!srcAddress && !!dstAddress && amountWei > 0n;
  const effectiveEnabled = isDeposit ? depositEnabled : withdrawEnabled;
  const hasArgs = isDeposit
    ? !!(tokenAddress && srcAddress && dstAddress)
    : !!(tokenAddress && destLzEid && srcAddress && dstAddress);

  return {
    nativeFee: data?.[1]?.nativeFee,
    nativeFeeFormatted: data?.[1]?.nativeFee ? formatEther(data[1].nativeFee) : undefined,
    protocolFee: data?.[0],
    isLoading: result.isLoading,
    isError: result.isError,
    debug: {
      enabled: effectiveEnabled,
      isDeposit,
      hasArgs,
      amountWei: amountWei.toString(),
      composeMsg: composeMsg.slice(0, 20) + (composeMsg.length > 20 ? "..." : ""),
      contractAddr: (isDeposit ? globalDepositAddr : globalWithdrawAddr) ?? "none",
      error: result.error ? (result.error as Error).message?.slice(0, 120) ?? String(result.error) : null,
      status: result.status,
      fetchStatus: result.fetchStatus,
    },
  };
}
