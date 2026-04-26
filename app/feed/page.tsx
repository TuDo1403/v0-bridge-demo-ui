import type { Metadata } from "next";

import { FeedPage } from "./feed-page";

export const metadata: Metadata = { title: "Request Feed – RISE Bridge" };

export default function Page() {
  return <FeedPage />;
}
