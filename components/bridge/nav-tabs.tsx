"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ArrowLeftRight, Search, History } from "lucide-react";

const NAV_ITEMS = [
  { href: "/bridge", label: "Bridge", icon: ArrowLeftRight },
  { href: "/track", label: "Track", icon: Search },
  { href: "/history", label: "History", icon: History },
] as const;

export function NavTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 p-1 rounded-lg bg-muted/30 border border-border/50">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-colors",
              isActive
                ? "bg-primary/15 text-primary border border-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
