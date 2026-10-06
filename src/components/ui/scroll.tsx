import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Scroll({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("overflow-y-auto overscroll-contain", className)} {...props} />;
}
