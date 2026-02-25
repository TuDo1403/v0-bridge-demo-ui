import type { Metadata } from "next";
import { HistoryPage } from "./history-page";

export const metadata: Metadata = {
  title: "History | RISE Global Deposit",
  description: "View all your recent bridge sessions",
};

export default function Page() {
  return <HistoryPage />;
}
