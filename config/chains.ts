import { type Chain } from "viem";

/* ------------------------------------------------------------------ */
/*  Chain definitions                                                  */
/* ------------------------------------------------------------------ */

export const SEPOLIA_RPC_URLS = [
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
  "https://rpc2.sepolia.org",
  "https://rpc.sepolia.org",
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
  process.env.NEXT_PUBLIC_RISE_RPC_URL ?? "https://testnet.riselabs.xyz";

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
/*  Supported chain registry                                           */
/* ------------------------------------------------------------------ */

export interface ChainMeta {
  chain: Chain;
  lzEid: number;
  label: string;
  shortLabel: string;
  iconKey: string;
  explorerTxUrl: (hash: string) => string;
}

export const CHAINS: Record<number, ChainMeta> = {
  [sepoliaChain.id]: {
    chain: sepoliaChain,
    lzEid: 40161,
    label: "Sepolia",
    shortLabel: "SEP",
    iconKey: "ethereum",
    explorerTxUrl: (h) => `https://sepolia.etherscan.io/tx/${h}`,
  },
  [riseTestnetChain.id]: {
    chain: riseTestnetChain,
    lzEid: 40438,
    label: "RISE Testnet",
    shortLabel: "RISE",
    iconKey: "rise",
    explorerTxUrl: (h) =>
      `${process.env.NEXT_PUBLIC_RISE_EXPLORER_URL ?? "https://explorer.testnet.riselabs.xyz"}/tx/${h}`,
  },
};

/* ------------------------------------------------------------------ */
/*  Route pairs                                                        */
/* ------------------------------------------------------------------ */

export interface BridgeRoute {
  sourceChainId: number;
  destChainId: number;
  label: string;
}

export const BRIDGE_ROUTES: BridgeRoute[] = [
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
  // Extensible: add Arbitrum, Base, Optimism routes here
];

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
/*  LayerZero                                                          */
/* ------------------------------------------------------------------ */

export const LZ_SCAN_BASE = process.env.NEXT_PUBLIC_LZ_SCAN_BASE ?? "https://testnet.layerzeroscan.com";

export function lzScanMessageUrl(srcEid: number, hash: string) {
  return `${LZ_SCAN_BASE}/tx/${hash}`;
}

export const EXTERNAL_LINKS = {
  lzTools: "https://testnet.layerzeroscan.com/tools",
  lzApi: "https://scan-testnet.layerzero-api.com/v1/swagger",
  oftDocs: "https://docs.layerzero.network/v2/tools/api/oft",
  risePortfolio: "https://testnet.rise.trade/en/portfolio",
};
