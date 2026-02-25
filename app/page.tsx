import dynamic from "next/dynamic";

const BridgeDashboard = dynamic(
  () => import("@/components/bridge/bridge-dashboard").then((m) => m.BridgeDashboard),
  { ssr: false }
);

export default function Home() {
  return <BridgeDashboard />;
}
