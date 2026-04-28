import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { FeedPage } from "./feed-page";

export const metadata = { title: "Request Feed – RISE Bridge" };

export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}>
      <FeedPage />
    </Suspense>
  );
}
