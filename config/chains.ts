import { type Chain } from "viem";
import { mainnet } from "viem/chains";
import type { NetworkId } from "@/lib/network-store";

/* ------------------------------------------------------------------ */
/*  Testnet chain definitions                                          */
/* ------------------------------------------------------------------ */

export const SEPOLIA_RPC_URLS = [
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
  "https://1rpc.io/sepolia",
  "https://sepolia.drpc.org",
];

export const sepoliaChain: Chain = {
  id: 11155111,
  name: "Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [SEPOLIA_RPC_URLS[0]] },
  },
  blockExplorers: {
    default: { name: "Etherscan", url: "https://sepolia.etherscan.io" },
  },
  testnet: true,
};

export const RISE_TESTNET_RPC_URL =
  process.env.NEXT_PUBLIC_RISE_TESTNET_RPC_URL ??
  process.env.NEXT_PUBLIC_RISE_RPC_URL ??
  "https://testnet.riselabs.xyz";

export const riseTestnetChain: Chain = {
  id: 11155931,
  name: "RISE Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [RISE_TESTNET_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "RISE Explorer", url: "https://explorer.testnet.riselabs.xyz" },
  },
  testnet: true,
};

/* ------------------------------------------------------------------ */
/*  Mainnet chain definitions                                          */
/* ------------------------------------------------------------------ */

export const ETHEREUM_MAINNET_RPC_URLS = [
  process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL ?? "https://ethereum-rpc.publicnode.com",
  "https://1rpc.io/eth",
  "https://eth.drpc.org",
];

export const ethereumMainnetChain: Chain = {
  ...mainnet,
  rpcUrls: {
    default: { http: [ETHEREUM_MAINNET_RPC_URLS[0]] },
  },
};

export const RISE_MAINNET_RPC_URL =
  process.env.NEXT_PUBLIC_RISE_MAINNET_RPC_URL ?? "https://rpc.riselabs.xyz";

export const riseMainnetChain: Chain = {
  id: 4153,
  name: "RISE",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [RISE_MAINNET_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "RISE Explorer", url: "https://explorer.riselabs.xyz" },
  },
  testnet: false,
};

/* ------------------------------------------------------------------ */
/*  Supported chain registry (all networks)                            */
/* ------------------------------------------------------------------ */

export interface ChainMeta {
  chain: Chain;
  lzEid: number;
  label: string;
  shortLabel: string;
  iconKey: string;
  explorerTxUrl: (hash: string) => string;
  network: NetworkId;
}

export const CHAINS: Record<number, ChainMeta> = {
  // Testnet
  [sepoliaChain.id]: {
    chain: sepoliaChain,
    lzEid: 40161,
    label: "Sepolia",
    shortLabel: "SEP",
    iconKey: "ethereum",
    explorerTxUrl: (h) => `https://sepolia.etherscan.io/tx/${h}`,
    network: "testnet",
  },
  [riseTestnetChain.id]: {
    chain: riseTestnetChain,
    lzEid: 40438,
    label: "RISE Testnet",
    shortLabel: "RISE",
    iconKey: "rise",
    explorerTxUrl: (h) =>
      `${process.env.NEXT_PUBLIC_RISE_TESTNET_EXPLORER_URL ?? "https://explorer.testnet.riselabs.xyz"}/tx/${h}`,
    network: "testnet",
  },
  // Mainnet
  [ethereumMainnetChain.id]: {
    chain: ethereumMainnetChain,
    lzEid: 30101,
    label: "Ethereum",
    shortLabel: "ETH",
    iconKey: "ethereum",
    explorerTxUrl: (h) => `https://etherscan.io/tx/${h}`,
    network: "mainnet",
  },
  [riseMainnetChain.id]: {
    chain: riseMainnetChain,
    lzEid: 30401,
    label: "RISE",
    shortLabel: "RISE",
    iconKey: "rise",
    explorerTxUrl: (h) =>
      `${process.env.NEXT_PUBLIC_RISE_EXPLORER_URL ?? "https://explorer.riselabs.xyz"}/tx/${h}`,
    network: "mainnet",
  },
};

/* ------------------------------------------------------------------ */
/*  Route pairs (per network)                                          */
/* ------------------------------------------------------------------ */

export interface BridgeRoute {
  sourceChainId: number;
  destChainId: number;
  label: string;
}

