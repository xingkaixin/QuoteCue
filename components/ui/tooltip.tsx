import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

import { usePortalContainer } from "./portal-container";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

type TooltipContentProps = ComponentProps<typeof TooltipPrimitive.Popup> & {
  children: ReactNode;
};

export function TooltipContent({ children, className, ...props }: TooltipContentProps) {
  const container = usePortalContainer();
  return (
    <TooltipPrimitive.Portal container={container}>
      <TooltipPrimitive.Positioner className="z-[2147483647]" sideOffset={7}>
        <TooltipPrimitive.Popup
          data-quotecue-portal=""
          className={cn(
            "max-w-72 origin-[var(--transform-origin)] rounded-lg bg-neutral-950 px-3 py-2 text-xs leading-5 text-white shadow-xl",
            className,
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="size-2 rotate-45 bg-neutral-950" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}
