import { http, createConfig, fallback } from "wagmi";
import { injected } from "wagmi/connectors";
import {
  sepoliaChain,
  baseSepoliaChain,
  riseTestnetChain,
  ethereumMainnetChain,
  baseMainnetChain,
  arbitrumMainnetChain,
  riseMainnetChain,
  SEPOLIA_RPC_URLS,
  BASE_SEPOLIA_RPC_URLS,
  RISE_TESTNET_RPC_URL,
  ETHEREUM_MAINNET_RPC_URLS,
  BASE_MAINNET_RPC_URLS,
  ARBITRUM_MAINNET_RPC_URLS,
  RISE_MAINNET_RPC_URL,
} from "@/config/chains";

export const wagmiConfig = createConfig({
  chains: [
    ethereumMainnetChain, baseMainnetChain, arbitrumMainnetChain, riseMainnetChain,
    sepoliaChain, baseSepoliaChain, riseTestnetChain,
  ],
  connectors: [injected()],
  transports: {
    [ethereumMainnetChain.id]: fallback(
      ETHEREUM_MAINNET_RPC_URLS.map((url) => http(url, { timeout: 10_000 }))
    ),
    [baseMainnetChain.id]: fallback(
      BASE_MAINNET_RPC_URLS.map((url) => http(url, { timeout: 10_000 }))
    ),
    [arbitrumMainnetChain.id]: fallback(
      ARBITRUM_MAINNET_RPC_URLS.map((url) => http(url, { timeout: 10_000 }))
    ),
    [riseMainnetChain.id]: http(RISE_MAINNET_RPC_URL, { timeout: 10_000 }),
    [sepoliaChain.id]: fallback(
      SEPOLIA_RPC_URLS.map((url) => http(url, { timeout: 10_000 }))
    ),
    [baseSepoliaChain.id]: fallback(
      BASE_SEPOLIA_RPC_URLS.map((url) => http(url, { timeout: 10_000 }))
    ),
    [riseTestnetChain.id]: http(RISE_TESTNET_RPC_URL, { timeout: 10_000 }),
  },
  ssr: true,
});
