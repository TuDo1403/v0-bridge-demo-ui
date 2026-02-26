import type { Metadata } from "next";
import { HistoryPage } from "./history-page";

export const metadata: Metadata = {
  title: "History | RISE Global Deposit",
  description: "View your bridge transaction history",
};

export default function Page() {
  return <HistoryPage />;
}
