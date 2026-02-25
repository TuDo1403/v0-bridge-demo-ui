"use client";

import { useAccount, useReadContract } from "wagmi";
import { riseGlobalDepositAbi, erc20Abi } from "@/lib/abi";
import { useBridgeStore } from "@/lib/bridge-store";
import { CONTRACTS, getTokenAddress, TOKENS } from "@/config/contracts";
import { CHAINS } from "@/config/chains";
import { formatUnits, type Address } from "viem";

function DataRow({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground shrink-0">
        {label}
      </span>
      <span
        className={`text-xs text-foreground truncate ${mono ? "font-mono" : "font-sans"}`}
      >
        {value}
      </span>
    </div>
  );
}

export function InfoPanel() {
  const { address } = useAccount();
  const { sourceChainId, destChainId, tokenKey, depositAddress } =
    useBridgeStore();

  const globalDepositAddr = CONTRACTS[sourceChainId]?.globalDeposit;
  const tokenAddress = getTokenAddress(tokenKey, sourceChainId);
  const token = TOKENS[tokenKey];
  const sourceChain = CHAINS[sourceChainId];
  const destChain = CHAINS[destChainId];

  // Fee config
  const { data: feeConfig } = useReadContract({
    address: globalDepositAddr,
    abi: riseGlobalDepositAbi,
    functionName: "getFeeConfig",
    chainId: sourceChainId,
    query: { enabled: !!globalDepositAddr },
  });

  // Destination EID
  const { data: dstEid } = useReadContract({
    address: globalDepositAddr,
    abi: riseGlobalDepositAbi,
    functionName: "getDstEid",
    chainId: sourceChainId,
    query: { enabled: !!globalDepositAddr },
  });

  // User wallet balance
  const { data: walletBalance } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: sourceChainId,
    query: { enabled: !!address && !!tokenAddress },
  });

  // Deposit address balance
  const { data: depositBal } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: depositAddress ? [depositAddress as Address] : undefined,
    chainId: sourceChainId,
    query: { enabled: !!depositAddress && !!tokenAddress },
  });

  const feeBps = feeConfig
    ? (Number((feeConfig as [number, string])[0]) / 100).toFixed(2)
    : "--";

  const walletBal =
    walletBalance && token
      ? formatUnits(walletBalance as bigint, token.decimals)
      : "--";

  const depBal =
    depositBal && token
      ? formatUnits(depositBal as bigint, token.decimals)
      : "--";

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        Contract Info
      </span>

      <div className="flex flex-col divide-y divide-border">
        <DataRow label="Source" value={sourceChain?.label ?? "--"} />
        <DataRow label="Dest" value={destChain?.label ?? "--"} />
        <DataRow label="Dst EID" value={dstEid ? String(dstEid) : "--"} />
        <DataRow label="Src EID" value={String(sourceChain?.lzEid ?? "--")} />
        <DataRow label="Fee" value={`${feeBps}%`} />
        <DataRow label="Token" value={token?.symbol ?? "--"} />
        <DataRow label="Wallet Bal" value={`${walletBal} ${token?.symbol ?? ""}`} />
        <DataRow label="Deposit Bal" value={`${depBal} ${token?.symbol ?? ""}`} />
        {globalDepositAddr && (
          <DataRow
            label="Contract"
            value={`${globalDepositAddr.slice(0, 8)}...${globalDepositAddr.slice(-6)}`}
          />
        )}
      </div>
    </div>
  );
}
