import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "qc-surface qc-focus min-h-20 w-full resize-none rounded-lg border px-3 py-2 text-sm placeholder:opacity-70",
        className,
      )}
      {...props}
    />
  );
}