export const BRIDGE_ROUTES_BY_NETWORK: Record<NetworkId, BridgeRoute[]> = {
  testnet: [
    {
      sourceChainId: sepoliaChain.id,
      destChainId: riseTestnetChain.id,
      label: "Sepolia -> RISE Testnet",
    },
    {
      sourceChainId: riseTestnetChain.id,
      destChainId: sepoliaChain.id,
      label: "RISE Testnet -> Sepolia",
    },
  ],
  mainnet: [
    {
      sourceChainId: ethereumMainnetChain.id,
      destChainId: riseMainnetChain.id,
      label: "Ethereum -> RISE",
    },
    {
      sourceChainId: riseMainnetChain.id,
      destChainId: ethereumMainnetChain.id,
      label: "RISE -> Ethereum",
    },
  ],
};

/** @deprecated Use BRIDGE_ROUTES_BY_NETWORK with network param */
export const BRIDGE_ROUTES = BRIDGE_ROUTES_BY_NETWORK.testnet;

export function getSupportedChainIds(network: NetworkId): number[] {
  return Object.values(CHAINS)
    .filter((c) => c.network === network)
    .map((c) => c.chain.id);
}

export const SUPPORTED_CHAIN_IDS = Object.keys(CHAINS).map(Number);

/** Convert a viem chain ID to a LayerZero EID. Falls back to chainId itself if unknown. */
export function chainIdToEid(chainId: number): number {
  return CHAINS[chainId]?.lzEid ?? chainId;
}

/** Resolve a LayerZero EID back to our ChainMeta. Returns undefined if unknown. */
export function eidToChainMeta(eid: number): ChainMeta | undefined {
  return Object.values(CHAINS).find((c) => c.lzEid === eid);
}

/* ------------------------------------------------------------------ */
/*  LayerZero (per network)                                            */
/* ------------------------------------------------------------------ */

export function getLzScanBase(network: NetworkId): string {
  if (network === "mainnet") {
    return process.env.NEXT_PUBLIC_LZ_SCAN_BASE_MAINNET ?? "https://layerzeroscan.com";
  }
  return process.env.NEXT_PUBLIC_LZ_SCAN_BASE ?? "https://testnet.layerzeroscan.com";
}

/** @deprecated Use getLzScanBase(network) */
export const LZ_SCAN_BASE = process.env.NEXT_PUBLIC_LZ_SCAN_BASE ?? "https://testnet.layerzeroscan.com";

export function lzScanMessageUrl(network: NetworkId, hash: string) {
  return `${getLzScanBase(network)}/tx/${hash}`;
}

export function getExternalLinks(network: NetworkId) {
  if (network === "mainnet") {
    return {
      lzTools: "https://layerzeroscan.com/tools",
      lzApi: "https://scan.layerzero-api.com/v1/swagger",
      oftDocs: "https://docs.layerzero.network/v2/tools/api/oft",
      risePortfolio: "https://rise.trade/en/portfolio",
    };
  }
  return {
    lzTools: "https://testnet.layerzeroscan.com/tools",
    lzApi: "https://scan-testnet.layerzero-api.com/v1/swagger",
    oftDocs: "https://docs.layerzero.network/v2/tools/api/oft",
    risePortfolio: "https://testnet.rise.trade/en/portfolio",
  };
}

/** @deprecated Use getExternalLinks(network) */
export const EXTERNAL_LINKS = getExternalLinks("testnet");

/* ------------------------------------------------------------------ */
/*  Block confirmations required by ULN302 DVN config                  */
/* ------------------------------------------------------------------ */

/**
 * Number of source-chain block confirmations required before LZ DVNs
 * will verify the message. Keyed by source chain ID.
 */
export const REQUIRED_CONFIRMATIONS: Record<number, number> = {
  // Mainnet
  [ethereumMainnetChain.id]: 15,   // ETH → RISE: 15 ETH blocks
  [riseMainnetChain.id]: 900,      // RISE → ETH: 900 RISE blocks
  // Testnet
  [sepoliaChain.id]: 15,           // Sepolia → RISE Testnet
  [riseTestnetChain.id]: 900,      // RISE Testnet → Sepolia
};

/** Average block time in seconds, used to estimate ETA */
export const BLOCK_TIME_SECONDS: Record<number, number> = {
  [ethereumMainnetChain.id]: 12,
  [riseMainnetChain.id]: 1,
  [sepoliaChain.id]: 12,
  [riseTestnetChain.id]: 1,
};
