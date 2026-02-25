import type { Metadata } from "next";
import { TrackPage } from "../../track-page";

type Props = { params: Promise<{ hash: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hash } = await params;
  const short = hash.length > 12 ? `${hash.slice(0, 6)}...${hash.slice(-4)}` : hash;
  return {
    title: `Track Tx ${short} | RISE Global Deposit`,
    description: `Tracking bridge transaction by tx hash: ${hash}`,
  };
}

export default async function Page({ params }: Props) {
  const { hash } = await params;
  return <TrackPage initialHash={hash} lookupType="tx" />;
}
