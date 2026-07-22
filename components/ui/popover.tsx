import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

import { usePortalContainer } from "./portal-container";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;

type PopoverContentProps = ComponentProps<typeof PopoverPrimitive.Popup> & {
  children: ReactNode;
};

export function PopoverContent({ children, className, ...props }: PopoverContentProps) {
  const container = usePortalContainer();
  return (
    <PopoverPrimitive.Portal container={container}>
      <PopoverPrimitive.Positioner
        className="z-[2147483647]"
        align="start"
        side="top"
        sideOffset={8}
      >
        <PopoverPrimitive.Popup
          data-quotecue-portal=""
          className={cn(
            "qc-surface qc-elevated w-80 origin-[var(--transform-origin)] rounded-2xl border p-2 outline-none",
            className,
          )}
          {...props}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}
