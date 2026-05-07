"use client";

import { useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { type Address, formatUnits, formatEther, isAddress, isAddressEqual } from "viem";
import { AddressPill } from "./address-pill";
import { ChainIcon } from "./chain-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useVaultInfo,
  useVaultOwnership,
  useVaultTokenBalances,
  useVaultRecover,
  useVaultHasCode,
  useTokenInfo,
  useFactoryRescue,
  type VaultTokenBalance,
} from "@/hooks/use-vault-rescue";
import { CHAINS } from "@/config/chains";
import { type BridgeDirection, KNOWN_DAPPS } from "@/config/contracts";
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
/*  Optional lookup context (enables factory-based recovery for        */
/*  undeployed vaults — passed in from /recover lookup flow)           */
/* ------------------------------------------------------------------ */

export interface VaultLookupContext {
  direction: BridgeDirection;
  srcAddress: Address;
  dstAddress: Address;
  /** Required for deposits (factory keys by dappId). */
  dappId?: number;
  /** Required for withdrawals (factory keys by dstEid). */
  dstEid?: number;
}

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
/*  Custom token recovery — accepts arbitrary ERC-20 address            */
/*                                                                      */
/*  When the vault is deployed → calls vault.rescueERC20 directly.      */
/*  When the vault has no code  → calls factory.rescueFunds (deploys    */
/*  the clone first, then sweeps the entire balance to srcAddress).    */
/* ------------------------------------------------------------------ */

