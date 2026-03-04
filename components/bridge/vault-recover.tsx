"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { type Address, formatUnits, formatEther } from "viem";
import { AddressPill } from "./address-pill";
import { ChainIcon } from "./chain-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useVaultInfo,
  useVaultOwnership,
  useVaultTokenBalances,
  useVaultRecover,
  type VaultTokenBalance,
} from "@/hooks/use-vault-rescue";
import { CHAINS } from "@/config/chains";
import { KNOWN_DAPPS } from "@/config/contracts";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowDownToLine,
  ExternalLink,
  Wallet,
  Search,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Shared: recover button state (avoids repeating ternary 4x)          */
/* ------------------------------------------------------------------ */

function RecoverButton({
  isPending,
  isConfirming,
  disabled,
  onClick,
}: {
  isPending: boolean;
  isConfirming: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const busy = isPending || isConfirming;
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy || disabled}
      className="font-mono text-xs gap-1.5 shrink-0"
      onClick={onClick}
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <ArrowDownToLine className="h-3 w-3" />
      )}
      {isPending ? "Confirm..." : isConfirming ? "Confirming..." : "Recover"}
    </Button>
  );
}

function RecoverSuccess({ txHash, chainId }: { txHash?: `0x${string}`; chainId: number }) {
  const chain = CHAINS[chainId];
  return (
    <div className="flex items-center gap-1.5 text-success text-[11px] font-mono">
      <CheckCircle2 className="h-3.5 w-3.5" />
      Recovered
      {txHash && chain && (
        <a
          href={chain.explorerTxUrl(txHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-success hover:text-success/80 transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Token recovery row                                                  */
/* ------------------------------------------------------------------ */

function TokenRecoverRow({
  token,
  vaultAddress,
  chainId,
  recipientAddress,
}: {
  token: VaultTokenBalance;
  vaultAddress: Address;
  chainId: number;
  recipientAddress: Address;
}) {
  const { recover, isPending, isConfirming, isSuccess, error, txHash, reset } =
    useVaultRecover({ vaultAddress, chainId });

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-muted/30 border border-border/50">
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="text-sm font-mono font-medium text-foreground">
          {formatUnits(token.balance, token.decimals)} {token.symbol}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground truncate">
          {token.address}
        </span>
      </div>

      {isSuccess ? (
        <RecoverSuccess txHash={txHash} chainId={chainId} />
      ) : (
        <RecoverButton
          isPending={isPending}
          isConfirming={isConfirming}
          onClick={() => {
            reset();
            recover(token.address, recipientAddress, token.balance);
          }}
        />
      )}

      {error && (
        <div className="text-[9px] font-mono text-destructive-foreground truncate">
          {error.slice(0, 100)}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ETH recovery row                                                    */
/* ------------------------------------------------------------------ */

function EthRecoverRow({
  ethBalance,
  vaultAddress,
  chainId,
  recipientAddress,
}: {
  ethBalance: bigint;
  vaultAddress: Address;
  chainId: number;
  recipientAddress: Address;
}) {
  const { recoverETH, isPending, isConfirming, isSuccess, error, txHash, reset } =
    useVaultRecover({ vaultAddress, chainId });

  if (ethBalance === 0n) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-muted/30 border border-border/50">
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="text-sm font-mono font-medium text-foreground">
          {formatEther(ethBalance)} ETH
        </span>
        <span className="text-[10px] font-mono text-muted-foreground">Native ETH</span>
      </div>

      {isSuccess ? (
        <RecoverSuccess txHash={txHash} chainId={chainId} />
      ) : (
        <RecoverButton
          isPending={isPending}
          isConfirming={isConfirming}
          onClick={() => {
            reset();
            recoverETH(recipientAddress, ethBalance);
          }}
        />
      )}

      {error && (
        <div className="text-[9px] font-mono text-destructive-foreground truncate">
          {error.slice(0, 100)}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Vault balances list                                                 */
/* ------------------------------------------------------------------ */

function VaultBalances({
  vaultAddress,
  chainId,
  connectedAddress,
}: {
  vaultAddress: Address;
  chainId: number;
  connectedAddress: Address;
}) {
  const { balances, ethBalance, isLoading } = useVaultTokenBalances(vaultAddress, chainId);
  const hasAny = balances.length > 0 || ethBalance > 0n;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Vault Balances
        </span>
        {isLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>

      {!isLoading && !hasAny && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-muted/30 border border-border/50 text-[11px] font-mono text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Vault is empty. No tokens to recover.
        </div>
      )}

      {ethBalance > 0n && (
        <EthRecoverRow
          ethBalance={ethBalance}
          vaultAddress={vaultAddress}
          chainId={chainId}
          recipientAddress={connectedAddress}
        />
      )}

      {balances.map((token) => (
        <TokenRecoverRow
          key={token.tokenKey}
          token={token}
          vaultAddress={vaultAddress}
          chainId={chainId}
          recipientAddress={connectedAddress}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  VaultDisplay — full vault info + ownership + balances + recovery     */
/*  Shared between /recover (lookup) and /recover/[address] (direct)   */
/* ------------------------------------------------------------------ */

export function VaultDisplay({
  vaultAddress,
  chainId,
}: {
  vaultAddress: Address;
  chainId: number;
}) {
  const { address: connectedAddress, chainId: connectedChainId } = useAccount();
  const { switchChain } = useSwitchChain();

  const vaultInfo = useVaultInfo(vaultAddress, chainId);
  const isOwner = useVaultOwnership(vaultAddress, connectedAddress, chainId);

  const chain = CHAINS[chainId];
  const needsSwitch = connectedChainId !== chainId;
  const dappLabel =
    KNOWN_DAPPS.find((d) => d.dappId === (vaultInfo.dappId ?? 0))?.label ??
    `Dapp #${vaultInfo.dappId ?? 0}`;

  return (
    <div className="flex flex-col gap-4">
      {/* Vault metadata */}
      <div className="flex flex-col gap-2 px-4 py-3 rounded-lg border border-border/50 bg-muted/20">
        <AddressPill label="Vault" address={vaultAddress} />

        {vaultInfo.isLoading ? (
          <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Reading vault...
          </div>
        ) : !vaultInfo.isValid ? (
          <div className="flex items-center gap-2 text-[11px] font-mono text-destructive-foreground">
            <XCircle className="h-3.5 w-3.5" />
            No vault found at this address. Check your parameters.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <ChainIcon chainKey={chain?.iconKey} className="h-3.5 w-3.5" />
              <span className="text-[11px] font-mono text-foreground">{chain?.label}</span>
              <span className="text-[9px] font-mono text-muted-foreground">
                EID {vaultInfo.srcEid}
              </span>
            </div>
            {vaultInfo.srcAddress && (
              <div className="flex flex-col gap-1 mt-1">
                <AddressPill label="Owner" address={vaultInfo.srcAddress} />
                <AddressPill label="Dst" address={vaultInfo.dstAddress} />
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground shrink-0">
                    Dapp
                  </span>
                  <span className="text-[11px] font-mono text-foreground">{dappLabel}</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Ownership check */}
      {vaultInfo.isValid && connectedAddress && (
        <div
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-lg border text-[11px] font-mono",
            isOwner
              ? "border-success/20 bg-success/5 text-success"
              : "border-destructive/20 bg-destructive/5 text-destructive-foreground"
          )}
        >
          {isOwner ? (
            <>
              <Wallet className="h-3.5 w-3.5 shrink-0" />
              Connected wallet is the vault owner. You can recover tokens.
            </>
          ) : (
            <>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Connected wallet is not the vault owner. Only{" "}
              <span className="font-medium">
                {vaultInfo.srcAddress?.slice(0, 6)}...{vaultInfo.srcAddress?.slice(-4)}
              </span>{" "}
              can recover.
            </>
          )}
        </div>
      )}

      {/* Network switch */}
      {needsSwitch && isOwner && (
        <Button
          variant="outline"
          size="sm"
          className="font-mono text-xs gap-1.5 self-start"
          onClick={() => switchChain({ chainId })}
        >
          Switch to {chain?.label}
        </Button>
      )}

      {/* Balances + recovery */}
      {vaultInfo.isValid && !needsSwitch && isOwner && connectedAddress && (
        <VaultBalances
          vaultAddress={vaultAddress}
          chainId={chainId}
          connectedAddress={connectedAddress}
        />
      )}

      {/* Not connected */}
      {!connectedAddress && vaultInfo.isValid && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-border/50 bg-muted/20 text-[11px] font-mono text-muted-foreground">
          <Wallet className="h-3.5 w-3.5" />
          Connect your wallet to check ownership and recover tokens.
        </div>
      )}

      {/* Explorer link */}
      {vaultInfo.isValid && chain && (
        <a
          href={`${chain.chain.blockExplorers?.default.url}/address/${vaultAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground hover:text-primary transition-colors self-start"
        >
          View on {chain.chain.blockExplorers?.default.name}
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      )}
    </div>
  );
}
