"use client";

import {
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
  useBalance,
  useBytecode,
} from "wagmi";
import { type Address, isAddress } from "viem";
import { erc20Abi, riseGlobalDepositAbi, riseGlobalWithdrawAbi, riseVaultAbi } from "@/lib/abi";
import {
  type BridgeDirection,
  TOKENS,
  getGlobalDepositAddress,
  getGlobalWithdrawAddress,
} from "@/config/contracts";

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
    dstEid: dstEid as number | undefined,
    factory: factory as Address | undefined,
    isLoading: loadingSrc || loadingDst,
    isValid: !!srcAddress && srcAddress !== "0x0000000000000000000000000000000000000000",
  };
}

/* ------------------------------------------------------------------ */
/*  Hook: detect whether a vault address has deployed code              */
/* ------------------------------------------------------------------ */

export function useVaultHasCode(vaultAddress: Address | undefined, chainId: number | undefined) {
  const { data, isLoading } = useBytecode({
    address: vaultAddress,
    chainId,
    query: { enabled: !!vaultAddress && !!chainId },
  });
  // useBytecode returns null when no code at the address, undefined while
  // loading, and a hex bytecode string when the address has code.
  const hasCode = !!data && data !== "0x" && data.length > 2;
  return { hasCode, isLoading };
}

/* ------------------------------------------------------------------ */
/*  Hook: read symbol/decimals + balanceOf(vault) for an arbitrary     */
/*  ERC-20 token address                                                */
/* ------------------------------------------------------------------ */

export function useTokenInfo(
  token: Address | undefined,
  vaultAddress: Address | undefined,
  chainId: number | undefined,
) {
  const valid = !!token && isAddress(token) && !!chainId;
  const enabled = valid;

  const { data: symbol, isLoading: loadingSymbol } = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "symbol",
    chainId,
    query: { enabled },
  });

  const { data: decimals, isLoading: loadingDecimals } = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "decimals",
    chainId,
    query: { enabled },
  });

  const {
    data: balance,
    isLoading: loadingBalance,
    isError: balanceError,
    refetch,
  } = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: vaultAddress ? [vaultAddress] : undefined,
    chainId,
    query: { enabled: enabled && !!vaultAddress },
  });

  // Validity hinges on `balanceOf` — symbol/decimals are best-effort because
  // some legacy tokens (e.g. MKR) implement `symbol()` as bytes32 and fail to
  // decode against the standard string ABI. Recovery still works if we can
  // read the balance, so we don't block on those reads.
  const isValidToken = enabled && !balanceError && balance !== undefined;

  return {
    symbol: symbol as string | undefined,
    decimals: decimals !== undefined ? Number(decimals) : undefined,
    balance: balance as bigint | undefined,
    isLoading: loadingSymbol || loadingDecimals || loadingBalance,
    isValidToken,
    refetch,
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
  const enabled = !!vaultAddress && !!account && !!chainId;
  const { data: isOwner, isLoading } = useReadContract({
    address: vaultAddress,
    abi: riseVaultAbi,
    functionName: "isOwner",
    args: account ? [account] : undefined,
    chainId,
    query: { enabled },
  });
  return {
    isOwner: isOwner as boolean | undefined,
    isLoading: enabled && isLoading,
  };
}

/* ------------------------------------------------------------------ */
/*  Hook: fetch balances of all known tokens on the vault               */
/* ------------------------------------------------------------------ */

export function useVaultTokenBalances(
  vaultAddress: Address | undefined,
  chainId: number | undefined,
  options?: { skipKnownTokens?: boolean },
) {
  const skipKnownTokens = options?.skipKnownTokens ?? false;

  // Build multicall for all known tokens on this chain. Skip when the caller
  // explicitly opts out (e.g. undeployed vault — every balanceOf is wasted RPC)
  // or when we don't have a vault address yet (avoid building contracts with an
  // undefined argument that wagmi would still try to query-key on).
  const tokenEntries =
    !skipKnownTokens && vaultAddress && chainId
      ? Object.entries(TOKENS)
          .filter(([, meta]) => meta.addresses[chainId])
          .map(([key, meta]) => ({
            key,
            meta,
            address: meta.addresses[chainId] as Address,
          }))
      : [];

  const contracts = vaultAddress
    ? tokenEntries.map((t) => ({
        address: t.address,
        abi: erc20Abi,
        functionName: "balanceOf" as const,
        args: [vaultAddress] as const,
        chainId,
      }))
    : [];

  const { data, isLoading } = useReadContracts({
    contracts: contracts.length > 0 ? contracts : undefined,
    query: { enabled: contracts.length > 0 },
  });

  // Native ETH balance — always read, including for undeployed vaults so the
  // factory `rescueETH` path can sweep funds sent to the deterministic address.
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

/* ------------------------------------------------------------------ */
/*  Hook: factory-based rescue (works whether vault is deployed or     */
/*  not — factory deploys the clone first, then rescues to srcAddress) */
/* ------------------------------------------------------------------ */

export interface UseFactoryRescueParams {
  direction: BridgeDirection;
  chainId: number | undefined;
  srcAddress: Address | undefined;
  dstAddress: Address | undefined;
  /** Required for deposits (factory keys by dappId). */
  dappId?: number;
  /** Required for withdrawals (factory keys by dstEid). */
  dstEid?: number;
}

export interface UseFactoryRescueReturn {
  factoryAddress: Address | undefined;
  recoverToken: (token: Address) => void;
  recoverETH: () => void;
  isPending: boolean;
  isConfirming: boolean;
  isSuccess: boolean;
  error: string | null;
  txHash: `0x${string}` | undefined;
  reset: () => void;
}

export function useFactoryRescue({
  direction,
  chainId,
  srcAddress,
  dstAddress,
  dappId,
  dstEid,
}: UseFactoryRescueParams): UseFactoryRescueReturn {
  const factoryAddress = chainId
    ? direction === "deposit"
      ? getGlobalDepositAddress(chainId)
      : getGlobalWithdrawAddress(chainId)
    : undefined;

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

  const recoverToken = (token: Address) => {
    if (!factoryAddress || !srcAddress || !dstAddress) return;
    if (direction === "deposit") {
      if (dappId === undefined) return;
      writeContract({
        address: factoryAddress,
        abi: riseGlobalDepositAbi,
        functionName: "rescueFunds",
        args: [srcAddress, dstAddress, dappId, token],
        chainId,
      });
    } else {
      if (dstEid === undefined) return;
      writeContract({
        address: factoryAddress,
        abi: riseGlobalWithdrawAbi,
        functionName: "rescueFunds",
        args: [srcAddress, dstAddress, dstEid, token],
        chainId,
      });
    }
  };

  const recoverETH = () => {
    if (!factoryAddress || !srcAddress || !dstAddress) return;
    if (direction === "deposit") {
      if (dappId === undefined) return;
      writeContract({
        address: factoryAddress,
        abi: riseGlobalDepositAbi,
        functionName: "rescueETH",
        args: [srcAddress, dstAddress, dappId],
        chainId,
      });
    } else {
      if (dstEid === undefined) return;
      writeContract({
        address: factoryAddress,
        abi: riseGlobalWithdrawAbi,
        functionName: "rescueETH",
        args: [srcAddress, dstAddress, dstEid],
        chainId,
      });
    }
  };

  return {
    factoryAddress,
    recoverToken,
    recoverETH,
    isPending,
    isConfirming,
    isSuccess,
    error: writeError ? (writeError as Error).message : null,
    txHash,
    reset,
  };
}
