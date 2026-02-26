import type { Metadata } from "next";
import { HistoryPage } from "../history-page";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}): Promise<Metadata> {
  const { address } = await params;
  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
  return {
    title: `History ${short} | RISE Global Deposit`,
    description: `Bridge transaction history for ${short}`,
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  return <HistoryPage addressParam={address} />;
}
