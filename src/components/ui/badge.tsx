import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-(--obsidian-dashboard-shell-muted) px-2.5 py-0.5 text-xs font-medium text-(--obsidian-dashboard-shell-text-muted)",
        className,
      )}
      {...props}
    />
  );
}
