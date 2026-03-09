import { http, createConfig, fallback } from "wagmi";
import { injected } from "wagmi/connectors";
import {
  sepoliaChain,
  riseTestnetChain,
  ethereumMainnetChain,
  riseMainnetChain,
  SEPOLIA_RPC_URLS,
  RISE_TESTNET_RPC_URL,
  ETHEREUM_MAINNET_RPC_URLS,
  RISE_MAINNET_RPC_URL,
} from "@/config/chains";

export const wagmiConfig = createConfig({
  chains: [ethereumMainnetChain, riseMainnetChain, sepoliaChain, riseTestnetChain],
  connectors: [injected()],
  transports: {
    [ethereumMainnetChain.id]: fallback(
      ETHEREUM_MAINNET_RPC_URLS.map((url) => http(url, { timeout: 10_000 }))
    ),
    [riseMainnetChain.id]: http(RISE_MAINNET_RPC_URL, { timeout: 10_000 }),
    [sepoliaChain.id]: fallback(
      SEPOLIA_RPC_URLS.map((url) => http(url, { timeout: 10_000 }))
    ),
    [riseTestnetChain.id]: http(RISE_TESTNET_RPC_URL, { timeout: 10_000 }),
  },
  ssr: true,
});
