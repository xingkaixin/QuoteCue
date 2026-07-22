import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors outline-none disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-blue-500/45",
  {
    variants: {
      variant: {
        default: "bg-neutral-950 text-white hover:bg-neutral-800",
        ghost: "text-neutral-700 hover:bg-neutral-100",
        outline: "border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50",
      },
      size: {
        default: "h-9 px-3.5",
        icon: "size-8",
        sm: "h-8 px-3 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, size, type = "button", variant, ...props },
  ref,
) {
  return (
    <button
      className={cn(buttonVariants({ size, variant }), className)}
      ref={ref}
      type={type}
      {...props}
    />
  );
});
