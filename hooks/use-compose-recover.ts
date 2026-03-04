"use client";

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { type Address } from "viem";
import { erc20Abi, riseXComposerAbi, riseGlobalDepositAbi } from "@/lib/abi";
import { TOKENS, getTokenAddress, getGlobalDepositAddress } from "@/config/contracts";
import type { BridgeSession } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Hook: recover tokens from RISExComposer via claimFunds              */
/* ------------------------------------------------------------------ */

export interface UseComposeRecoverParams {
  session: BridgeSession;
  enabled: boolean;
}

export interface UseComposeRecoverReturn {
  composerAddress: Address | undefined;
  composerBalance: bigint | undefined;
  isLoadingBalance: boolean;
  recover: () => void;
  isPending: boolean;
  isConfirming: boolean;
  isSuccess: boolean;
  error: string | null;
  txHash: `0x${string}` | undefined;
  reset: () => void;
}

export function useComposeRecover({ session, enabled }: UseComposeRecoverParams): UseComposeRecoverReturn {
  const destChainId = session.destChainId;
  const sourceChainId = session.sourceChainId;
  const dappId = session.dappId ?? 0;
  const tokenAddress = getTokenAddress(session.tokenKey, destChainId);
  const recipientAddress = session.recipientAddress as Address;
  const globalDepositAddr = getGlobalDepositAddress(sourceChainId);

  // Resolve composer address from on-chain getDapp(dappId) on the source chain
  const { data: dappConfig } = useReadContract({
    address: globalDepositAddr,
    abi: riseGlobalDepositAbi,
    functionName: "getDapp",
    args: [dappId],
    chainId: sourceChainId,
    query: { enabled: enabled && !!globalDepositAddr && dappId > 0 },
  });

  const composerAddress = dappConfig
    ? ((dappConfig as unknown as { composer: string }).composer as Address)
    : undefined;

  // Read token balance on the composer contract (on dest chain)
  const { data: composerBalance, isLoading: isLoadingBalance } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: composerAddress ? [composerAddress] : undefined,
    chainId: destChainId,
    query: { enabled: enabled && !!tokenAddress && !!composerAddress },
  });

  // Write: call claimFunds on the composer
  const {
    writeContract,
    data: txHash,
    isPending,
    error: writeError,
    reset,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: destChainId,
  });

  const recover = () => {
    if (!composerAddress || !tokenAddress || !composerBalance) return;

    writeContract({
      address: composerAddress,
      abi: riseXComposerAbi,
      functionName: "claimFunds",
      args: [tokenAddress],
      chainId: destChainId,
    });
  };

  return {
    composerAddress,
    composerBalance: composerBalance as bigint | undefined,
    isLoadingBalance,
    recover,
    isPending,
    isConfirming,
    isSuccess,
    error: writeError ? (writeError as Error).message : null,
    txHash,
    reset,
  };
}
