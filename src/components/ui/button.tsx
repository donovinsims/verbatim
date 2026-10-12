import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[box-shadow,opacity] duration-150 ease-in-out focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/24 disabled:pointer-events-none disabled:opacity-[0.64] after:absolute after:left-1/2 after:top-1/2 after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:opacity-80",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-fg shadow-[var(--shadow-primary)] hover:enabled:opacity-90 active:enabled:shadow-[var(--shadow-pressed)]",
        secondary:
          "bg-bg-subtle text-fg hover:enabled:opacity-90 active:enabled:opacity-80",
        ghost: "text-fg hover:enabled:bg-bg-subtle",
        outline:
          "bg-bg-elevated text-fg shadow-[var(--shadow-border)] hover:enabled:bg-bg-subtle",
        paper:
          "bg-paper text-paper-fg shadow-[var(--shadow-paper)]",
        tint: "bg-transparent text-fg",
        destructive:
          "bg-danger text-primary-fg shadow-[inset_0_1px_rgb(255_255_255_/_0.16),0_1px_2px_rgb(251_44_54_/_0.24)] hover:enabled:opacity-90",
      },
      size: {
        default: "h-9 rounded-[10px] px-[11px] text-[14px] leading-[1.43]",
        sm: "h-9 rounded-[10px] px-[11px] text-[14px] leading-[1.43]",
        lg: "h-11 rounded-[10px] px-4 text-[14px] leading-[1.43]",
        icon: "size-9 rounded-[10px]",
        "icon-sm": "size-9 rounded-[10px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
