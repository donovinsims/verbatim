/** Apple-style projection from Designing Fluid Interfaces. */
export function project(velocityPxPerSec: number, decelerationRate = 0.998): number {
  return (velocityPxPerSec / 1000) * (decelerationRate / (1 - decelerationRate));
}

export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  if (dimension <= 0) return 0;
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** Map Apple damping-ratio + response (seconds) to mass=1 stiffness/damping. */
export function appleSpring(dampingRatio: number, response: number): { stiffness: number; damping: number } {
  const omega = (2 * Math.PI) / Math.max(0.05, response);
  return {
    stiffness: omega * omega,
    damping: 2 * dampingRatio * omega,
  };
}

type SpringOpts = {
  stiffness?: number;
  damping?: number;
  restDelta?: number;
  restVelocity?: number;
};

/** Critically-damped-ish spring toward `target`, starting at `from` with `velocity`. */
export function animateSpring(
  from: number,
  target: number,
  velocity: number,
  onFrame: (value: number) => void,
  onSettle: (value: number) => void,
  opts: SpringOpts = {},
): () => void {
  const stiffness = opts.stiffness ?? 170;
  const damping = opts.damping ?? 26;
  const restDelta = opts.restDelta ?? 0.4;
  const restVelocity = opts.restVelocity ?? 12;
  let x = from;
  let v = velocity;
  let last = performance.now();
  let raf = 0;
  let stopped = false;

  const step = (now: number) => {
    if (stopped) return;
    const dt = Math.min(0.032, (now - last) / 1000);
    last = now;
    const spring = -stiffness * (x - target);
    const damper = -damping * v;
    v += (spring + damper) * dt;
    x += v * dt;
    if (Math.abs(x - target) < restDelta && Math.abs(v) < restVelocity) {
      onFrame(target);
      onSettle(target);
      return;
    }
    onFrame(x);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
