import { type Chain } from "viem";

/* ------------------------------------------------------------------ */
/*  Chain definitions                                                  */
/* ------------------------------------------------------------------ */

export const sepoliaChain: Chain = {
  id: 11155111,
  name: "Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.sepolia.org"] },
  },
  blockExplorers: {
    default: { name: "Etherscan", url: "https://sepolia.etherscan.io" },
  },
  testnet: true,
};

export const riseTestnetChain: Chain = {
  id: 11155931,
  name: "RISE Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet.riselabs.xyz"] },
  },
  blockExplorers: {
    default: { name: "RISE Explorer", url: "https://testnet.rise.trade" },
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
  explorerTxUrl: (hash: string) => string;
}

export const CHAINS: Record<number, ChainMeta> = {
  [sepoliaChain.id]: {
    chain: sepoliaChain,
    lzEid: 40161,
    label: "Sepolia",
    shortLabel: "SEP",
    explorerTxUrl: (h) => `https://sepolia.etherscan.io/tx/${h}`,
  },
  [riseTestnetChain.id]: {
    chain: riseTestnetChain,
    lzEid: 40438,
    label: "RISE Testnet",
    shortLabel: "RISE",
    explorerTxUrl: (h) =>
      `${process.env.NEXT_PUBLIC_RISE_EXPLORER_URL ?? "https://testnet.rise.trade"}/tx/${h}`,
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
  // Extensible: add Arbitrum, Base, Optimism routes here
];

export const SUPPORTED_CHAIN_IDS = Object.keys(CHAINS).map(Number);

/* ------------------------------------------------------------------ */
/*  LayerZero                                                          */
/* ------------------------------------------------------------------ */

export const LZ_SCAN_BASE = "https://testnet.layerzeroscan.com";

export function lzScanMessageUrl(srcEid: number, hash: string) {
  return `${LZ_SCAN_BASE}/tx/${hash}`;
}

export const EXTERNAL_LINKS = {
  lzTools: "https://testnet.layerzeroscan.com/tools",
  lzApi: "https://scan-testnet.layerzero-api.com/v1/swagger",
  oftDocs: "https://docs.layerzero.network/v2/tools/api/oft",
  risePortfolio: "https://testnet.rise.trade/en/portfolio",
};
