import type { Metadata } from "next";
import { BridgePage } from "./bridge-page";

export const metadata: Metadata = {
  title: "Bridge | RISE Bridge",
  description: "Deposit and withdraw assets between Ethereum and RISE Chain via LayerZero",
};

export default function Page() {
  return <BridgePage />;
}
