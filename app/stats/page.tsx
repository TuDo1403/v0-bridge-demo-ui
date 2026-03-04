import type { Metadata } from "next";
import { StatsPage } from "./stats-page";

export const metadata: Metadata = {
  title: "Stats | RISE Bridge",
  description: "Bridge analytics and operational health dashboard",
};

export default function Page() {
  return <StatsPage />;
}
