import { CAST } from "@swarm/shared/cast";
import { FACES } from "../characters/faces";
import { clamp, ease } from "./timeline";

const colors = [...CAST.map((bot) => bot.color), "#262626"];
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

function Circle({
  x,
  y,
  size,
  index,
  rotate = 0,
  eyes = 0,
  opacity = 1,
}: {
  x: number;
  y: number;
  size: number;
  index: number;
  rotate?: number;
  eyes?: number;
  opacity?: number;
}) {
  const mood =
    index === 5
      ? "happy"
      : (["curious", "found", "bored", "focused", "happy"] as const)[index % 5];
  return (
    <svg
      viewBox="0 0 64 64"
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        transform: `rotate(${rotate}deg)`,
        opacity,
      }}
    >
      <circle cx="32" cy="32" r="32" fill={colors[index % 6]} />
      <g
        color={index === 5 ? "white" : "black"}
        transform={`translate(${eyes} 0)`}
      >
        {FACES[mood]}
      </g>
    </svg>
  );
}

export function ColdOpen({ time }: { time: number }) {
  const pull = ease((time - 0.48) / 0.78);
  const shrink = ease((time - 1.8) / 0.5);
  const index = time < 0.28 ? 0 : time < 0.56 ? 1 : time < 1.5 ? 3 : 5;
  return (
    <div
      className="film-cold-open"
      style={{ opacity: 1 - ease((time - 2.15) / 0.4) }}
    >
      <Circle
        x={800}
        y={450}
        size={lerp(2350, 130, pull) * (1 - shrink * 0.3)}
        index={index}
        rotate={Math.sin(clamp((time - 1.05) / 0.9) * Math.PI) * -28}
        eyes={Math.sin(time * 5) * 2}
      />
    </div>
  );
}

// Match-cut scale changes, crossing arcs and a field of small circles give the
// transitions a graphic rhythm. These are new paths, not copied video frames.
export function CircleSequence({
  elapsed,
  returning,
}: {
  elapsed: number;
  returning: boolean;
}) {
  const p = elapsed;
  const gather = ease(p / 0.55);
  const rush = ease((p - 0.55) / 1.45);
  const bloom = ease((p - 1.65) / 0.75);
  const black = ease((p - 2.55) / 0.35);
  const reveal = ease((p - 3.2) / 0.8);
  const positions = [
    [140, 180],
    [1410, 120],
    [260, 820],
    [1330, 750],
    [790, 390],
  ];
  return (
    <div
      className="film-swarm"
      data-blackout={black === 1 && reveal === 0}
      aria-hidden="true"
    >
      <div
        style={{ position: "absolute", inset: 0, opacity: reveal > 0 ? 0 : 1 }}
      >
        {CAST.map((_, i) => {
          const angle = (i * Math.PI * 2) / 5 + rush * 1.8;
          const orbitX =
            800 + Math.cos(angle) * (170 + Math.sin(rush * Math.PI) * 540);
          const orbitY =
            450 + Math.sin(angle) * (120 + Math.sin(rush * Math.PI) * 270);
          const x = lerp(
            lerp(685 + i * 57, orbitX, gather),
            positions[i][0],
            bloom,
          );
          const y = lerp(lerp(540, orbitY, gather), positions[i][1], bloom);
          const size = lerp(
            lerp(100, 190 + 130 * Math.sin(rush * Math.PI + i * 0.6), rush),
            1500,
            bloom,
          );
          return (
            <Circle
              key={i}
              x={x}
              y={y}
              size={size}
              index={i}
              rotate={rush * 150 * (i % 2 ? 1 : -1)}
              eyes={Math.sin(p * 3 + i) * 2}
            />
          );
        })}
        {Array.from({ length: 26 }, (_, i) => {
          const spread = ease((p - 0.75 - i * 0.008) / 1.0);
          const a = i * 2.399;
          const radius = spread * (250 + (i % 5) * 155);
          return (
            <Circle
              key={i}
              x={800 + Math.cos(a + p * 0.5) * radius}
              y={450 + Math.sin(a + p * 0.5) * radius * 0.65}
              size={(18 + (i % 4) * 12) * Math.sin((spread * Math.PI) / 2)}
              index={i % 5}
              rotate={p * 50 + i * 13}
              opacity={1 - bloom}
            />
          );
        })}
      </div>
      <div
        className="film-black-wipe"
        style={{
          width: black * 2300 * (1 - reveal),
          height: black * 2300 * (1 - reveal),
          left: 800,
          top: returning ? 450 + reveal * 130 : 450,
        }}
      />
      {returning &&
        reveal > 0 &&
        CAST.map((_, i) => (
          <Circle
            key={i}
            x={lerp(positions[i][0], 612 + i * 129, reveal)}
            y={lerp(positions[i][1], 605, reveal)}
            size={lerp(210, 98, reveal)}
            index={i}
            rotate={(1 - reveal) * 80 * (i % 2 ? 1 : -1)}
            opacity={1 - ease((reveal - 0.7) / 0.3)}
          />
        ))}
    </div>
  );
}
