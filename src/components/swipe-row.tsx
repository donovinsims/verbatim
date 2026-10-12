import { useRef, type PointerEvent, type ReactNode } from "react";
import { animateSpring, prefersReducedMotion, project, rubberband } from "@/lib/motion/spring";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  onDismiss: () => void;
  disabled?: boolean;
  className?: string;
  surfaceClassName?: string;
};

const THRESHOLD = 10;
const DISMISS_RATIO = 0.42;

export function SwipeRow({ children, onDismiss, disabled, className, surfaceClassName }: Props) {
  const rowRef = useRef<HTMLDivElement>(null);
  const xRef = useRef(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const lastX = useRef(0);
  const lastT = useRef(0);
  const vel = useRef(0);
  const axis = useRef<"undecided" | "x" | "y">("undecided");
  const dragging = useRef(false);
  const stopSpring = useRef<(() => void) | null>(null);
  const suppressClick = useRef(false);

  function setX(next: number) {
    xRef.current = next;
    const el = rowRef.current;
    if (el) el.style.transform = `translate3d(${next}px,0,0)`;
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (disabled || e.button !== 0) return;
    stopSpring.current?.();
    stopSpring.current = null;
    dragging.current = true;
    axis.current = "undecided";
    startX.current = e.clientX;
    startY.current = e.clientY;
    lastX.current = e.clientX;
    lastT.current = e.timeStamp;
    vel.current = 0;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (axis.current === "undecided") {
      if (Math.hypot(dx, dy) < THRESHOLD) return;
      axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (axis.current === "y") return;
    }
    if (axis.current !== "x") return;
    const dt = Math.max(8, e.timeStamp - lastT.current);
    vel.current = ((e.clientX - lastX.current) / dt) * 1000;
    lastX.current = e.clientX;
    lastT.current = e.timeStamp;
    const width = rowRef.current?.parentElement?.clientWidth ?? 280;
    const raw = dx;
    const next = raw > 0 ? rubberband(raw, width) : raw;
    setX(next);
  }

  function settle(velocity: number) {
    const width = rowRef.current?.parentElement?.clientWidth ?? 280;
    const current = xRef.current;
    const projected = current + project(velocity);
    const shouldDismiss = current < 0 && (projected < -width * DISMISS_RATIO || current < -width * DISMISS_RATIO);
    const target = shouldDismiss ? -width - 24 : 0;
    if (prefersReducedMotion()) {
      setX(target);
      if (shouldDismiss) onDismiss();
      else setX(0);
      return;
    }
    stopSpring.current = animateSpring(current, target, velocity, setX, (final) => {
      stopSpring.current = null;
      if (shouldDismiss || final < -width * 0.9) onDismiss();
    });
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    dragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (axis.current === "x") {
      suppressClick.current = true;
      settle(vel.current);
    }
    axis.current = "undecided";
  }

  return (
    <div className={cn("relative overflow-hidden rounded-[10px]", className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-end bg-danger px-4 text-xs font-medium text-primary-fg"
      >
        Remove
      </div>
      <div
        ref={rowRef}
        className={cn("relative touch-pan-y", surfaceClassName ?? "bg-bg-elevated")}
        style={{ willChange: disabled ? undefined : "transform" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={(e) => {
          if (!suppressClick.current) return;
          e.preventDefault();
          e.stopPropagation();
          suppressClick.current = false;
        }}
      >
        {children}
      </div>
    </div>
  );
}
