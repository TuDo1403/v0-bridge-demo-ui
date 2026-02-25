"use client";

import { cn } from "@/lib/utils";

type ChainIconKey = "ethereum" | "rise";

function EthereumIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M12 1.5L5.5 12.25L12 16.5L18.5 12.25L12 1.5Z"
        fill="currentColor"
        opacity={0.6}
      />
      <path
        d="M12 1.5L5.5 12.25L12 9.75L12 1.5Z"
        fill="currentColor"
        opacity={0.45}
      />
      <path
        d="M12 9.75L5.5 12.25L12 16.5V9.75Z"
        fill="currentColor"
        opacity={0.8}
      />
      <path
        d="M12 17.75L5.5 13.5L12 22.5L18.5 13.5L12 17.75Z"
        fill="currentColor"
        opacity={0.6}
      />
      <path
        d="M12 17.75L5.5 13.5L12 22.5V17.75Z"
        fill="currentColor"
        opacity={0.45}
      />
    </svg>
  );
}

function RiseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Upward arrow / rising chevron */}
      <path
        d="M12 3L20 13H15V21H9V13H4L12 3Z"
        fill="currentColor"
        opacity={0.7}
      />
      <path
        d="M12 3L4 13H9V21H12V13V3Z"
        fill="currentColor"
        opacity={0.5}
      />
    </svg>
  );
}

const ICON_MAP: Record<ChainIconKey, React.FC<{ className?: string }>> = {
  ethereum: EthereumIcon,
  rise: RiseIcon,
};

export function ChainIcon({
  chainKey,
  className,
}: {
  chainKey?: string;
  className?: string;
}) {
  const Icon = chainKey ? ICON_MAP[chainKey as ChainIconKey] : null;
  if (!Icon) return null;
  return <Icon className={cn("h-4 w-4", className)} />;
}
