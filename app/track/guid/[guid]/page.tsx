import type { Metadata } from "next";
import { TrackPage } from "../../track-page";

type Props = { params: Promise<{ guid: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { guid } = await params;
  const short = guid.length > 12 ? `${guid.slice(0, 6)}...${guid.slice(-4)}` : guid;
  return {
    title: `Track GUID ${short} | RISE Global Deposit`,
    description: `Tracking bridge transaction by LayerZero GUID: ${guid}`,
  };
}

export default async function Page({ params }: Props) {
  const { guid } = await params;
  return <TrackPage initialHash={guid} lookupType="guid" />;
}
