import { useEffect, useRef } from "react";
import type { MotionValue } from "motion/react";

// One canvas and one frame callback for all five plumes. Faces stay on a layer above it.
export function SquadFire({
  active,
  reduced,
  position,
}: {
  active: boolean;
  reduced: boolean;
  position: MotionValue<string>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    const parent = element?.parentElement;
    const ctx = element?.getContext("2d");
    if (!element || !parent || !ctx || !active) return;
    let frame = 0;
    let width = 0,
      height = 0,
      rowWidth = 0,
      rowLeft = 0;
    let centers: { x: number; y: number; radius: number }[] = [];
    const started = performance.now();
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      const row = parent.getBoundingClientRect();
      rowWidth = row.width;
      rowLeft = row.x - bounds.x;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      width = bounds.width;
      height = bounds.height;
      element.width = Math.round(width * dpr);
      element.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      centers = [...parent.querySelectorAll<HTMLElement>(".seat-art")].map(
        (seat) => {
          const body = seat.querySelector<HTMLElement>(".agent-body")!;
          const style = getComputedStyle(body);
          const scale = Number(style.getPropertyValue("--agent-scale")) || 0.72;
          const size = body.offsetWidth * scale;
          const box = seat.getBoundingClientRect();
          return {
            x: box.x + box.width / 2 - bounds.x,
            y: box.y + parseFloat(style.top) + size / 2 - bounds.y,
            radius: size * 0.47,
          };
        },
      );
    };
    const plume = (
      x: number,
      base: number,
      radius: number,
      tall: number,
      t: number,
      phase: number,
    ) => {
      const sway = Math.sin(t * 2.7 + phase) * radius * 0.32;
      const curl = Math.sin(t * 4.2 + phase * 1.6);
      ctx.beginPath();
      ctx.moveTo(x - radius * 0.7, base);
      ctx.bezierCurveTo(
        x - radius * 1.4,
        base - tall * 0.03,
        x - radius * 1.3,
        base - tall * 0.34,
        x - radius * 0.93,
        base - tall * 0.53,
      );
      ctx.bezierCurveTo(
        x - radius * 1.02,
        base - tall * 0.32,
        x - radius * 0.55,
        base - tall * 0.4,
        x - radius * 0.63 + sway,
        base - tall * 0.77,
      );
      ctx.bezierCurveTo(
        x - radius * 0.18,
        base - tall * 0.63,
        x - radius * 0.16,
        base - tall * 0.44,
        x - radius * 0.17,
        base - tall * 0.55,
      );
      ctx.bezierCurveTo(
        x + radius * 0.32,
        base - tall * 0.7,
        x - radius * 0.35 + sway,
        base - tall * 0.86,
        x + sway + curl * 3,
        base - tall,
      );
      ctx.bezierCurveTo(
        x + radius * 0.76 + sway,
        base - tall * 0.8,
        x + radius * 0.02,
        base - tall * 0.55,
        x + radius * 0.4,
        base - tall * 0.43,
      );
      ctx.bezierCurveTo(
        x + radius * 0.7,
        base - tall * 0.51,
        x + radius * 0.85,
        base - tall * 0.63,
        x + radius * 0.76 + sway,
        base - tall * 0.74,
      );
      ctx.bezierCurveTo(
        x + radius * 1.3,
        base - tall * 0.55,
        x + radius * 0.9,
        base - tall * 0.35,
        x + radius * 1.18,
        base - tall * 0.24,
      );
      ctx.bezierCurveTo(
        x + radius * 1.38,
        base - tall * 0.08,
        x + radius * 0.9,
        base + 2,
        x - radius * 0.7,
        base,
      );
      ctx.closePath();
    };
    const draw = (now: number) => {
      const t = reduced ? 2.4 : now / 1000;
      const ignition = reduced ? 1 : Math.min(1, (now - started) / 450);
      ctx.clearRect(0, 0, width, height);
      centers.forEach(({ x: seatedX, y, radius }, i) => {
        const x =
          i === 4
            ? rowLeft + (rowWidth * parseFloat(position.get())) / 100
            : seatedX;
        const phase = i * 2.1;
        const base = y + radius * 0.96;
        const tall =
          radius *
          (3.0 + Math.sin(t * 3.2 + phase) * 0.45) *
          (0.4 + ignition * 0.6);
        const glow = ctx.createRadialGradient(
          x,
          y,
          radius * 0.6,
          x,
          y,
          radius * 1.9,
        );
        glow.addColorStop(0, "#ffb13d50");
        glow.addColorStop(1, "#ff9a2900");
        ctx.fillStyle = glow;
        ctx.fillRect(x - radius * 2, y - radius * 2, radius * 4, radius * 4);
        const outer = ctx.createLinearGradient(x, base - tall, x, base);
        outer.addColorStop(0, "#ffb94b00");
        outer.addColorStop(0.12, "#ffbc46dd");
        outer.addColorStop(0.55, "#ff752bf0");
        outer.addColorStop(1, "#ff5122aa");
        ctx.fillStyle = outer;
        ctx.filter = "blur(1px)";
        plume(x, base, radius * 1.08, tall, t, phase);
        ctx.fill();
        ctx.filter = "none";
        const inner = ctx.createLinearGradient(x, base - tall * 0.84, x, base);
        inner.addColorStop(0, "#ffe17b00");
        inner.addColorStop(0.22, "#ffe285f0");
        inner.addColorStop(1, "#fff1a8e0");
        ctx.fillStyle = inner;
        plume(
          x + Math.sin(t * 4 + phase) * 2,
          base - 1,
          radius * 0.86,
          tall * 0.83,
          t + 0.22,
          phase,
        );
        ctx.fill();
        ctx.fillStyle = "#fff4c0a0";
        plume(x, base - 1, radius * 0.63, tall * 0.61, t + 0.5, phase + 1);
        ctx.fill();
        // Three rising embers per bot, with a gentle fade and no particle allocations.
        if (!reduced)
          for (let n = 0; n < 3; n++) {
            const progress = (t * 0.55 + i * 0.19 + n / 3) % 1;
            const ex =
              x + Math.sin(i * 7 + n * 3) * radius + Math.sin(t * 2 + n) * 4;
            const ey = base - tall * 0.4 - progress * tall * 0.8;
            ctx.globalAlpha = Math.sin(progress * Math.PI) * 0.6 * ignition;
            ctx.fillStyle = n % 2 ? "#ff9c30" : "#ffd377";
            ctx.beginPath();
            ctx.ellipse(ex, ey, 1, 1.8, 0.3, 0, Math.PI * 2);
            ctx.fill();
          }
        ctx.globalAlpha = 1;
      });
      if (!reduced) frame = requestAnimationFrame(draw);
    };
    const observer = new ResizeObserver(() => {
      measure();
      if (reduced) draw(performance.now());
    });
    const unsubscribe = reduced
      ? position.on("change", () => draw(performance.now()))
      : () => {};
    observer.observe(parent);
    measure();
    draw(performance.now());
    return () => {
      unsubscribe();
      observer.disconnect();
      cancelAnimationFrame(frame);
      ctx.clearRect(0, 0, width, height);
    };
  }, [active, reduced, position]);
  return (
    <canvas
      ref={canvas}
      className="squad-energy"
      data-fire={active ? (reduced ? "still" : "flowing") : "paused"}
      aria-hidden="true"
    />
  );
}
