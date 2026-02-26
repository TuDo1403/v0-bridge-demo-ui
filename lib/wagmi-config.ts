import { http, createConfig, fallback } from "wagmi";
import { injected } from "wagmi/connectors";
import {
  sepoliaChain,
  riseTestnetChain,
  SEPOLIA_RPC_URLS,
  RISE_TESTNET_RPC_URL,
} from "@/config/chains";

export const wagmiConfig = createConfig({
  chains: [sepoliaChain, riseTestnetChain],
  connectors: [injected()],
  transports: {
    [sepoliaChain.id]: fallback(
      SEPOLIA_RPC_URLS.map((url) => http(url, { timeout: 10_000 }))
    ),
    [riseTestnetChain.id]: http(RISE_TESTNET_RPC_URL, { timeout: 10_000 }),
  },
  ssr: true,
});
