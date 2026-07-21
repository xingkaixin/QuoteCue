import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-20 w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-950 outline-none placeholder:text-neutral-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15",
        className,
      )}
      {...props}
    />
  );
}
