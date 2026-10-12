import * as React from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      suppressHydrationWarning
      className={cn(
        "w-full min-h-28 max-w-full resize-y rounded-[10px] bg-bg-elevated px-[11px] py-3 text-[16px] text-fg shadow-[var(--shadow-input)] placeholder:text-subtle",
        "transition-[box-shadow] duration-150 ease-in-out",
        "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]",
        className,
      )}
      {...props}
    />
  );
}
