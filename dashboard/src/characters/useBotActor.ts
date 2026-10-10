import { useEffect, useMemo } from "react";
import { animate, useMotionValue, type MotionValue } from "motion/react";
import type { BotId, Mood } from "@swarm/shared/types";
import { PERSONALITY } from "./personality";
import { lookOffset, type Point } from "../mood/attention";
export type ActivityName =
  | "output"
  | "type"
  | "scroll"
  | "read"
  | "ask"
  | "found"
  | "finish"
  | "error"
  | "retry";
export interface ActivityCue {
  kind: ActivityName;
  sequence: number;
  direction: -1 | 1;
  held: boolean;
}
export interface Actor {
  x: MotionValue<number>;
  y: MotionValue<number>;
  hopY: MotionValue<number>;
  leanX: MotionValue<number>;
  activity: MotionValue<ActivityCue | null>;
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
    kind: ActivityName,
    options?: { direction?: number; hold?: boolean },
  ) => void;
  clearActivity: (kind?: ActivityName) => void;
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
    leanX = useMotionValue(0),
    activity = useMotionValue<ActivityCue | null>(null),
    tilt = useMotionValue(0),
    scaleX = useMotionValue(1),
    scaleY = useMotionValue(1),
    eyeX = useMotionValue(0),
    eyeY = useMotionValue(0),
    blink = useMotionValue(1),
    opacity = useMotionValue(1);
  const actor = useMemo<Actor>(() => {
    const dna = PERSONALITY[id];
    let gliding = false;
    let generation = 0;
    let sequence = 0;
    let activityTimer: ReturnType<typeof setTimeout> | undefined;
    const time = (ms: number) => Math.max(0.06, ms / 1000 / speed);
    const clearActivity = (kind?: ActivityName) => {
      if (kind && activity.get()?.kind !== kind) return;
      clearTimeout(activityTimer);
      activity.set(null);
      for (const value of [leanX, hopY, tilt, scaleX, scaleY]) value.stop();
      leanX.set(0);
      hopY.set(0);
      tilt.set(0);
      scaleX.set(1);
      scaleY.set(1);
    };
    const stop = () => {
      clearActivity();
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
      eyeX.set(0);
      eyeY.set(0);
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
      leanX,
      activity,
      tilt,
      scaleX,
      scaleY,
      eyeX,
      eyeY,
      blink,
      opacity,
      stop,
      clearActivity,
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
      flourish: (kind, { direction = 1, hold } = {}) => {
        // Cursor details refine a tool cue without shortening its lifetime.
        const held =
          hold ??
          (activity.get()?.kind === kind && activity.get()?.held) ??
          false;
        clearActivity();
        const cue = {
          kind,
          sequence: ++sequence,
          direction: direction < 0 ? -1 : 1,
          held,
        } as const;
        activity.set(cue);
        const duration = {
          output: 1600,
          type: 1800,
          scroll: 1300,
          read: 2400,
          ask: 2200,
          found: 1700,
          finish: 2400,
          error: 1200,
          retry: 900,
        }[kind];
        if (!held)
          activityTimer = setTimeout(() => clearActivity(), duration / speed);
        if (reduced) return;
        const options = {
          duration: time(duration),
          ease: "easeInOut" as const,
          repeat: held ? Infinity : 0,
        };
        if (kind === "finish") {
          animate(hopY, [0, 3, -17, 0, -10, 0, -4, 0, 0], options);
          animate(tilt, [0, -7, 7, -5, 5, -2, 0, 0, 0], options);
          animate(scaleX, [1, 1.16, 0.9, 1.12, 0.95, 1.05, 1, 1, 1], options);
          animate(scaleY, [1, 0.86, 1.12, 0.9, 1.06, 0.96, 1, 1, 1], options);
        }
        if (kind === "found") {
          animate(hopY, [0, 3, -13, -7, -7, 0], options);
          animate(tilt, [0, -8, 5, -3, 2, 0], options);
          animate(scaleX, [1, 1.12, 0.91, 1.04, 1.04, 1], options);
          animate(scaleY, [1, 0.9, 1.12, 1.02, 1.02, 1], options);
        }
        if (kind === "error")
          animate(tilt, [0, -6, 6, -6, 6, 0], { duration: time(300) });
        if (kind === "retry") {
          animate(scaleX, [0.7, 1.1, 1], { duration: time(300) });
          animate(scaleY, [0.7, 1.1, 1], { duration: time(300) });
        }
        if (kind === "type") {
          animate(tilt, [0, -4, 4, -4, 4, -3, 3, 0], options);
          animate(hopY, [0, 2, 0, 2, 0, 2, 0, 0], options);
        }
        if (kind === "output") {
          animate(tilt, [0, -6, -3, -6, -3, 2, 0], options);
          animate(scaleY, [1, 1.04, 1, 1.04, 1, 1.02, 1], options);
        }
        if (kind === "scroll") {
          const sign = cue.direction;
          animate(
            hopY,
            [0, -7 * sign, 4 * sign, -7 * sign, 4 * sign, 0],
            options,
          );
          animate(tilt, [0, -6, 4, -6, 4, 0], options);
        }
        if (kind === "read") {
          animate(leanX, [0, -7, 7, -7, 7, 0], options);
          animate(hopY, [0, -5, -5, -2, -2, 0], options);
          animate(tilt, [0, -5, 4, -5, 4, 0], options);
        }
        if (kind === "ask") {
          animate(tilt, [0, -14, -14, 9, 9, -5, 0], options);
          animate(hopY, [0, -3, -3, 0, -2, -2, 0], options);
          animate(scaleY, [1, 1.06, 1.06, 1, 1.03, 1.03, 1], options);
        }
      },
    };
  }, [
    id,
    reduced,
    speed,
    x,
    y,
    hopY,
    leanX,
    activity,
    tilt,
    scaleX,
    scaleY,
    eyeX,
    eyeY,
    blink,
    opacity,
  ]);
  useEffect(() => {
    const pause = () => {
      if (document.hidden) actor.stop();
    };
    document.addEventListener("visibilitychange", pause);
    return () => {
      actor.stop();
      document.removeEventListener("visibilitychange", pause);
    };
  }, [actor]);
  return actor;
}
