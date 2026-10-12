import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "default",
  ...props
}: React.ComponentProps<"span"> & { tone?: "default" | "ok" | "warn" | "paper" }) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] items-center rounded-[6px] px-1.5 text-[12px] font-medium leading-none",
        tone === "default" && "bg-bg-subtle text-muted",
        tone === "ok" && "bg-ok/8 text-ok",
        tone === "warn" && "bg-danger/8 text-danger-fg",
        tone === "paper" && "bg-black/4 text-paper-muted",
        className,
      )}
      {...props}
    />
  );
}
