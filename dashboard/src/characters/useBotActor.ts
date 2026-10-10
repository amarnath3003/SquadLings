import { useEffect, useMemo, useRef } from "react";
import { animate, useMotionValue, type MotionValue } from "motion/react";
import type { BotId, Mood } from "@swarm/shared/types";
import { PERSONALITY, hash, mulberry32 } from "./personality";
import { lookOffset, type Point } from "../mood/attention";
export interface Actor {
  x: MotionValue<number>;
  y: MotionValue<number>;
  hopY: MotionValue<number>;
  tilt: MotionValue<number>;
  scaleX: MotionValue<number>;
  scaleY: MotionValue<number>;
  eyeX: MotionValue<number>;
  eyeY: MotionValue<number>;
  blink: MotionValue<number>;
  opacity: MotionValue<number>;
  glide: (point: Point, duration: number) => void;
  click: (point: Point) => void;
  hop: () => void;
  flourish: (
    kind: "found" | "finish" | "error" | "retry" | "scroll" | "type",
  ) => void;
  look: (point?: Point) => void;
  stop: () => void;
  isGliding: () => boolean;
}
export function useBotActor(
  id: BotId,
  mood: Mood,
  reduced: boolean,
  speed: number,
  seed = "launch",
) {
  const x = useMotionValue(0),
    y = useMotionValue(0),
    hopY = useMotionValue(0),
    tilt = useMotionValue(0),
    scaleX = useMotionValue(1),
    scaleY = useMotionValue(1),
    eyeX = useMotionValue(0),
    eyeY = useMotionValue(0),
    blink = useMotionValue(1),
    opacity = useMotionValue(1);
  const moodRef = useRef(mood);
  moodRef.current = mood;
  const actor = useMemo<Actor>(() => {
    const dna = PERSONALITY[id];
    let gliding = false;
    let generation = 0;
    const time = (ms: number) => Math.max(0.06, ms / 1000 / speed);
    const stop = () => {
      generation++;
      gliding = false;
      for (const value of [
        x,
        y,
        hopY,
        tilt,
        scaleX,
        scaleY,
        eyeX,
        eyeY,
        blink,
        opacity,
      ])
        value.stop();
      hopY.set(0);
      tilt.set(0);
      scaleX.set(1);
      scaleY.set(1);
      blink.set(1);
      opacity.set(1);
    };
    const hop = () => {
      if (!reduced)
        animate(hopY, [0, -8, 0], { duration: time(400), ease: "easeInOut" });
    };
    const squish = () => {
      if (reduced) return;
      animate(scaleX, [dna.squish, 1], { duration: time(140) });
      animate(scaleY, [2 - dna.squish, 1], { duration: time(140) });
    };
    return {
      x,
      y,
      hopY,
      tilt,
      scaleX,
      scaleY,
      eyeX,
      eyeY,
      blink,
      opacity,
      stop,
      hop,
      isGliding: () => gliding,
      look: (point) => {
        const offset = lookOffset({ x: x.get(), y: y.get() }, point);
        animate(eyeX, offset.x, { duration: time(120) });
        animate(eyeY, offset.y, { duration: time(120) });
      },
      glide: (point, duration) => {
        const token = ++generation;
        gliding = true;
        x.stop();
        y.stop();
        opacity.stop();
        const offset = lookOffset({ x: x.get(), y: y.get() }, point);
        animate(eyeX, offset.x, { duration: time(120) });
        animate(eyeY, offset.y, { duration: time(120) });
        if (reduced) {
          animate(opacity, 0, {
            duration: time(60),
            onComplete: () => {
              if (token !== generation) return;
              x.set(point.x);
              y.set(point.y);
              animate(opacity, 1, {
                duration: time(60),
                onComplete: () => {
                  gliding = false;
                },
              });
            },
          });
          return;
        }
        const d = time(duration);
        // Time-bounded keyframes preserve the event's landing deadline even for eager personalities.
        const from = { x: x.get(), y: y.get() },
          dx = point.x - from.x,
          dy = point.y - from.y;
        const distance = Math.hypot(dx, dy) || 1,
          overshoot = dna.bounce ? Math.min(3, distance * 0.03) : 0;
        const settings = {
          duration: d,
          ease: [...dna.ease] as [number, number, number, number],
        };
        animate(
          x,
          overshoot
            ? [from.x, point.x + (dx / distance) * overshoot, point.x]
            : point.x,
          { ...settings, ...(overshoot ? { times: [0, 0.85, 1] } : {}) },
        );
        animate(
          y,
          overshoot
            ? [from.y, point.y + (dy / distance) * overshoot, point.y]
            : point.y,
          {
            ...settings,
            ...(overshoot ? { times: [0, 0.85, 1] } : {}),
            onComplete: () => {
              if (token === generation) {
                gliding = false;
                x.set(point.x);
                y.set(point.y);
              }
            },
          },
        );
        if (id === "bot4")
          animate(tilt, [0, Math.sign(dx) * 2, 0], { duration: d });
        if (id === "bot1")
          animate(tilt, [0, 0, -2, 2, 0], {
            times: [0, 0.8, 0.88, 0.94, 1],
            duration: d,
          });
      },
      click: (point) => {
        generation++;
        gliding = false;
        x.stop();
        y.stop();
        opacity.stop();
        opacity.set(1);
        x.set(point.x);
        y.set(point.y);
        squish();
      },
      flourish: (kind) => {
        if (reduced) return;
        if (kind === "finish") {
          animate(
            hopY,
            id === "bot5" ? [0, -10, 0, -8, 0, -6, 0] : [0, -9, 0, -6, 0],
            { duration: time(id === "bot3" ? 900 : 650) },
          );
        }
        if (kind === "found") {
          if (id === "bot2" || id === "bot5")
            animate(tilt, [0, 360], {
              duration: time(400),
              onComplete: () => tilt.set(0),
            });
          else {
            animate(scaleX, [1, 1.15, 1], { duration: time(350) });
            hop();
          }
        }
        if (kind === "error")
          animate(tilt, [0, -6, 6, -6, 6, 0], { duration: time(300) });
        if (kind === "retry") {
          animate(scaleX, [0.7, 1.1, 1], { duration: time(300) });
          animate(scaleY, [0.7, 1.1, 1], { duration: time(300) });
        }
        if (kind === "type")
          animate(tilt, [0, -1, 1, -1, 1, 0], { duration: time(300) });
        if (kind === "scroll")
          animate(hopY, [0, -4, 0], { duration: time(300) });
      },
    };
  }, [
    id,
    reduced,
    speed,
    x,
    y,
    hopY,
    tilt,
    scaleX,
    scaleY,
    eyeX,
    eyeY,
    blink,
    opacity,
  ]);
  useEffect(() => {
    const random = mulberry32(hash(seed + id)),
      dna = PERSONALITY[id];
    let timer: ReturnType<typeof setTimeout>,
      flourish: ReturnType<typeof setTimeout>;
    const scheduleBlink = () => {
      timer = setTimeout(
        () => {
          if (!document.hidden && ["calm", "curious"].includes(moodRef.current))
            animate(blink, [1, 0.1, 1], {
              duration: dna.blink[2] / 1000 / speed,
            });
          scheduleBlink();
        },
        (dna.blink[0] + random() * (dna.blink[1] - dna.blink[0])) / speed,
      );
    };
    const scheduleFlourish = () => {
      flourish = setTimeout(
        () => {
          if (
            !reduced &&
            speed < 4 &&
            !document.hidden &&
            !actor.isGliding() &&
            ["calm", "curious"].includes(moodRef.current)
          ) {
            if (id === "bot3") {
              animate(scaleX, [1, 1.03, 1], { duration: 2.4 / speed });
              animate(scaleY, [1, 1.03, 1], { duration: 2.4 / speed });
            } else if (id === "bot4")
              animate(hopY, [0, -3, 0, -3, 0], { duration: 0.5 / speed });
            else
              animate(tilt, id === "bot5" ? [0, -5, 5, -5, 5, 0] : [0, -6, 0], {
                duration: 0.9 / speed,
              });
          }
          scheduleFlourish();
        },
        (6000 + random() * 6000) / speed,
      );
    };
    if (!reduced) {
      scheduleBlink();
      scheduleFlourish();
    }
    const pause = () => {
      if (document.hidden) actor.stop();
    };
    document.addEventListener("visibilitychange", pause);
    return () => {
      clearTimeout(timer);
      clearTimeout(flourish);
      actor.stop();
      document.removeEventListener("visibilitychange", pause);
    };
  }, [actor, id, seed, reduced, speed]);
  return actor;
}