function CustomTokenRecover({
  vaultAddress,
  chainId,
  hasCode,
  connectedAddress,
  recipientAddress,
  canRecover,
  needsSwitch,
  lookup,
  onRequestSwitch,
}: {
  vaultAddress: Address;
  chainId: number;
  hasCode: boolean;
  connectedAddress: Address | undefined;
  /** Recipient for direct vault rescue. Defaults to connected wallet. */
  recipientAddress: Address | undefined;
  canRecover: boolean;
  needsSwitch: boolean;
  lookup?: VaultLookupContext;
  onRequestSwitch: () => void;
}) {
  const [tokenInput, setTokenInput] = useState("");
  const tokenAddress = isAddress(tokenInput) ? (tokenInput as Address) : undefined;

  const {
    symbol,
    decimals,
    balance,
    isLoading: loadingToken,
    isValidToken,
  } = useTokenInfo(tokenAddress, vaultAddress, chainId);

  // Direct vault rescue (vault has code)
  const direct = useVaultRecover({
    vaultAddress: hasCode ? vaultAddress : undefined,
    chainId,
  });

  // Factory rescue (vault has no code OR fallback)
  const factory = useFactoryRescue({
    direction: lookup?.direction ?? "deposit",
    chainId,
    srcAddress: lookup?.srcAddress,
    dstAddress: lookup?.dstAddress,
    dappId: lookup?.dappId,
    dstEid: lookup?.dstEid,
  });

  const useFactory = !hasCode;
  const active = useFactory ? factory : direct;
  const factoryReady =
    !!lookup &&
    !!factory.factoryAddress &&
    (lookup.direction === "deposit" ? lookup.dappId !== undefined : lookup.dstEid !== undefined);

  // Some legacy ERC-20s don't expose `decimals()` cleanly; fall back to the
  // raw integer balance so users can still see and recover funds.
  const formattedBalance =
    balance !== undefined
      ? decimals !== undefined
        ? formatUnits(balance, decimals)
        : balance.toString()
      : null;

  const showInputError = tokenInput.length > 0 && !tokenAddress;
  const tokenLoadFailed = !!tokenAddress && !loadingToken && !isValidToken;
  const zeroBalance = balance !== undefined && balance === 0n;

  // What's blocking the recover button (in priority order). The `no-balance`
  // gate applies to both direct vault rescue and factory rescue — calling
  // `rescueFunds` on an empty token address just deploys the clone and
  // sweeps nothing, wasting gas.
  let blocker: "wallet" | "owner" | "switch" | "factory-params" | "no-balance" | null = null;
  if (!connectedAddress) blocker = "wallet";
  else if (!canRecover) blocker = "owner";
  else if (needsSwitch) blocker = "switch";
  else if (useFactory && !factoryReady) blocker = "factory-params";
  else if (zeroBalance || balance === undefined) blocker = "no-balance";

  const onClick = () => {
    if (!tokenAddress || balance === undefined || balance === 0n) return;
    active.reset();
    if (useFactory) {
      factory.recoverToken(tokenAddress);
    } else {
      if (!recipientAddress) return;
      direct.recover(tokenAddress, recipientAddress, balance);
    }
  };

  return (
    <div className="flex flex-col gap-2 px-4 py-3 rounded-lg bg-muted/30 border border-border/50">
      <div className="flex items-center gap-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Custom Token Address
        </span>
      </div>
      <input
        type="text"
        value={tokenInput}
        onChange={(e) => setTokenInput(e.target.value.trim())}
        placeholder="0x... (any ERC-20 address)"
        className={cn(
          "h-9 px-3 rounded-md border bg-background text-[12px] font-mono text-foreground placeholder:text-muted-foreground/40",
          showInputError ? "border-destructive/50" : "border-border",
        )}
      />

      {tokenAddress && (
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            {loadingToken ? (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            ) : tokenLoadFailed ? (
              <span className="text-[11px] font-mono text-destructive-foreground">
                Not an ERC-20 contract on {CHAINS[chainId]?.shortLabel}
              </span>
            ) : (
              <>
                <span className="text-sm font-mono font-medium text-foreground">
                  {formattedBalance ?? "—"} {symbol ?? "tokens"}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground truncate">
                  {tokenAddress}
                </span>
              </>
            )}
          </div>

          {active.isSuccess ? (
            <RecoverSuccess txHash={active.txHash} chainId={chainId} />
          ) : blocker === "switch" ? (
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-xs gap-1.5 shrink-0"
              onClick={onRequestSwitch}
            >
              Switch to {CHAINS[chainId]?.shortLabel}
            </Button>
          ) : (
            <RecoverButton
              isPending={active.isPending}
              isConfirming={active.isConfirming}
              disabled={!!blocker || tokenLoadFailed}
              onClick={onClick}
            />
          )}
        </div>
      )}

      {tokenAddress && blocker === "wallet" && (
        <span className="text-[10px] font-mono text-muted-foreground">
          Connect your wallet to recover. Only the source address can call rescue.
        </span>
      )}

      {tokenAddress && blocker === "owner" && lookup && (
        <span className="text-[10px] font-mono text-muted-foreground">
          Connected wallet is not the source address. Switch to{" "}
          <span className="text-foreground">
            {lookup.srcAddress.slice(0, 6)}...{lookup.srcAddress.slice(-4)}
          </span>{" "}
          to recover.
        </span>
      )}

      {useFactory && tokenAddress && !factoryReady && (
        <span className="text-[10px] font-mono text-muted-foreground">
          Factory rescue requires looking up the vault from /recover with full bridge parameters.
        </span>
      )}

      {useFactory && tokenAddress && factoryReady && (
        <span className="text-[10px] font-mono text-muted-foreground">
          Vault not deployed — factory will deploy it and sweep the full balance to{" "}
          <span className="text-foreground">
            {lookup!.srcAddress.slice(0, 6)}...{lookup!.srcAddress.slice(-4)}
          </span>
          .
        </span>
      )}

      {active.error && (
        <div className="text-[9px] font-mono text-destructive-foreground break-all">
          {active.error.slice(0, 200)}
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
/*  Factory ETH recovery row — used when the vault has no code yet.    */
/*  Calls factory.rescueETH which deploys the clone first and then    */
/*  sweeps the full ETH balance to srcAddress.                         */
/* ------------------------------------------------------------------ */

function FactoryEthRecoverRow({
  ethBalance,
  chainId,
  lookup,
}: {
  ethBalance: bigint;
  chainId: number;
  lookup: VaultLookupContext;
}) {
  const { recoverETH, isPending, isConfirming, isSuccess, error, txHash, reset } =
    useFactoryRescue({
      direction: lookup.direction,
      chainId,
      srcAddress: lookup.srcAddress,
      dstAddress: lookup.dstAddress,
      dappId: lookup.dappId,
      dstEid: lookup.dstEid,
    });

  if (ethBalance === 0n) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-muted/30 border border-border/50">
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="text-sm font-mono font-medium text-foreground">
          {formatEther(ethBalance)} ETH
        </span>
        <span className="text-[10px] font-mono text-muted-foreground">
          Native ETH — factory will deploy the vault and sweep to source.
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
            recoverETH();
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
  canRecover,
  needsSwitch,
  hasCode,
  lookup,
  onRequestSwitch,
}: {
  vaultAddress: Address;
  chainId: number;
  connectedAddress: Address | undefined;
  canRecover: boolean;
  needsSwitch: boolean;
  hasCode: boolean;
  lookup?: VaultLookupContext;
  onRequestSwitch: () => void;
}) {
  // Skip the known-token multicall when the vault isn't deployed (every
  // balanceOf() call is wasted RPC; the user must use the custom-token
  // input instead). Native balance is always fetched so the ETH recover
  // path works for both deployed and undeployed vaults.
  const { balances, ethBalance, isLoading } = useVaultTokenBalances(
    vaultAddress,
    chainId,
    { skipKnownTokens: !hasCode },
  );
  const hasAny = balances.length > 0 || ethBalance > 0n;
  // Known-token recover rows trigger writes; only render when the wallet
  // is connected, on the right network, and is the vault owner.
  const canShowKnownRecover = hasCode && !!connectedAddress && canRecover && !needsSwitch;
  // Factory ETH rescue requires lookup params + dappId/dstEid for keying.
  const factoryReady =
    !!lookup &&
    (lookup.direction === "deposit" ? lookup.dappId !== undefined : lookup.dstEid !== undefined);
  const canShowFactoryEthRecover =
    !hasCode && factoryReady && !!connectedAddress && canRecover && !needsSwitch;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Vault Balances
        </span>
        {isLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>

      {hasCode && !isLoading && !hasAny && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-muted/30 border border-border/50 text-[11px] font-mono text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5" />
          No balance found among known tokens. Use the custom token field below to check any other ERC-20.
        </div>
      )}

      {canShowKnownRecover && ethBalance > 0n && (
        <EthRecoverRow
          ethBalance={ethBalance}
          vaultAddress={vaultAddress}
          chainId={chainId}
          recipientAddress={connectedAddress!}
        />
      )}

      {canShowFactoryEthRecover && ethBalance > 0n && (
        <FactoryEthRecoverRow
          ethBalance={ethBalance}
          chainId={chainId}
          lookup={lookup!}
        />
      )}

      {canShowKnownRecover &&
        balances.map((token) => (
          <TokenRecoverRow
            key={token.tokenKey}
            token={token}
            vaultAddress={vaultAddress}
            chainId={chainId}
            recipientAddress={connectedAddress!}
          />
        ))}

      <CustomTokenRecover
        vaultAddress={vaultAddress}
        chainId={chainId}
        hasCode={hasCode}
        connectedAddress={connectedAddress}
        recipientAddress={connectedAddress}
        canRecover={canRecover}
        needsSwitch={needsSwitch}
        lookup={lookup}
        onRequestSwitch={onRequestSwitch}
      />
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
  lookup,
}: {
  vaultAddress: Address;
  chainId: number;
  lookup?: VaultLookupContext;
}) {
  const { address: connectedAddress, chainId: connectedChainId } = useAccount();
  const { switchChain } = useSwitchChain();

  const { hasCode, isLoading: loadingCode } = useVaultHasCode(vaultAddress, chainId);
  // Skip vault metadata reads when the vault is not deployed — they all
  // revert and produce noisy errors in the UI.
  const vaultInfo = useVaultInfo(hasCode ? vaultAddress : undefined, chainId);
  const { isOwner, isLoading: loadingOwnership } = useVaultOwnership(
    hasCode ? vaultAddress : undefined,
    connectedAddress,
    chainId,
  );

  const chain = CHAINS[chainId];
  const needsSwitch = connectedChainId !== chainId;

  // Resolved vault metadata: prefer on-chain reads when the vault is
  // deployed, fall back to lookup context (the params used to compute
  // the CREATE2 address) when it isn't.
  const resolvedSrc = (vaultInfo.srcAddress ?? lookup?.srcAddress) as Address | undefined;
  const resolvedDst = (vaultInfo.dstAddress ?? lookup?.dstAddress) as Address | undefined;
  const resolvedDappId = vaultInfo.dappId ?? lookup?.dappId;
  const dappLabel =
    KNOWN_DAPPS.find((d) => d.dappId === (resolvedDappId ?? 0))?.label ??
    `Dapp #${resolvedDappId ?? 0}`;

  // Ownership rules differ when the vault has no code:
  // the factory checks `msg.sender == srcAddress`, so we mirror that here.
  const factoryOwner =
    !!connectedAddress &&
    !!lookup?.srcAddress &&
    isAddressEqual(connectedAddress, lookup.srcAddress);
  const canRecover = hasCode ? !!isOwner : factoryOwner;
  // Treat the deployed-vault case as loading until `isOwner` resolves so the
  // UI doesn't briefly flash "not the owner" while the read is in flight.
  const isOwnershipLoading = hasCode && (isOwner === undefined || loadingOwnership);

  return (
    <div className="flex flex-col gap-4">
      {/* Vault metadata */}
      <div className="flex flex-col gap-2 px-4 py-3 rounded-lg border border-border/50 bg-muted/20">
        <AddressPill label="Vault" address={vaultAddress} />

        {loadingCode ? (
          <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Checking vault...
          </div>
        ) : !hasCode ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-[11px] font-mono text-chart-4">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Vault not deployed at this address yet.
            </div>
            <p className="text-[10px] font-mono text-muted-foreground">
              {lookup
                ? "Recovery will deploy the clone via the factory and sweep funds to the source address."
                : "Open this vault from /recover with full bridge parameters to enable factory-based recovery."}
            </p>
          </div>
        ) : vaultInfo.isLoading ? (
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
                EID {chain?.lzEid}
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

        {/* Lookup-context echo for undeployed vaults */}
        {!hasCode && lookup && resolvedSrc && resolvedDst && (
          <div className="flex flex-col gap-1 mt-1">
            <AddressPill label="Owner" address={resolvedSrc} />
            <AddressPill label="Dst" address={resolvedDst} />
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground shrink-0">
                Dapp
              </span>
              <span className="text-[11px] font-mono text-foreground">{dappLabel}</span>
            </div>
          </div>
        )}
      </div>

      {/* Ownership check */}
      {(hasCode ? vaultInfo.isValid : !!lookup) && connectedAddress && (
        <div
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-lg border text-[11px] font-mono",
            isOwnershipLoading
              ? "border-border bg-muted/30 text-muted-foreground"
              : canRecover
              ? "border-success/20 bg-success/5 text-success"
              : "border-destructive/20 bg-destructive/5 text-destructive-foreground"
          )}
        >
          {isOwnershipLoading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
              Checking vault ownership...
            </>
          ) : canRecover ? (
            <>
              <Wallet className="h-3.5 w-3.5 shrink-0" />
              Connected wallet can recover tokens from this vault.
            </>
          ) : (
            <>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Connected wallet is not the vault owner. Only{" "}
              <span className="font-medium">
                {resolvedSrc?.slice(0, 6)}...{resolvedSrc?.slice(-4)}
              </span>{" "}
              can recover.
            </>
          )}
        </div>
      )}

      {/* Network switch */}
      {needsSwitch && canRecover && (
        <Button
          variant="outline"
          size="sm"
          className="font-mono text-xs gap-1.5 self-start"
          onClick={() => switchChain({ chainId })}
        >
          Switch to {chain?.label}
        </Button>
      )}

      {/* Balances + recovery — always render so users can paste any token  */}
      {/* address and inspect balances even before connecting a wallet.     */}
      {(hasCode ? vaultInfo.isValid : !!lookup) && (
        <VaultBalances
          vaultAddress={vaultAddress}
          chainId={chainId}
          connectedAddress={connectedAddress}
          canRecover={canRecover}
          needsSwitch={needsSwitch}
          hasCode={hasCode}
          lookup={lookup}
          onRequestSwitch={() => switchChain({ chainId })}
        />
      )}

      {/* Explorer link */}
      {chain && (
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
