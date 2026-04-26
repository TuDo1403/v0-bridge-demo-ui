"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ArrowLeftRight, Search, History, ArrowDownToLine, BarChart3, List } from "lucide-react";

const NAV_ITEMS = [
  { href: "/bridge", label: "Bridge", icon: ArrowLeftRight },
  { href: "/track", label: "Track", icon: Search },
  { href: "/history", label: "History", icon: History },
  { href: "/recover", label: "Recover", icon: ArrowDownToLine },
  { href: "/stats", label: "Stats", icon: BarChart3 },
  { href: "/feed", label: "Feed", icon: List },
] as const;

export function NavTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-0.5 sm:gap-1 p-0.5 sm:p-1 rounded-lg bg-muted/30 border border-border/50">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-mono transition-colors",
              isActive
                ? "bg-primary/15 text-primary border border-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
