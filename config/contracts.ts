import { type Address } from "viem";
import { RISE_CHAIN_IDS } from "@/lib/network-store";
import { baseSepoliaChain } from "@/config/chains";

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
export type TransferMode = "vault" | "permit2" | "eip2612";

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
      // Testnet
      11155111: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
      [baseSepoliaChain.id]: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      11155931: "0x6bf6e258b3c5650b448cb1112835048ba5619dc1",
      // Mainnet
      1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      4153: "0xe436820ba0C69702c1d3E601d421c0eF38262739",
    },
  },
  // Native ETH — addresses map intentionally empty: ETH is the chain's native
  // gas token, not an ERC20. Routing logic uses the token KEY (=== "ETH") as
  // the discriminator for picking the OP Stack native bridge flow over
  // LayerZero. The token only appears in the picker on routes whose contracts
  // entries populate optimismPortal + l2ToL1MessagePasser.
  ETH: {
    symbol: "ETH",
    name: "Ether",
    decimals: 18,
    addresses: {},
  },
};

export const SUPPORTED_TOKEN_KEYS = Object.keys(TOKENS);

/** Pseudo-address used by the UI when serializing ETH transfers; the OP
 *  Stack L2StandardBridge takes 0xdEAD…0000 as its `_l2Token` arg for ETH
 *  withdrawals (mirrors lib/native-abi.ts). UIs that need a fallback
 *  "address" string for ETH (history rows, status pills) should display
 *  "ETH" rather than this pseudo-address. */
export const ETH_TOKEN_KEY = "ETH";

/** Returns true when this token key represents the chain's native ETH token
 *  (and therefore should route through the OP Stack native bridge instead
 *  of the LayerZero OFT path). */
export function isNativeToken(tokenKey: string): boolean {
  return tokenKey === ETH_TOKEN_KEY;
}

/* ------------------------------------------------------------------ */
/*  Contract addresses per chain                                       */
/* ------------------------------------------------------------------ */

export interface ChainContracts {
  globalDeposit?: Address;
  globalWithdraw?: Address;
  lockReleaseOFT?: Address;
  usdcMintBurnAdapter?: Address;
  mintBurnOFT?: Address;

  /* OP Stack native bridge contracts (only set on chains that support it).
   * L1 chains expose portal/factory/registry/lockbox/L1 standard bridge.
   * L2 chains expose the L2ToL1MessagePasser predeploy + L2 standard bridge.
   * Native bridge UI is enabled on a chain pair iff both ends populate the
   * relevant addresses. */
  optimismPortal?: Address;
  disputeGameFactory?: Address;
  anchorStateRegistry?: Address;
  ethLockbox?: Address;
  l1StandardBridge?: Address;
  l2ToL1MessagePasser?: Address;
  l2StandardBridge?: Address;
}

export const CONTRACTS: Record<number, ChainContracts> = {
  // Testnet — Sepolia
  11155111: {
    globalDeposit: "0x7d09ed69FE463012D99bED997C381304B70CC9cc",
    lockReleaseOFT: "0x3e48337D4614f1A79ca72D39BE50c4BFa0901318",
    // OP Stack native bridge → RISE testnet (chain id 11155931)
    optimismPortal: "0x77Cce5Cd26C75140C35c38104D0c655c7a786acB",
    disputeGameFactory: "0x790E18c477bFB49c784ca0aED244648166A5022b",
    anchorStateRegistry: "0x436709258FA472Fe4191b3dF1c1D3B90c8d155d5",
    ethLockbox: "0x1C0797b3e74DaC336ad907EC87dc884Da5e66AC5",
    l1StandardBridge: "0xe9A531a5d7253c9823c74Af155d22fe14568b610",
  },
  // Testnet — Base Sepolia
  [baseSepoliaChain.id]: {
    globalDeposit: "0x708A2705C095937F37A07944B9ce543A6213C738",
  },
  // Testnet — RISE Testnet
  11155931: {
    globalWithdraw: "0x4752457F0BF4Bba8A807602B772d6Ec740853e90",
    // OP Stack predeploys (same address on every OP Stack L2)
    l2ToL1MessagePasser: "0x4200000000000000000000000000000000000016",
    l2StandardBridge: "0x4200000000000000000000000000000000000010",
    usdcMintBurnAdapter: "0x27f65Cc64883C35eF496d4D88708875930FC777D",
    mintBurnOFT: "0xCc83d99fd0c63c73A13B0dE850De0A3d1114241F",
  },
  // Mainnet — Ethereum
  1: {
    globalDeposit: "0xE5E6268977575ccFcB50055c17a4563b8b0Ce24E",
    lockReleaseOFT: "0x8b648f051AE72E040166FA5f171838111d982d86",
  },
  // Mainnet — Base
  8453: {
    globalDeposit: "0xE5E6268977575ccFcB50055c17a4563b8b0Ce24E",
  },
  // Mainnet — Arbitrum
  42161: {
    globalDeposit: "0xE5E6268977575ccFcB50055c17a4563b8b0Ce24E",
  },
  // Mainnet — RISE
  4153: {
    globalWithdraw: "0xE5E6268977575ccFcB50055c17a4563b8b0Ce24E",
    usdcMintBurnAdapter: "0x82675d0553D802039e6776C006BEb1b820a69d55",
    mintBurnOFT: "0x5118c3dfdF9d3d558678E03b6684f67CFb6bD8A1",
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
  { dappId: 1, label: "RISEx Perps Deposit", description: "Bridge + auto-deposit to RISEx perps collateral" },
  { dappId: 2, label: "rlpUSDC Round Trip", description: "Bridge USDC, mint rlpUSDC, bridge back" },
];

/** dappId 2 triggers a round-trip: deposit → compose on remote → mint vault shares → bridge back */
export function isRoundTripDapp(dappId: number): boolean {
  return dappId === 2;
}

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
 * Determine direction from source chain ID.
 * If sourceChainId is any RISE chain (testnet or mainnet), it's a withdrawal.
 */
export function getBridgeDirection(sourceChainId: number): BridgeDirection {
  return RISE_CHAIN_IDS.has(sourceChainId) ? "withdraw" : "deposit";
}
