import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "focus-visible:ring-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-full font-medium transition-[background-color,border-color,color,filter,transform] outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:pointer-events-none disabled:opacity-45 motion-reduce:transition-none",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-foreground hover:brightness-110 active:scale-[0.98]",
        surface:
          "border border-line bg-panel text-foreground hover:border-muted hover:text-foreground active:scale-[0.98]",
        ghost:
          "border border-line bg-transparent text-muted hover:border-muted hover:text-foreground",
      },
      size: {
        default: "h-12 px-5 text-[0.9375rem]",
        compact: "h-8 px-3 text-xs",
        icon: "size-8 p-0",
      },
    },
    defaultVariants: {
      variant: "surface",
      size: "default",
    },
  },
);

type ButtonProps = ComponentProps<typeof ButtonPrimitive> & VariantProps<typeof buttonVariants>;

export function Button({ className, size, variant, ...props }: ButtonProps) {
  return (
    <ButtonPrimitive className={cn(buttonVariants({ size, variant }), className)} {...props} />
  );
}
