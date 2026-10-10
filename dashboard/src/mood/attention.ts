export interface Point { x: number; y: number }
export function lookOffset(from: Point, target?: Point): Point {
  if (!target) return { x: 0, y: 0 };
  const dx = target.x - from.x, dy = target.y - from.y, distance = Math.hypot(dx, dy);
  const scale = distance ? Math.min(3, distance) / distance : 0;
  return { x: dx * scale, y: dy * scale };
}
export function attention(from: Point, targets: { action?: Point; social?: Point; pointer?: Point; idle?: Point }) {
  return lookOffset(from, targets.action ?? targets.social ?? targets.pointer ?? targets.idle);
}
