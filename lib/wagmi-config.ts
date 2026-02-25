import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { sepoliaChain, riseTestnetChain } from "@/config/chains";

export const wagmiConfig = createConfig({
  chains: [sepoliaChain, riseTestnetChain],
  connectors: [injected()],
  transports: {
    [sepoliaChain.id]: http(),
    [riseTestnetChain.id]: http(),
  },
  ssr: true,
});
