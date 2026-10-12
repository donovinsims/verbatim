import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { appleSpring, animateSpring, prefersReducedMotion, project, rubberband } from "@/lib/motion/spring";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  title?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  size?: "page" | "action";
  tone?: "paper" | "grouped";
  stageRef?: RefObject<HTMLElement | null>;
  stacked?: boolean;
  labelledBy?: string;
};

const THRESHOLD = 10;
const FLICK = 650;

let lockCount = 0;
let lockedY = 0;

function lockBody() {
  if (typeof document === "undefined") return;
  if (lockCount === 0) {
    lockedY = window.scrollY;
    const { body } = document;
    body.style.position = "fixed";
    body.style.top = `-${lockedY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
  }
  lockCount += 1;
}

function unlockBody() {
  if (typeof document === "undefined") return;
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount > 0) return;
  const { body } = document;
  body.style.position = "";
  body.style.top = "";
  body.style.left = "";
  body.style.right = "";
  body.style.width = "";
  window.scrollTo(0, lockedY);
}

export function AppSheet({
  open,
  onOpenChange,
  children,
  title,
  leading,
  trailing,
  size = "page",
  tone = "paper",
  stageRef,
  stacked = false,
  labelledBy,
}: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const yRef = useRef(0);
  const vel = useRef(0);
  const lastY = useRef(0);
  const lastT = useRef(0);
  const grabOffset = useRef(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const axis = useRef<"undecided" | "x" | "y">("undecided");
  const dragging = useRef(false);
  const fromBody = useRef(false);
  const stopSpring = useRef<(() => void) | null>(null);
  const gestureClose = useRef(false);
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  function closedY() {
    return typeof window === "undefined" ? 900 : window.innerHeight;
  }

  function apply(y: number) {
    yRef.current = y;
    const sheet = sheetRef.current;
    if (sheet) sheet.style.transform = `translate3d(-50%, ${y}px, 0)`;
    const overlay = overlayRef.current;
    const limit = Math.max(1, closedY());
    const p = Math.max(0, Math.min(1, 1 - y / limit));
    if (overlay) {
      overlay.style.background = `rgb(0 0 0 / ${stacked ? 0.2 * p : 0.32 * p})`;
      overlay.style.pointerEvents = p > 0.02 ? "auto" : "none";
    }
    if (!stacked && stageRef?.current) {
      const stage = stageRef.current;
      stage.style.transformOrigin = "50% 0%";
      stage.style.transform = `translate3d(0, ${10 * p}px, 0) scale(${1 - 0.08 * p})`;
      stage.style.borderRadius = `${14 * p}px`;
      stage.style.overflow = p > 0.04 ? "hidden" : "";
    }
  }

  function clearStage() {
    if (stacked || !stageRef?.current) return;
    stageRef.current.style.transform = "";
    stageRef.current.style.borderRadius = "";
    stageRef.current.style.overflow = "";
  }

  function springTo(target: number, velocity: number, flick: boolean, onDone?: () => void) {
    stopSpring.current?.();
    const from = yRef.current;
    if (prefersReducedMotion()) {
      apply(target);
      onDone?.();
      return;
    }
    const params = flick && Math.abs(velocity) > FLICK ? appleSpring(0.8, 0.3) : appleSpring(1, 0.32);
    stopSpring.current = animateSpring(
      from,
      target,
      velocity,
      apply,
      (final) => {
        stopSpring.current = null;
        apply(final);
        onDone?.();
      },
      params,
    );
  }

  useLayoutEffect(() => {
    if (!mounted) return;
    if (yRef.current === 0 && open) apply(closedY());
  }, [mounted]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mounted) return;
    if (dragging.current || gestureClose.current) return;
    if (open) springTo(0, 0, false);
    else {
      springTo(closedY(), 0, false, () => {
        clearStage();
        setMounted(false);
      });
    }
  }, [open, mounted]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mounted) return;
    lockBody();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unlockBody();
      window.removeEventListener("keydown", onKey);
    };
  }, [mounted, onOpenChange]);

  function onChromeDown(e: PointerEvent<HTMLElement>, body = false) {
    if (e.button !== 0) return;
    const node = e.target as HTMLElement | null;
    if (node?.closest("button, a, input, textarea, [role='button']")) return;
    fromBody.current = body;
    if (body && (bodyRef.current?.scrollTop ?? 0) > 0) return;
    stopSpring.current?.();
    stopSpring.current = null;
    dragging.current = true;
    axis.current = "undecided";
    grabOffset.current = e.clientY - yRef.current;
    startX.current = e.clientX;
    startY.current = e.clientY;
    lastY.current = e.clientY;
    lastT.current = e.timeStamp;
    vel.current = 0;
  }

  function onMove(e: PointerEvent<HTMLElement>) {
    if (!dragging.current) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (axis.current === "undecided") {
      if (Math.hypot(dx, dy) < THRESHOLD) return;
      axis.current = Math.abs(dy) >= Math.abs(dx) ? "y" : "x";
      if (axis.current === "x") return;
      if (fromBody.current && dy < 0) {
        dragging.current = false;
        axis.current = "undecided";
        return;
      }
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    if (axis.current !== "y") return;
    const dt = Math.max(8, e.timeStamp - lastT.current);
    vel.current = ((e.clientY - lastY.current) / dt) * 1000;
    lastY.current = e.clientY;
    lastT.current = e.timeStamp;
    const raw = e.clientY - grabOffset.current;
    const next = raw < 0 ? -rubberband(-raw, closedY()) : raw;
    apply(next);
  }

  function onUp(e: PointerEvent<HTMLElement>) {
    if (!dragging.current) return;
    dragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (axis.current !== "y") {
      axis.current = "undecided";
      return;
    }
    axis.current = "undecided";
    const current = yRef.current;
    const limit = closedY();
    const projected = current + project(vel.current);
    let target = 0;
    if (vel.current > FLICK) target = limit;
    else if (vel.current < -FLICK) target = 0;
    else target = projected > limit * 0.28 ? limit : 0;
    const closing = target === limit;
    if (closing) gestureClose.current = true;
    springTo(target, vel.current, Math.abs(vel.current) > FLICK, () => {
      if (closing) {
        clearStage();
        gestureClose.current = false;
        setMounted(false);
      }
    });
    if (closing) onOpenChange(false);
  }

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={overlayRef}
      className={cn("sheet-overlay", stacked && "sheet-overlay-stacked")}
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          "app-sheet",
          size === "action" && "app-sheet-action",
          tone === "paper" ? "app-sheet-paper" : "app-sheet-grouped",
        )}
        style={{ transform: `translate3d(-50%, ${closedY()}px, 0)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sheet-chrome"
          onPointerDown={(e) => onChromeDown(e, false)}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <div className="sheet-grabber" aria-hidden />
          <div className="sheet-nav">
            <div className="sheet-nav-side justify-start">{leading}</div>
            <h2 id={labelledBy} className="sheet-nav-title">
              {title}
            </h2>
            <div className="sheet-nav-side justify-end">{trailing}</div>
          </div>
        </div>
        <div
          ref={bodyRef}
          className="sheet-body scroll-pane"
          onPointerDown={(e) => onChromeDown(e, true)}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
