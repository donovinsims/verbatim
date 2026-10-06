import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "ghost" | "paper" | "danger" | "chip";
type Size = "sm" | "md";

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
        "disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" ? "min-h-10 px-3 text-sm" : "min-h-11 px-4 text-sm",
        variant === "primary" && "bg-fg text-ink hover:bg-fg/90",
        variant === "ghost" && "bg-transparent text-fg/80 hover:bg-fg/10 hover:text-fg",
        variant === "paper" && "bg-ink text-paper hover:bg-ink/90",
        variant === "danger" && "bg-transparent text-danger hover:bg-danger/10",
        variant === "chip" && "rounded-full bg-fg/8 text-fg/80 hover:bg-fg/12 hover:text-fg",
        className,
      )}
      {...props}
    />
  );
}
