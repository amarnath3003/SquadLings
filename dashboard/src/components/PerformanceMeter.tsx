import { useEffect, useState } from "react";
export function PerformanceMeter({
  particles,
  load,
}: {
  particles: number;
  load: boolean;
}) {
  const [metrics, setMetrics] = useState<{ fps: number; p95: number }>();
  useEffect(() => {
    let raf = 0,
      last = 0,
      start = 0,
      samples: number[] = [];
    const loop = (t: number) => {
      if (document.hidden) {
        last = 0;
        raf = 0;
        return;
      }
      if (last) samples.push(t - last);
      last = t;
      if (!start) start = t;
      if (t - start > 1000) {
        const sorted = [...samples].sort((a, b) => a - b);
        setMetrics({
          fps: Math.round((samples.length * 1000) / (t - start)),
          p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
        });
        samples = [];
        start = t;
      }
      raf = requestAnimationFrame(loop);
    };
    const restart = () => {
      if (!document.hidden && !raf) {
        start = 0;
        last = 0;
        raf = requestAnimationFrame(loop);
      }
    };
    restart();
    document.addEventListener("visibilitychange", restart);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", restart);
    };
  }, []);
  return (
    <span
      className="performance-meter"
      title="Measured in this browser; this is not a certified laptop benchmark."
    >
      {metrics
        ? `${metrics.fps} fps · p95 ${metrics.p95.toFixed(1)} ms`
        : "Measuring…"}
      <span>·</span>
      {particles}/60 particles
      {load && (
        <>
          <span>·</span>8 fps canvases
        </>
      )}
    </span>
  );
}
