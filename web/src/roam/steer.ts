// Small geometry and easing helpers for the roaming squad (no React, no DOM writes).

export type P = { x: number; y: number };
export type Rect = { l: number; t: number; r: number; b: number };

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Exponential ease-out: fast departure, long soft arrival. */
export const easeOutExpo = (k: number) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k));
export const easeInOutCubic = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
/** A small overshoot for things that pop open (a dot unfolding into a character). */
export const easeOutBack = (k: number) => {
  const s = 1.5;
  return 1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2);
};

export function rectOf(el: Element | null | undefined, pad = 0): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { l: r.left - pad, t: r.top - pad, r: r.right + pad, b: r.bottom + pad };
}

export function centerOf(el: Element | null | undefined): P | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Distance from a point to a rectangle (0 inside), and the direction away from it. */
export function awayFrom(x: number, y: number, r: Rect): { d: number; nx: number; ny: number } {
  const cx = clamp(x, r.l, r.r);
  const cy = clamp(y, r.t, r.b);
  const dx = x - cx;
  const dy = y - cy;
  const d = Math.hypot(dx, dy);
  if (d > 0) return { d, nx: dx / d, ny: dy / d };
  // Inside: out through the nearest side.
  const sides = [x - r.l, r.r - x, y - r.t, r.b - y];
  const m = Math.min(...sides);
  if (m === sides[0]) return { d: 0, nx: -1, ny: 0 };
  if (m === sides[1]) return { d: 0, nx: 1, ny: 0 };
  if (m === sides[2]) return { d: 0, nx: 0, ny: -1 };
  return { d: 0, nx: 0, ny: 1 };
}

/** Turn angle `a` toward `b` by fraction `t`, the short way round. */
export function turnToward(a: number, b: number, t: number) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
