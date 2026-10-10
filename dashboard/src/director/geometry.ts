import type { Point } from "../mood/attention";
import type { Viewport } from "@swarm/shared/types";
export function mapPoint(
  point: Point,
  viewport: Viewport,
  size: Viewport,
): Point {
  return {
    x: (point.x * size.width) / viewport.width,
    y: (point.y * size.height) / viewport.height,
  };
}
export function arc(from: Point, to: Point, lift = 60): Point[] {
  const control = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - lift };
  return Array.from({ length: 21 }, (_, i) => {
    const t = i / 20,
      u = 1 - t;
    return {
      x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
      y: u * u * from.y + 2 * u * t * control.y + t * t * to.y,
    };
  });
}
export function center(element: Element | null): Point | undefined {
  if (!element) return;
  const r = element.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}
