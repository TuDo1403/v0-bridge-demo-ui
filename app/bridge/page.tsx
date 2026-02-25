import type { Metadata } from "next";
import { BridgePage } from "./bridge-page";

export const metadata: Metadata = {
  title: "Bridge | RISE Global Deposit",
  description: "Bridge assets between Sepolia and RISE Testnet via LayerZero",
};

export default function Page() {
  return <BridgePage />;
}
