import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function SwipeRow({
  children,
  onDismiss,
  disabled,
  label = "Remove",
}: {
  children: ReactNode;
  onDismiss: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="flex items-stretch gap-1">
      <div className="min-w-0 flex-1">{children}</div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="min-h-11 min-w-11 shrink-0 px-0"
        disabled={disabled}
        onClick={onDismiss}
        aria-label={label}
        title={disabled ? "A running job cannot be removed" : label}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
