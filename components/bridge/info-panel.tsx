"use client";

import { useAccount, useReadContract } from "wagmi";
import { riseGlobalDepositAbi, riseGlobalWithdrawAbi, erc20Abi } from "@/lib/abi";
import { useBridgeStore } from "@/lib/bridge-store";
import { CONTRACTS, getTokenAddress, getGlobalDepositAddress, getGlobalWithdrawAddress, TOKENS } from "@/config/contracts";
import { CHAINS } from "@/config/chains";
import { formatUnits, type Address } from "viem";
import { Loader2, AlertCircle, RefreshCcw } from "lucide-react";
import { ChainIcon } from "./chain-icon";
import { cn } from "@/lib/utils";

function DataRow({
  label,
  value,
  mono = true,
  isLoading = false,
  isError = false,
  onRetry,
  highlight = false,
  iconKey,
  href,
}: {
  label: string;
  value: string;
  mono?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  highlight?: boolean;
  iconKey?: string;
  href?: string;
}) {
  const valueClasses = cn(
    "text-xs truncate flex items-center gap-1.5",
    mono ? "font-mono" : "font-sans",
    highlight ? "text-primary" : "text-foreground",
    href && "underline decoration-muted-foreground/40 underline-offset-2 hover:text-primary hover:decoration-primary transition-colors cursor-pointer"
  );

  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground shrink-0">
        {label}
      </span>
      {isLoading ? (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      ) : isError ? (
        <button
          onClick={onRetry}
          className="flex items-center gap-1 text-[10px] font-mono text-destructive-foreground hover:text-foreground transition-colors"
        >
          <AlertCircle className="h-3 w-3" />
          retry
          <RefreshCcw className="h-2.5 w-2.5" />
        </button>
      ) : href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={valueClasses}
        >
          {iconKey && <ChainIcon chainKey={iconKey} className="h-3.5 w-3.5 shrink-0" />}
          {value}
        </a>
      ) : (
        <span className={valueClasses}>
          {iconKey && <ChainIcon chainKey={iconKey} className="h-3.5 w-3.5 shrink-0" />}
          {value}
        </span>
      )}
    </div>
  );
}

