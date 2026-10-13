import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-11 w-full rounded-lg bg-(--obsidian-dashboard-shell-control) px-3 text-sm text-(--obsidian-dashboard-shell-foreground)",
        "placeholder:text-(--obsidian-dashboard-shell-text-subtle) ring-0 outline-none",
        "focus-visible:ring-2 focus-visible:ring-(--obsidian-dashboard-shell-ring)",
        className,
      )}
      {...props}
    />
  );
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg bg-(--obsidian-dashboard-shell-control) px-3 py-3 text-sm text-(--obsidian-dashboard-shell-foreground) leading-relaxed",
        "placeholder:text-(--obsidian-dashboard-shell-text-subtle) ring-0 outline-none resize-y min-h-24",
        "focus-visible:ring-2 focus-visible:ring-(--obsidian-dashboard-shell-ring)",
        className,
      )}
      {...props}
    />
  );
}
