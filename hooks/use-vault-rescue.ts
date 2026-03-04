"use client";

import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt, useBalance } from "wagmi";
import { type Address } from "viem";
import { erc20Abi, riseVaultAbi } from "@/lib/abi";
import { TOKENS } from "@/config/contracts";

/* ------------------------------------------------------------------ */
/*  Token balance entry                                                 */
/* ------------------------------------------------------------------ */

export interface VaultTokenBalance {
  tokenKey: string;
  symbol: string;
  decimals: number;
  address: Address;
  balance: bigint;
}

/* ------------------------------------------------------------------ */
/*  Hook: read vault metadata from the vault contract itself            */
/* ------------------------------------------------------------------ */

export function useVaultInfo(vaultAddress: Address | undefined, chainId: number | undefined) {
  const enabled = !!vaultAddress && !!chainId;

  const { data: srcAddress, isLoading: loadingSrc } = useReadContract({
    address: vaultAddress,
    abi: riseVaultAbi,
    functionName: "getSrcAddress",
    chainId,
    query: { enabled },
  });

  const { data: dstAddress, isLoading: loadingDst } = useReadContract({
    address: vaultAddress,
    abi: riseVaultAbi,
    functionName: "getDstAddress",
    chainId,
    query: { enabled },
  });

  const { data: dappId } = useReadContract({
    address: vaultAddress,
    abi: riseVaultAbi,
    functionName: "getDappId",
    chainId,
    query: { enabled },
  });

  const { data: srcEid } = useReadContract({
    address: vaultAddress,
    abi: riseVaultAbi,
    functionName: "getSrcEid",
    chainId,
    query: { enabled },
  });

  const { data: dstEid } = useReadContract({
    address: vaultAddress,
    abi: riseVaultAbi,
    functionName: "getDstEid",
    chainId,
    query: { enabled },
  });

  const { data: factory } = useReadContract({
    address: vaultAddress,
    abi: riseVaultAbi,
    functionName: "getFactory",
    chainId,
    query: { enabled },
  });

  return {
    srcAddress: srcAddress as Address | undefined,
    dstAddress: dstAddress as Address | undefined,
    dappId: dappId as number | undefined,
    srcEid: srcEid as number | undefined,
    dstEid: dstEid as number | undefined,
    factory: factory as Address | undefined,
    isLoading: loadingSrc || loadingDst,
    isValid: !!srcAddress && srcAddress !== "0x0000000000000000000000000000000000000000",
  };
}

/* ------------------------------------------------------------------ */
/*  Hook: check if connected wallet owns the vault                      */
/* ------------------------------------------------------------------ */

export function useVaultOwnership(
  vaultAddress: Address | undefined,
  account: Address | undefined,
  chainId: number | undefined,
) {
  const { data: isOwner } = useReadContract({
    address: vaultAddress,
    abi: riseVaultAbi,
    functionName: "isOwner",
    args: account ? [account] : undefined,
    chainId,
    query: { enabled: !!vaultAddress && !!account && !!chainId },
  });
  return isOwner as boolean | undefined;
}

/* ------------------------------------------------------------------ */
/*  Hook: fetch balances of all known tokens on the vault               */
/* ------------------------------------------------------------------ */

export function useVaultTokenBalances(
  vaultAddress: Address | undefined,
  chainId: number | undefined,
) {
  // Build multicall for all known tokens on this chain
  const tokenEntries = Object.entries(TOKENS)
    .filter(([, meta]) => meta.addresses[chainId ?? 0])
    .map(([key, meta]) => ({
      key,
      meta,
      address: meta.addresses[chainId ?? 0] as Address,
    }));

  const contracts = tokenEntries.map((t) => ({
    address: t.address,
    abi: erc20Abi,
    functionName: "balanceOf" as const,
    args: [vaultAddress!] as const,
    chainId,
  }));

  const { data, isLoading } = useReadContracts({
    contracts: contracts.length > 0 ? contracts : undefined,
    query: { enabled: !!vaultAddress && !!chainId && contracts.length > 0 },
  });

  // Native ETH balance
  const { data: ethBalance, isLoading: ethLoading } = useBalance({
    address: vaultAddress,
    chainId,
    query: { enabled: !!vaultAddress && !!chainId },
  });

  const balances: VaultTokenBalance[] = tokenEntries
    .map((t, i) => {
      const result = data?.[i];
      const balance = result?.status === "success" ? (result.result as bigint) : 0n;
      return {
        tokenKey: t.key,
        symbol: t.meta.symbol,
        decimals: t.meta.decimals,
        address: t.address,
        balance,
      };
    })
    .filter((b) => b.balance > 0n);

  return {
    balances,
    ethBalance: ethBalance?.value ?? 0n,
    isLoading: isLoading || ethLoading,
  };
}

/* ------------------------------------------------------------------ */
/*  Hook: recover ERC20 from vault directly                             */
/* ------------------------------------------------------------------ */

export interface UseVaultRecoverParams {
  vaultAddress: Address | undefined;
  chainId: number | undefined;
}

export interface UseVaultRecoverReturn {
  recover: (token: Address, to: Address, amount: bigint) => void;
  recoverETH: (to: Address, amount: bigint) => void;
  isPending: boolean;
  isConfirming: boolean;
  isSuccess: boolean;
  error: string | null;
  txHash: `0x${string}` | undefined;
  reset: () => void;
}

export function useVaultRecover({ vaultAddress, chainId }: UseVaultRecoverParams): UseVaultRecoverReturn {
  const {
    writeContract,
    data: txHash,
    isPending,
    error: writeError,
    reset,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId,
  });

  const recover = (token: Address, to: Address, amount: bigint) => {
    if (!vaultAddress) return;
    writeContract({
      address: vaultAddress,
      abi: riseVaultAbi,
      functionName: "rescueERC20",
      args: [token, to, amount],
      chainId,
    });
  };

  const recoverETH = (to: Address, amount: bigint) => {
    if (!vaultAddress) return;
    writeContract({
      address: vaultAddress,
      abi: riseVaultAbi,
      functionName: "rescueETH",
      args: [to, amount],
      chainId,
    });
  };

  return {
    recover,
    recoverETH,
    isPending,
    isConfirming,
    isSuccess,
    error: writeError ? (writeError as Error).message : null,
    txHash,
    reset,
  };
}
