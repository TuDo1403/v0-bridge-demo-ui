"use client";

import { cn } from "@/lib/utils";
import Image from "next/image";

/* ------------------------------------------------------------------ */
/*  Chain icons                                                        */
/* ------------------------------------------------------------------ */

function EthereumIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 256 417"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path d="M127.961 0L125.166 9.5V285.168L127.961 287.958L255.923 212.32L127.961 0Z" fill="currentColor" opacity={0.6} />
      <path d="M127.962 0L0 212.32L127.962 287.959V154.158V0Z" fill="currentColor" opacity={0.45} />
      <path d="M127.961 312.187L126.386 314.107V412.306L127.961 416.905L255.999 236.587L127.961 312.187Z" fill="currentColor" opacity={0.6} />
      <path d="M127.962 416.905V312.187L0 236.587L127.962 416.905Z" fill="currentColor" opacity={0.45} />
      <path d="M127.961 287.958L255.922 212.32L127.961 154.159V287.958Z" fill="currentColor" opacity={0.8} />
      <path d="M0.001 212.32L127.962 287.958V154.159L0.001 212.32Z" fill="currentColor" opacity={0.6} />
    </svg>
  );
}

function RiseIcon({ className }: { className?: string }) {
  return (
    <Image
      src="/icons/rise.png"
      alt=""
      width={24}
      height={24}
      className={cn("rounded-full", className)}
      aria-hidden="true"
    />
  );
}

function LayerZeroIcon({ className }: { className?: string }) {
  return (
    <Image
      src="/icons/layerzero.svg"
      alt=""
      width={34}
      height={34}
      className={cn("rounded-full", className)}
      aria-hidden="true"
    />
  );
}

function BaseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 111 111"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="55.5" cy="55.5" r="55.5" fill="#0052FF" />
      <path
        d="M55.5 95C77.315 95 95 77.315 95 55.5C95 33.685 77.315 16 55.5 16C34.874 16 18.076 31.693 16.18 51.5H67.5V59.5H16.18C18.076 79.307 34.874 95 55.5 95Z"
        fill="white"
      />
    </svg>
  );
}

function ArbitrumIcon({ className }: { className?: string }) {
  return (
    <Image
      src="/icons/arbitrum.svg"
      alt=""
      width={24}
      height={24}
      className={cn("rounded-full", className)}
      aria-hidden="true"
    />
  );
}

const CHAIN_ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  ethereum: EthereumIcon,
  base: BaseIcon,
  arbitrum: ArbitrumIcon,
  rise: RiseIcon,
  layerzero: LayerZeroIcon,
};

export function ChainIcon({
  chainKey,
  className,
}: {
  chainKey?: string;
  className?: string;
}) {
  const Icon = chainKey ? CHAIN_ICON_MAP[chainKey] : null;
  if (!Icon) return null;
  return <Icon className={cn("shrink-0", className)} />;
}

/* ------------------------------------------------------------------ */
/*  Token icons                                                        */
/* ------------------------------------------------------------------ */

function UsdcIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      <path
        d="M20.4 18.2C20.4 15.9 19.1 15.1 16.5 14.8C14.6 14.5 14.2 14 14.2 13.1C14.2 12.2 14.8 11.6 16 11.6C17.1 11.6 17.7 12 18 12.9C18.1 13.1 18.2 13.2 18.4 13.2H19.5C19.7 13.2 19.9 13 19.9 12.8V12.7C19.6 11.5 18.6 10.5 17.3 10.3V9C17.3 8.8 17.1 8.6 16.9 8.6H16C15.8 8.6 15.6 8.8 15.6 9V10.3C13.9 10.5 12.8 11.7 12.8 13.2C12.8 15.4 14 16.2 16.6 16.5C18.4 16.9 19 17.3 19 18.3C19 19.3 18.1 20 16.9 20C15.3 20 14.8 19.3 14.6 18.4C14.5 18.2 14.4 18.1 14.2 18.1H13C12.8 18.1 12.6 18.3 12.6 18.5V18.6C12.9 20 13.8 21 15.6 21.3V22.6C15.6 22.8 15.8 23 16 23H16.9C17.1 23 17.3 22.8 17.3 22.6V21.3C19 21 20.4 19.9 20.4 18.2Z"
        fill="white"
      />
      <path
        d="M13.3 24C9.5 22.6 7.6 18.5 9 14.7C9.8 12.7 11.4 11.1 13.3 10.3C13.5 10.2 13.6 10 13.6 9.8V8.9C13.6 8.7 13.5 8.5 13.3 8.5H13.2C8.6 10 6 14.9 7.5 19.5C8.4 22.1 10.4 24.1 13.2 25C13.4 25.1 13.6 25 13.6 24.8V23.9C13.6 23.7 13.5 23.5 13.3 23.5V24ZM18.7 8.5C18.5 8.4 18.3 8.5 18.3 8.7V9.6C18.3 9.8 18.4 10 18.7 10.1C22.5 11.5 24.4 15.6 23 19.4C22.2 21.4 20.6 23 18.7 23.8C18.5 23.9 18.4 24.1 18.4 24.3V25.2C18.4 25.4 18.5 25.6 18.7 25.6H18.8C23.4 24.1 26 19.2 24.5 14.6C23.6 12 21.5 10 18.7 9.1V8.5Z"
        fill="white"
      />
    </svg>
  );
}

function EthTokenIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-[#627EEA] text-white",
        className,
      )}
      aria-hidden="true"
    >
      <EthereumIcon className="h-[70%] w-[70%]" />
    </span>
  );
}

function WbtcIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="16" fill="#F7931A" />
      <path
        d="M21.6 13.1c.3-2.1-1.3-3.3-3.6-4l.7-2.7-1.6-.4-.7 2.6-1.3-.3.7-2.6-1.6-.4-.7 2.7-1-.2-2.2-.6-.4 1.8s1.2.3 1.2.3c.7.2.8.6.8 1l-.8 3.1.2.1-.2-.1-1.1 4.4c-.1.2-.3.5-.8.4 0 0-1.2-.3-1.2-.3l-.8 1.9 2.1.5 1.2.3-.7 2.7 1.6.4.7-2.7 1.3.3-.7 2.7 1.6.4.7-2.7c2.8.5 4.9.3 5.8-2.2.7-2-.1-3.1-1.5-3.9 1.1-.2 1.9-1 2.1-2.2Zm-3.8 5c-.5 2-4 .9-5.1.6l.9-3.6c1.1.3 4.7.8 4.2 3Zm.5-5c-.5 1.8-3.4.9-4.3.7l.8-3.3c1 .2 4 .7 3.5 2.6Z"
        fill="white"
      />
    </svg>
  );
}

const TOKEN_ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  ETH: EthTokenIcon,
  USDC: UsdcIcon,
  WBTC: WbtcIcon,
};

export function TokenIcon({
  tokenKey,
  className,
}: {
  tokenKey?: string;
  className?: string;
}) {
  const normalizedTokenKey = tokenKey?.replace(/\.e$/i, "");
  const Icon = normalizedTokenKey
    ? TOKEN_ICON_MAP[normalizedTokenKey] ?? TOKEN_ICON_MAP[normalizedTokenKey.toUpperCase()]
    : null;
  if (!Icon) return null;
  return <Icon className={cn("shrink-0", className)} />;
}
