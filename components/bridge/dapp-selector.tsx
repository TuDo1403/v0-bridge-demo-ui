"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDappList, type ValidatedDapp } from "@/hooks/use-dapp-list";
import { Loader2 } from "lucide-react";

interface DappSelectorProps {
  sourceChainId: number;
  dappId: number;
  onDappChange: (dappId: number) => void;
}

export function DappSelector({
  sourceChainId,
  dappId,
  onDappChange,
}: DappSelectorProps) {
  const { dapps, isLoading } = useDappList(sourceChainId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/30 border border-border text-xs font-mono text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading dapps...
      </div>
    );
  }

  // If only one dapp available, don't show selector
  const availableDapps = dapps.filter((d) => d.available);
  if (availableDapps.length <= 1) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        Bridge Mode
      </span>
      <Select
        value={String(dappId)}
        onValueChange={(val) => onDappChange(Number(val))}
      >
        <SelectTrigger className="w-full bg-muted/30 font-mono text-sm h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {dapps.map((d) => (
            <SelectItem
              key={d.dappId}
              value={String(d.dappId)}
              disabled={!d.available}
              className="font-mono text-sm"
            >
              <span className="flex flex-col">
                <span>{d.label}</span>
                <span className="text-[10px] text-muted-foreground">
                  {d.description}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
