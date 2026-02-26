import type { Metadata } from "next";
import { TrackPage } from "./track-page";

export const metadata: Metadata = {
  title: "Track | RISE Global Deposit",
  description: "Track a bridge transaction by tx hash or LayerZero GUID",
};

export default function Page() {
  return <TrackPage />;
}
