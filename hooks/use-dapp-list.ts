"use client";

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { type Address } from "viem";
import { riseGlobalDepositAbi } from "@/lib/abi";
import { getGlobalDepositAddress, KNOWN_DAPPS, type DappMeta } from "@/config/contracts";
import { useBridgeConfig, type ConfigDapp } from "@/lib/bridge-config";
import { chainIdToEid } from "@/config/chains";

export interface ValidatedDapp extends DappMeta {
  available: boolean;
  composer: Address;
  vaultImpl: Address;
}

interface UseDappListReturn {
  dapps: ValidatedDapp[];
  isLoading: boolean;
}

/**
 * Returns the list of dapps with availability status.
 * Prefers dynamic config from backend (/v1/bridge/config) when available.
 * Falls back to on-chain getDapp() calls if backend is unreachable.
 */
export function useDappList(sourceChainId: number): UseDappListReturn {
  const { config, isLoading: configLoading } = useBridgeConfig();
  const srcEid = chainIdToEid(sourceChainId);
  const globalDepositAddr = getGlobalDepositAddress(sourceChainId);

  // If dynamic config is available, derive dapp list from it
  const configDapps = useMemo<ValidatedDapp[] | null>(() => {
    if (!config) return null;
    return config.dapps.map((d: ConfigDapp) => ({
      dappId: d.dappId,
      label: d.label,
      description: d.description,
      available: (d.supportedTokens[String(srcEid)]?.length ?? 0) > 0,
      composer: (d.composer ?? "0x0000000000000000000000000000000000000000") as Address,
      vaultImpl: "0x0000000000000000000000000000000000000000" as Address, // not exposed in config
    }));
  }, [config, srcEid]);

  // Fallback: on-chain getDapp() calls
  const contracts = useMemo(
    () =>
      KNOWN_DAPPS.map((d) => ({
        address: globalDepositAddr!,
        abi: riseGlobalDepositAbi,
        functionName: "getDapp" as const,
        args: [d.dappId] as const,
        chainId: sourceChainId,
      })),
    [globalDepositAddr, sourceChainId],
  );

  const { data, isLoading: onChainLoading } = useReadContracts({
    contracts: globalDepositAddr && !configDapps ? contracts : [],
    query: {
      enabled: !!globalDepositAddr && !configDapps,
      staleTime: 60_000,
      refetchInterval: 60_000,
    },
  });

  const onChainDapps = useMemo<ValidatedDapp[]>(() => {
    return KNOWN_DAPPS.map((meta, i) => {
      const result = data?.[i];
      if (result?.status === "success" && result.result) {
        const info = result.result as unknown as {
          vaultImpl: Address;
          composer: Address;
          lzComposeGas: number | bigint;
        };
        return {
          ...meta,
          available: info.vaultImpl !== "0x0000000000000000000000000000000000000000",
          composer: info.composer,
          vaultImpl: info.vaultImpl,
        };
      }
      return {
        ...meta,
        available: meta.dappId === 0,
        composer: "0x0000000000000000000000000000000000000000" as Address,
        vaultImpl: "0x0000000000000000000000000000000000000000" as Address,
      };
    });
  }, [data]);

  // Prefer dynamic config, fall back to on-chain
  if (configDapps) {
    return { dapps: configDapps, isLoading: configLoading };
  }
  return { dapps: onChainDapps, isLoading: onChainLoading };
}
