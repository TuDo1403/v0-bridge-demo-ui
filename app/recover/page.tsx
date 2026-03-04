import type { Metadata } from "next";
import { RecoverLookup } from "@/components/bridge/recover-lookup";

export const metadata: Metadata = {
  title: "Recover Tokens | RISE Bridge",
  description: "Reconstruct a vault address and recover stuck tokens",
};

export default function Page() {
  return <RecoverLookup />;
}
