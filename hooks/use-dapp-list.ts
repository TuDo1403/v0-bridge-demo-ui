"use client";

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { type Address } from "viem";
import { riseGlobalDepositAbi } from "@/lib/abi";
import { getGlobalDepositAddress, KNOWN_DAPPS, type DappMeta } from "@/config/contracts";

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
 * Validates KNOWN_DAPPS against on-chain getDapp calls.
 * A dapp is "available" if its vaultImpl != address(0).
 */
export function useDappList(sourceChainId: number): UseDappListReturn {
  const globalDepositAddr = getGlobalDepositAddress(sourceChainId);

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

  const { data, isLoading } = useReadContracts({
    contracts: globalDepositAddr ? contracts : [],
    query: {
      enabled: !!globalDepositAddr,
      staleTime: 60_000,
      refetchInterval: 60_000,
    },
  });

  const dapps = useMemo<ValidatedDapp[]>(() => {
    return KNOWN_DAPPS.map((meta, i) => {
      const result = data?.[i];
      if (result?.status === "success" && result.result) {
        const raw = result.result as unknown as {
          vaultImpl: Address;
          composer: Address;
          lzComposeGas: number | bigint;
        };
        const info = raw;
        return {
          ...meta,
          available: info.vaultImpl !== "0x0000000000000000000000000000000000000000",
          composer: info.composer,
          vaultImpl: info.vaultImpl,
        };
      }
      // Default dappId=0 is always available with zero-address composer (no compose)
      return {
        ...meta,
        available: meta.dappId === 0,
        composer: "0x0000000000000000000000000000000000000000" as Address,
        vaultImpl: "0x0000000000000000000000000000000000000000" as Address,
      };
    });
  }, [data]);

  return { dapps, isLoading };
}
