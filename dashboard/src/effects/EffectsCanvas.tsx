import { useEffect, useRef } from "react";
import type { BotId } from "@swarm/shared/types";
import { mulberry32 } from "../characters/personality";
interface Burst {
  x: number;
  y: number;
  color: string;
  count: number;
  seed: number;
  botId: BotId;
  kind: "spark" | "confetti" | "smoke";
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  angle: number;
  color: string;
  botId: BotId;
  kind: Burst["kind"];
}
let emit: (burst: Burst) => void = () => {};
export const burst = (value: Burst) => emit(value);
export function EffectsCanvas({
  reduced,
  onCount,
}: {
  reduced: boolean;
  onCount: (count: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!,
      ctx = canvas.getContext("2d")!;
    let particles: Particle[] = [],
      raf = 0,
      last = 0;
    const resize = () => {
      const d = Math.min(devicePixelRatio, 2);
      canvas.width = innerWidth * d;
      canvas.height = innerHeight * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    const draw = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.04);
      last = t;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      particles = particles.filter((p) => p.age < p.life);
      for (const p of particles) {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.kind === "confetti") p.vy += 130 * dt;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle + p.age * 3);
        ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
        ctx.fillStyle = p.color;
        if (p.kind === "confetti") ctx.fillRect(-2, -3, 4, 6);
        else if (p.kind === "smoke") {
          ctx.beginPath();
          ctx.arc(0, 0, 3 + p.age * 9, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(0, -5);
          ctx.lineTo(1.5, -1.5);
          ctx.lineTo(5, 0);
          ctx.lineTo(1.5, 1.5);
          ctx.lineTo(0, 5);
          ctx.lineTo(-1.5, 1.5);
          ctx.lineTo(-5, 0);
          ctx.lineTo(-1.5, -1.5);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
      onCount(particles.length);
      raf =
        particles.length && !document.hidden ? requestAnimationFrame(draw) : 0;
    };
    emit = (value) => {
      if (reduced || document.hidden) return;
      const random = mulberry32(value.seed);
      const count = Math.min(16, value.count);
      particles = particles
        .filter((p) => p.botId !== value.botId)
        .slice(-(60 - count));
      for (let i = 0; i < count; i++) {
        const a = random() * Math.PI * 2,
          velocity = 30 + random() * 70;
        particles.push({
          x: value.x,
          y: value.y,
          vx: Math.cos(a) * velocity,
          vy: Math.sin(a) * velocity - 30,
          age: 0,
          life: value.kind === "smoke" ? 0.7 : 1.4,
          angle: random() * 6.28,
          color: value.kind === "smoke" ? "#999" : value.color,
          botId: value.botId,
          kind: value.kind,
        });
      }
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(draw);
      }
    };
    const visibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
        particles = [];
        ctx.clearRect(0, 0, innerWidth, innerHeight);
        onCount(0);
      }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      emit = () => {};
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", visibility);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      onCount(0);
    };
  }, [reduced, onCount]);
  return <canvas ref={ref} className="effects-canvas" aria-hidden="true" />;
}
