import { type Address } from "viem";

/* ------------------------------------------------------------------ */
/*  Permit2 canonical address (same on all chains)                     */
/* ------------------------------------------------------------------ */

export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address;

/* ------------------------------------------------------------------ */
/*  Bridge mode types                                                  */
/* ------------------------------------------------------------------ */

/** Who pays cross-chain (LZ) gas */
export type BridgeMode = "operator" | "self";
/** How tokens move from user to the contract */
export type TransferMode = "vault" | "permit2";

/* ------------------------------------------------------------------ */
/*  Token definitions                                                  */
/* ------------------------------------------------------------------ */

export interface TokenMeta {
  symbol: string;
  name: string;
  decimals: number;
  /** Token address per chainId */
  addresses: Record<number, Address>;
  icon?: string;
}

export const TOKENS: Record<string, TokenMeta> = {
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    addresses: {
      11155111: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
      11155931: "0xcd3981f696EB0E5baD1C573e040B17D701141B5E",
    },
  },
  // Extensible: add WETH, WBTC here
  // WETH: { symbol: "WETH", name: "Wrapped Ether", decimals: 18, addresses: { ... } },
};

export const SUPPORTED_TOKEN_KEYS = Object.keys(TOKENS);

/* ------------------------------------------------------------------ */
/*  Contract addresses per chain                                       */
/* ------------------------------------------------------------------ */

export interface ChainContracts {
  globalDeposit?: Address;
  globalWithdraw?: Address;
  lockReleaseOFT?: Address;
  usdcMintBurnAdapter?: Address;
  mintBurnOFT?: Address;
}

export const CONTRACTS: Record<number, ChainContracts> = {
  11155111: {
    globalDeposit: "0x7d09ed69FE463012D99bED997C381304B70CC9cc",
    lockReleaseOFT: "0x3e48337D4614f1A79ca72D39BE50c4BFa0901318",
  },
  11155931: {
    globalWithdraw: "0x4752457F0BF4Bba8A807602B772d6Ec740853e90",
    usdcMintBurnAdapter: "0x27f65Cc64883C35eF496d4D88708875930FC777D",
    mintBurnOFT: "0xCc83d99fd0c63c73A13B0dE850De0A3d1114241F",
  },
};

/* ------------------------------------------------------------------ */
/*  Known dapps                                                        */
/* ------------------------------------------------------------------ */

export interface DappMeta {
  dappId: number;
  label: string;
  description: string;
}

export const KNOWN_DAPPS: DappMeta[] = [
  { dappId: 0, label: "Direct Bridge", description: "Standard bridge transfer" },
  { dappId: 1, label: "RiseX Composer", description: "Bridge + auto-deposit to RiseX collateral" },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

export function getTokenAddress(
  tokenKey: string,
  chainId: number
): Address | undefined {
  return TOKENS[tokenKey]?.addresses[chainId];
}

export function getGlobalDepositAddress(chainId: number): Address | undefined {
  return CONTRACTS[chainId]?.globalDeposit;
}

export function getGlobalWithdrawAddress(chainId: number): Address | undefined {
  return CONTRACTS[chainId]?.globalWithdraw;
}

/** Bridge direction: deposit = Home→Remote, withdraw = Remote→Home */
export type BridgeDirection = "deposit" | "withdraw";

/**
 * Determine direction from source/dest chain IDs.
 * If sourceChainId is RISE Testnet, it's a withdrawal. Otherwise deposit.
 */
export function getBridgeDirection(sourceChainId: number): BridgeDirection {
  return sourceChainId === 11155931 ? "withdraw" : "deposit";
}

