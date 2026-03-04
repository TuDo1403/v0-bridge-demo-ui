"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useSignTypedData,
  useWaitForTransactionReceipt,
} from "wagmi";
import { type Address, maxUint256 } from "viem";
import { erc20Abi } from "@/lib/abi";
import { PERMIT2_ADDRESS, getTokenAddress } from "@/config/contracts";
import { CHAINS } from "@/config/chains";

/* ------------------------------------------------------------------ */
/*  Permit2 EIP-712 type definitions                                   */
/* ------------------------------------------------------------------ */

const PERMIT_WITNESS_TRANSFER_FROM_TYPES = {
  TokenPermissions: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
  ],
} as const;

const DEPOSIT_WITNESS_TYPES = {
  ...PERMIT_WITNESS_TRANSFER_FROM_TYPES,
  PermitWitnessTransferFrom: [
    { name: "permitted", type: "TokenPermissions" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "witness", type: "DepositWitness" },
  ],
  DepositWitness: [
    { name: "dappId", type: "uint16" },
    { name: "dstAddress", type: "address" },
    { name: "srcAddress", type: "address" },
  ],
} as const;

const WITHDRAWAL_WITNESS_TYPES = {
  ...PERMIT_WITNESS_TRANSFER_FROM_TYPES,
  PermitWitnessTransferFrom: [
    { name: "permitted", type: "TokenPermissions" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "witness", type: "WithdrawalWitness" },
  ],
  WithdrawalWitness: [
    { name: "dstEid", type: "uint32" },
    { name: "dstAddress", type: "address" },
    { name: "srcAddress", type: "address" },
  ],
} as const;

/* ------------------------------------------------------------------ */
/*  Hook interface                                                     */
/* ------------------------------------------------------------------ */

interface UsePermit2Params {
  sourceChainId: number;
  destChainId: number;
  tokenKey: string;
  direction: "deposit" | "withdraw";
  /** Bridge amount in wei — used to check if allowance is sufficient */
  amount?: bigint;
  enabled?: boolean;
}

interface PermitData {
  permitType: 1; // Permit2
  deadline: bigint;
  nonce: bigint;
  signature: `0x${string}`;
}

interface UsePermit2Return {
  /** Whether user needs to do one-time USDC → Permit2 approval */
  needsApproval: boolean;
  /** Current allowance to Permit2 */
  allowance: bigint | undefined;
  isCheckingAllowance: boolean;
  /** Send the one-time approval tx */
  approve: () => void;
  approveHash: `0x${string}` | undefined;
  isApproving: boolean;
  isApprovalConfirming: boolean;
  isApprovalConfirmed: boolean;
  /** Error from the approval transaction (user rejection, wrong chain, etc.) */
  approvalError: Error | null;
  /** Reset approval error state so the user can retry */
  resetApproval: () => void;
  /** Sign a Permit2 witness transfer */
  signPermit: (params: {
    amount: bigint;
    spender: Address;
    srcAddress: Address;
    dstAddress: Address;
    /** dappId for deposits, dstEid for withdrawals */
    routeParam: number;
  }) => Promise<PermitData>;
  isSigning: boolean;
}

/**
 * Manages Permit2 approval state and EIP-712 signing for deposits/withdrawals.
 */
export function usePermit2({
  sourceChainId,
  destChainId,
  tokenKey,
  direction,
  amount = 0n,
  enabled = true,
}: UsePermit2Params): UsePermit2Return {
  const { address } = useAccount();
  const tokenAddress = getTokenAddress(tokenKey, sourceChainId);

  // --- Check USDC allowance to Permit2 ---
  const { data: allowance, isLoading: isCheckingAllowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, PERMIT2_ADDRESS] : undefined,
    chainId: sourceChainId,
    query: {
      enabled: enabled && !!address && !!tokenAddress,
      staleTime: 15_000,
      refetchInterval: 15_000,
    },
  });

  // Need approval if allowance is unknown (still loading) or insufficient
  const needsApproval = allowance === undefined || (amount > 0n ? allowance < amount : allowance === 0n);

  // --- One-time approval ---
  const {
    writeContract: writeApprove,
    data: approveHash,
    isPending: isApproving,
    error: approvalError,
    reset: resetApproval,
  } = useWriteContract();

  const { isLoading: isApprovalConfirming, isSuccess: isApprovalConfirmed } =
    useWaitForTransactionReceipt({
      hash: approveHash,
      chainId: sourceChainId,
    });

  // Refetch allowance after approval confirms so needsApproval updates immediately
  useEffect(() => {
    if (isApprovalConfirmed) {
      refetchAllowance();
    }
  }, [isApprovalConfirmed, refetchAllowance]);

  const approve = useCallback(() => {
    if (!tokenAddress) return;
    writeApprove({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "approve",
      args: [PERMIT2_ADDRESS, maxUint256],
      chainId: sourceChainId,
    });
  }, [tokenAddress, sourceChainId, writeApprove]);

  // --- EIP-712 signing ---
  const { signTypedDataAsync, isPending: isSigning } = useSignTypedData();

  const signPermit = useCallback(
    async (params: {
      amount: bigint;
      spender: Address;
      srcAddress: Address;
      dstAddress: Address;
      routeParam: number;
    }): Promise<PermitData> => {
      if (!tokenAddress) throw new Error("Token address not found");

      // Generate a random nonce (Permit2 uses unordered nonces)
      const randomBytes = new Uint8Array(32);
      crypto.getRandomValues(randomBytes);
      const nonce = BigInt(
        "0x" + Array.from(randomBytes).map((b) => b.toString(16).padStart(2, "0")).join("")
      ) >> 8n; // Use 248 bits to stay within Permit2's nonce space

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour

      const domain = {
        name: "Permit2",
        chainId: sourceChainId,
        verifyingContract: PERMIT2_ADDRESS as Address,
      };

      const isDeposit = direction === "deposit";

      const message = isDeposit
        ? {
            permitted: { token: tokenAddress, amount: params.amount },
            spender: params.spender,
            nonce,
            deadline,
            witness: {
              dappId: params.routeParam, // uint16
              dstAddress: params.dstAddress,
              srcAddress: params.srcAddress,
            },
          }
        : {
            permitted: { token: tokenAddress, amount: params.amount },
            spender: params.spender,
            nonce,
            deadline,
            witness: {
              dstEid: params.routeParam, // uint32
              dstAddress: params.dstAddress,
              srcAddress: params.srcAddress,
            },
          };

      const signature = await signTypedDataAsync({
        domain,
        types: isDeposit ? DEPOSIT_WITNESS_TYPES : WITHDRAWAL_WITNESS_TYPES,
        primaryType: "PermitWitnessTransferFrom",
        message,
      });

      return {
        permitType: 1, // Permit2
        deadline,
        nonce,
        signature: signature as `0x${string}`,
      };
    },
    [tokenAddress, sourceChainId, direction, signTypedDataAsync]
  );

  return {
    needsApproval,
    allowance,
    isCheckingAllowance,
    approve,
    approveHash,
    isApproving,
    isApprovalConfirming,
    isApprovalConfirmed,
    approvalError,
    resetApproval,
    signPermit,
    isSigning,
  };
}
