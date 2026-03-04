import type { Metadata } from "next";
import { RecoverPage } from "../recover-page";

type Props = { params: Promise<{ address: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  const short = address.length > 12 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
  return {
    title: `Recover ${short} | RISE Bridge`,
    description: `Recover tokens from vault ${address}`,
  };
}

export default async function Page({ params }: Props) {
  const { address } = await params;
  return <RecoverPage vaultAddress={address} />;
}
