import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-11 w-full min-w-0 rounded-[10px] bg-bg-elevated px-[11px] text-[16px] text-fg shadow-[var(--shadow-input)] placeholder:text-subtle",
        "transition-[box-shadow] duration-150 ease-in-out",
        "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]",
        className,
      )}
      {...props}
    />
  );
}
