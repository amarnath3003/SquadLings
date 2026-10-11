import { useEffect, useRef } from "react";

// One canvas and one frame callback for all five plumes. Faces stay on a layer above it.
export function SquadFire({
  active,
  reduced,
}: {
  active: boolean;
  reduced: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    const parent = element?.parentElement;
    const ctx = element?.getContext("2d");
    if (!element || !parent || !ctx || !active) return;
    let frame = 0;
    let width = 0,
      height = 0;
    let centers: { x: number; y: number; radius: number }[] = [];
    const started = performance.now();
    const flameColor = getComputedStyle(parent)
      .getPropertyValue("--event-orange")
      .trim();
    const flameHeight =
      Number(getComputedStyle(parent).getPropertyValue("--flame-height")) || 3;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      // Draw in local CSS pixels, even when the film scales the entire stage.
      width = element.clientWidth;
      height = element.clientHeight;
      const zoom = bounds.width / width || 1;
      const resolution = Math.min(dpr * zoom, 4);
      element.width = Math.round(width * resolution);
      element.height = Math.round(height * resolution);
      ctx.setTransform(resolution, 0, 0, resolution, 0, 0);
      centers = [...parent.querySelectorAll<HTMLElement>(".seat-art")].map(
        (seat) => {
          const body = seat.querySelector<HTMLElement>(".agent-body")!;
          const box = body.getBoundingClientRect();
          return {
            x: (box.x + box.width / 2 - bounds.x) / zoom,
            y: (box.y + box.height / 2 - bounds.y) / zoom,
            radius: (box.width / zoom) * 0.47,
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
      centers.forEach(({ x, y, radius }, i) => {
        const phase = i * 2.1;
        const base = y + radius * 0.96;
        const tall =
          radius *
          (flameHeight + Math.sin(t * 3.2 + phase) * 0.45) *
          (0.4 + ignition * 0.6);
        ctx.fillStyle = flameColor;
        plume(x, base, radius * 1.08, tall, t, phase);
        ctx.fill();
        // Three rising embers per bot, with a gentle fade and no particle allocations.
        if (!reduced)
          for (let n = 0; n < 3; n++) {
            const progress = (t * 0.55 + i * 0.19 + n / 3) % 1;
            const ex =
              x + Math.sin(i * 7 + n * 3) * radius + Math.sin(t * 2 + n) * 4;
            const ey = base - tall * 0.4 - progress * tall * 0.8;
            ctx.globalAlpha = Math.sin(progress * Math.PI) * 0.6 * ignition;
            ctx.fillStyle = flameColor;
            ctx.beginPath();
            ctx.ellipse(ex, ey, 1, 1.8, 0.3, 0, Math.PI * 2);
            ctx.fill();
          }
        ctx.globalAlpha = 1;
      });
      if (!reduced) frame = requestAnimationFrame(draw);
    };
    const refresh = () => {
      measure();
      if (reduced) draw(performance.now());
    };
    const observer = new ResizeObserver(refresh);
    observer.observe(parent);
    addEventListener("resize", refresh);
    measure();
    draw(performance.now());
    return () => {
      observer.disconnect();
      removeEventListener("resize", refresh);
      cancelAnimationFrame(frame);
      ctx.clearRect(0, 0, width, height);
    };
  }, [active, reduced]);
  return (
    <canvas
      ref={canvas}
      className="squad-energy"
      data-fire={active ? (reduced ? "still" : "flowing") : "paused"}
      aria-hidden="true"
    />
  );
}
