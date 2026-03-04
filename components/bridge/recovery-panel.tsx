"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useAccount, useSwitchChain } from "wagmi";
import { formatUnits } from "viem";
import { type Address } from "viem";
import { useBridgeStore } from "@/lib/bridge-store";
import {
  useVaultTokenBalances,
  useVaultRecover,
} from "@/hooks/use-vault-rescue";
import { useComposeRecover } from "@/hooks/use-compose-recover";
import { isVaultRescueEligible, isComposeRescueNeeded } from "@/lib/types";
import { CHAINS } from "@/config/chains";
import { TOKENS } from "@/config/contracts";
import type { BridgeSession } from "@/lib/types";
import { AddressPill } from "./address-pill";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowDownToLine,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Vault recover mode — calls vault's rescueERC20 directly             */
/* ------------------------------------------------------------------ */

function VaultRecoverPanel({ session }: { session: BridgeSession }) {
  const { address: connectedAddress, chainId: connectedChainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { updateSession } = useBridgeStore();

  const sourceChain = CHAINS[session.sourceChainId];
  const token = TOKENS[session.tokenKey];
  const vaultAddress = session.depositAddress as Address;
  const needsSwitch = connectedChainId !== session.sourceChainId;

  // Fetch all token balances on the vault
  const { balances, ethBalance, isLoading: isLoadingBalance } = useVaultTokenBalances(
    needsSwitch ? undefined : vaultAddress,
    needsSwitch ? undefined : session.sourceChainId,
  );

  // Use direct vault recovery (rescueERC20)
  const { recover, isPending, isConfirming, isSuccess, error, txHash, reset } =
    useVaultRecover({
      vaultAddress: needsSwitch ? undefined : vaultAddress,
      chainId: needsSwitch ? undefined : session.sourceChainId,
    });

  // Update session on success
  useEffect(() => {
    if (isSuccess && txHash) {
      updateSession(session.id, { status: "recovered", error: undefined });
    }
  }, [isSuccess, txHash, session.id, updateSession]);

  // Find the primary token balance (session's token)
  const primaryBalance = balances.find((b) => b.tokenKey === session.tokenKey);
  const formattedBalance = primaryBalance && token
    ? formatUnits(primaryBalance.balance, token.decimals)
    : null;

  const handleRecover = () => {
    if (!primaryBalance || !connectedAddress) return;
    reset();
    recover(primaryBalance.address, connectedAddress as Address, primaryBalance.balance);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Summary */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
          Vault Recovery — {sourceChain?.label}
        </span>
        <p className="text-[11px] font-mono text-muted-foreground">
          Tokens are stuck in the deterministic vault. You can call{" "}
          <code className="bg-muted/50 px-1 rounded">rescueERC20()</code> directly
          on the vault to recover them.
        </p>
      </div>

      {/* Vault balance */}
      <div className="flex items-center gap-2 px-3 py-2 rounded bg-muted/30 border border-border/50">
        <ArrowDownToLine className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
            Vault Balance
          </span>
          {isLoadingBalance ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : (
            <span className="text-sm font-mono text-foreground">
              {formattedBalance !== null ? `${formattedBalance} ${token?.symbol}` : "0"}
            </span>
          )}
        </div>
      </div>

      {/* Link to full recovery page */}
      <div className="flex items-center gap-2">
        <AddressPill label="Vault" address={session.depositAddress} />
        <Link
          href={`/recover/${session.depositAddress}`}
          className="text-[10px] font-mono text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
        >
          Full recovery page
          <ExternalLink className="h-2.5 w-2.5" />
        </Link>
      </div>

      {/* Network switch or recover button */}
      {needsSwitch ? (
        <Button
          variant="outline"
          size="sm"
          className="font-mono text-xs gap-1.5"
          onClick={() => switchChain({ chainId: session.sourceChainId })}
        >
          Switch to {sourceChain?.label}
        </Button>
      ) : isSuccess ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded bg-success/10 border border-success/20 text-[11px] font-mono text-success">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Tokens recovered successfully!
          {txHash && sourceChain && (
            <a
              href={sourceChain.explorerTxUrl(txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-success hover:text-success/80 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={isPending || isConfirming || !primaryBalance || primaryBalance.balance === 0n}
            className="font-mono text-xs gap-1.5 border-chart-4/30 hover:bg-chart-4/10 text-chart-4"
            onClick={handleRecover}
          >
            {isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : isConfirming ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ArrowDownToLine className="h-3 w-3" />
            )}
            {isPending
              ? "Confirm in Wallet..."
              : isConfirming
                ? "Confirming..."
                : !primaryBalance || primaryBalance.balance === 0n
                  ? "Vault is Empty"
                  : "Recover Tokens"}
          </Button>
          {error && (
            <div className="px-3 py-2 rounded bg-destructive/10 border border-destructive/20 text-[10px] font-mono text-destructive-foreground flex items-start gap-2">
              <XCircle className="h-3 w-3 shrink-0 mt-0.5" />
              <span className="break-all">{error.slice(0, 200)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Compose recovery mode — calls claimFunds directly on RISExComposer  */
/* ------------------------------------------------------------------ */

function ComposeRecoverPanel({ session }: { session: BridgeSession }) {
  const { chainId: connectedChainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { updateSession } = useBridgeStore();

  const destChain = CHAINS[session.destChainId];
  const token = TOKENS[session.tokenKey];
  const lz = session.lzTracking;
  const needsSwitch = connectedChainId !== session.destChainId;

  const {
    composerAddress,
    composerBalance,
    isLoadingBalance,
    recover,
    isPending,
    isConfirming,
    isSuccess,
    error,
    txHash,
  } = useComposeRecover({ session, enabled: !needsSwitch });

  // Update session on success
  useEffect(() => {
    if (isSuccess && txHash) {
      updateSession(session.id, { status: "recovered", error: undefined });
    }
  }, [isSuccess, txHash, session.id, updateSession]);

  const formattedBalance = composerBalance !== undefined && token
    ? formatUnits(composerBalance, token.decimals)
    : null;

  return (
    <div className="flex flex-col gap-3">
      {/* Info */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
          Compose Recovery — {destChain?.label}
        </span>
        <p className="text-[11px] font-mono text-muted-foreground">
          The compose execution reverted on the destination chain. Your tokens are held by the
          RISExComposer contract. You can call{" "}
          <code className="bg-muted/50 px-1 rounded">claimFunds()</code> to recover them.
        </p>
      </div>

      {/* Composer balance */}
      <div className="flex items-center gap-2 px-3 py-2 rounded bg-muted/30 border border-border/50">
        <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
            Composer {token?.symbol} Balance
          </span>
          {isLoadingBalance ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : (
            <span className="text-sm font-mono text-foreground">
              {formattedBalance !== null ? `${formattedBalance} ${token?.symbol}` : "0"}
            </span>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="flex flex-col gap-1.5 px-3 py-2 rounded bg-muted/30 border border-border/50">
        {composerAddress && (
          <AddressPill label="Composer" address={composerAddress} />
        )}
        {lz?.dstTxHash && destChain && (
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground shrink-0">
              Dest Tx
            </span>
            <a
              href={destChain.explorerTxUrl(lz.dstTxHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[11px] text-primary hover:text-primary/80 truncate transition-colors"
            >
              {lz.dstTxHash.slice(0, 10)}...{lz.dstTxHash.slice(-6)}
              <ExternalLink className="h-2.5 w-2.5 inline ml-1" />
            </a>
          </div>
        )}
        {lz?.guid && (
          <AddressPill label="GUID" address={lz.guid} />
        )}
      </div>

      {/* Action */}
      {needsSwitch ? (
        <Button
          variant="outline"
          size="sm"
          className="font-mono text-xs gap-1.5"
          onClick={() => switchChain({ chainId: session.destChainId })}
        >
          Switch to {destChain?.label}
        </Button>
      ) : isSuccess ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded bg-success/10 border border-success/20 text-[11px] font-mono text-success">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Tokens recovered successfully!
          {txHash && destChain && (
            <a
              href={destChain.explorerTxUrl(txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-success hover:text-success/80 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={isPending || isConfirming || !composerBalance || composerBalance === BigInt(0)}
            className="font-mono text-xs gap-1.5 border-chart-4/30 hover:bg-chart-4/10 text-chart-4"
            onClick={recover}
          >
            {isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : isConfirming ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ArrowDownToLine className="h-3 w-3" />
            )}
            {isPending
              ? "Confirm in Wallet..."
              : isConfirming
                ? "Confirming..."
                : !composerBalance || composerBalance === BigInt(0)
                  ? "No Balance"
                  : "Recover Tokens"}
          </Button>
          {error && (
            <div className="px-3 py-2 rounded bg-destructive/10 border border-destructive/20 text-[10px] font-mono text-destructive-foreground flex items-start gap-2">
              <XCircle className="h-3 w-3 shrink-0 mt-0.5" />
              <span className="break-all">{error.slice(0, 200)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main recovery panel                                                 */
/* ------------------------------------------------------------------ */

export function RecoveryPanel({ session }: { session: BridgeSession }) {
  const vaultEligible = isVaultRescueEligible(session);
  const composeNeeded = isComposeRescueNeeded(session);

  if (!vaultEligible && !composeNeeded) return null;

  return (
    <div className="flex flex-col gap-3 px-4 pb-4 border-t border-border/50 pt-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-chart-4" />
        <span className="text-[10px] font-mono uppercase tracking-wider text-chart-4 font-medium">
          Token Recovery
        </span>
      </div>
      {vaultEligible && <VaultRecoverPanel session={session} />}
      {composeNeeded && <ComposeRecoverPanel session={session} />}
    </div>
  );
}