export function InfoPanel() {
  const { address, isConnected } = useAccount();
  const { sourceChainId, destChainId, tokenKey, depositAddress, direction } =
    useBridgeStore();

  const isDeposit = direction === "deposit";
  const globalDepositAddr = getGlobalDepositAddress(sourceChainId);
  const globalWithdrawAddr = getGlobalWithdrawAddress(sourceChainId);
  const routerAddr = isDeposit ? globalDepositAddr : globalWithdrawAddr;
  const tokenAddress = getTokenAddress(tokenKey, sourceChainId);
  const token = TOKENS[tokenKey];
  const sourceChain = CHAINS[sourceChainId];
  const destChain = CHAINS[destChainId];

  // Fee config - reads from on-chain contract
  const {
    data: feeConfig,
    isLoading: isFeeLoading,
    isError: isFeeError,
    refetch: refetchFee,
  } = useReadContract({
    address: routerAddr,
    abi: isDeposit ? riseGlobalDepositAbi : riseGlobalWithdrawAbi,
    functionName: "getFeeConfig",
    chainId: sourceChainId,
    query: { enabled: !!routerAddr, refetchInterval: 30_000, retry: 3, retryDelay: 2000 },
  });

  // Destination EID - deposit: getDstEid() returns uint32, withdraw: getLanes() returns uint32[]
  const {
    data: depositDstEid,
    isLoading: isDepositDstEidLoading,
    isError: isDepositDstEidError,
    refetch: refetchDepositDstEid,
  } = useReadContract({
    address: globalDepositAddr,
    abi: riseGlobalDepositAbi,
    functionName: "getDstEid",
    chainId: sourceChainId,
    query: { enabled: isDeposit && !!globalDepositAddr, refetchInterval: 60_000, retry: 3, retryDelay: 2000 },
  });

  const {
    data: withdrawLanes,
    isLoading: isWithdrawLanesLoading,
    isError: isWithdrawLanesError,
    refetch: refetchWithdrawLanes,
  } = useReadContract({
    address: globalWithdrawAddr,
    abi: riseGlobalWithdrawAbi,
    functionName: "getLanes",
    chainId: sourceChainId,
    query: { enabled: !isDeposit && !!globalWithdrawAddr, refetchInterval: 60_000, retry: 3, retryDelay: 2000 },
  });

  const dstEidDisplay = isDeposit
    ? (depositDstEid !== undefined && depositDstEid !== null ? String(depositDstEid) : "--")
    : (withdrawLanes && (withdrawLanes as number[]).length > 0 ? (withdrawLanes as number[]).join(", ") : "--");
  const isDstEidLoading = isDeposit ? isDepositDstEidLoading : isWithdrawLanesLoading;
  const isDstEidError = isDeposit ? isDepositDstEidError : isWithdrawLanesError;
  const refetchDstEid = isDeposit ? refetchDepositDstEid : refetchWithdrawLanes;

  // User wallet balance
  const {
    data: walletBalance,
    isLoading: isWalletBalLoading,
    isError: isWalletBalError,
    refetch: refetchWalletBal,
  } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: sourceChainId,
    query: {
      enabled: !!address && !!tokenAddress,
      refetchInterval: 8_000,
      retry: 3,
      retryDelay: 2000,
    },
  });

  // Deposit address balance
  const {
    data: depositBal,
    isLoading: isDepBalLoading,
    isError: isDepBalError,
    refetch: refetchDepBal,
  } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: depositAddress ? [depositAddress as Address] : undefined,
    chainId: sourceChainId,
    query: {
      enabled: !!depositAddress && !!tokenAddress,
      refetchInterval: 8_000,
      retry: 3,
      retryDelay: 2000,
    },
  });

  // Per-token fee config (mode + flatFee)
  const {
    data: tokenFeeConfig,
    isLoading: isTokenFeeLoading,
    isError: isTokenFeeError,
    refetch: refetchTokenFee,
  } = useReadContract({
    address: routerAddr,
    abi: isDeposit ? riseGlobalDepositAbi : riseGlobalWithdrawAbi,
    functionName: "getTokenFeeConfig",
    args: tokenAddress ? [tokenAddress] : undefined,
    chainId: sourceChainId,
    query: { enabled: !!routerAddr && !!tokenAddress, refetchInterval: 30_000, retry: 3, retryDelay: 2000 },
  });

  const tokenFeeMode = tokenFeeConfig ? Number((tokenFeeConfig as [number, bigint])[0]) : null;
  const tokenFlatFee = tokenFeeConfig ? BigInt((tokenFeeConfig as [number, bigint])[1]) : null;

  // Format fee: feeConfig returns [feeBps, feeCollector]
  const feeBps =
    feeConfig !== undefined && feeConfig !== null
      ? (Number((feeConfig as readonly [number, string])[0]) / 100).toFixed(2)
      : null;

  // Combined fee label: flat mode shows absolute amount, percentage mode shows %
  const feeDisplay = (() => {
    if (tokenFeeMode === 1 && tokenFlatFee !== null && token) {
      const flatAmount = Number(tokenFlatFee) / (10 ** token.decimals);
      return `Flat ${flatAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${token.symbol}`;
    }
    if (feeBps !== null) return `${feeBps}%`;
    return null;
  })();
  const isFeeDisplayLoading = isFeeLoading || isTokenFeeLoading;
  const isFeeDisplayError = isFeeError || isTokenFeeError;

  // Format balances: handle 0n properly (0n is falsy!)
  const walletBal =
    walletBalance !== undefined && walletBalance !== null && token
      ? Number(formatUnits(walletBalance as bigint, token.decimals)).toLocaleString(
          undefined,
          { minimumFractionDigits: 2, maximumFractionDigits: 6 }
        )
      : null;

  const depBal =
    depositBal !== undefined && depositBal !== null && token
      ? Number(formatUnits(depositBal as bigint, token.decimals)).toLocaleString(
          undefined,
          { minimumFractionDigits: 2, maximumFractionDigits: 6 }
        )
      : null;

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        {isDeposit ? "Deposit" : "Withdrawal"} Info
      </span>

      <div className="flex flex-col divide-y divide-border">
        <DataRow label="Source" value={sourceChain?.label ?? "--"} mono={false} iconKey={sourceChain?.iconKey} />
        <DataRow label="Dest" value={destChain?.label ?? "--"} mono={false} iconKey={destChain?.iconKey} />
        <DataRow
          label="Dst EID"
          value={dstEidDisplay}
          isLoading={isDstEidLoading}
          isError={isDstEidError}
          onRetry={() => refetchDstEid()}
          highlight
        />
        <DataRow
          label="Src EID"
          value={String(sourceChain?.lzEid ?? "--")}
          highlight
        />
        <DataRow
          label="Fee"
          value={feeDisplay ?? "--"}
          isLoading={isFeeDisplayLoading}
          isError={isFeeDisplayError}
          onRetry={() => { refetchFee(); refetchTokenFee(); }}
        />
        <DataRow label="Token" value={token?.symbol ?? "--"} />
        <DataRow
          label="Wallet Bal"
          value={
            !isConnected
              ? "not connected"
              : walletBal !== null
                ? `${walletBal} ${token?.symbol ?? ""}`
                : `-- ${token?.symbol ?? ""}`
          }
          isLoading={isWalletBalLoading}
          isError={isWalletBalError}
          onRetry={() => refetchWalletBal()}
        />
        <DataRow
          label="Deposit Bal"
          value={
            !depositAddress
              ? "no deposit addr"
              : depBal !== null
                ? `${depBal} ${token?.symbol ?? ""}`
                : `-- ${token?.symbol ?? ""}`
          }
          isLoading={isDepBalLoading}
          isError={isDepBalError}
          onRetry={() => refetchDepBal()}
        />
        {routerAddr && (
          <DataRow
            label="Contract"
            value={`${routerAddr.slice(0, 8)}...${routerAddr.slice(-6)}`}
            href={`${sourceChain?.chain?.blockExplorers?.default?.url ?? "https://sepolia.etherscan.io"}/address/${routerAddr}`}
          />
        )}
      </div>
    </div>
  );
}
