import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { animate, useMotionValue, useSpring } from "motion/react";
import type { BotId, Mood } from "@swarm/shared/types";
import { HABITS, watchPointer, type Gesture } from "./life";
import { hash, mulberry32, PERSONALITY } from "./personality";

export function useCharacterLife({
  id,
  mood,
  reduced,
  paused,
  resting,
  speed,
  seed,
  root,
  trackPointer,
}: {
  id: BotId;
  mood: Mood;
  reduced: boolean;
  paused: boolean;
  resting: boolean;
  speed: number;
  seed: string;
  root: RefObject<HTMLDivElement>;
  trackPointer: boolean;
}) {
  const x = useMotionValue(0),
    y = useMotionValue(0),
    tilt = useMotionValue(0);
  const sx = useMotionValue(1),
    sy = useMotionValue(1),
    blink = useMotionValue(1);
  const gazeX = useSpring(0, { stiffness: 180, damping: 24 });
  const gazeY = useSpring(0, { stiffness: 180, damping: 24 });
  const values = useMemo(
    () => [x, y, tilt, sx, sy, blink, gazeX, gazeY],
    [x, y, tilt, sx, sy, blink, gazeX, gazeY],
  );
  const [visible, setVisible] = useState(!document.hidden);
  const busyUntil = useRef(0),
    pointerUntil = useRef(0);
  const active = visible && !reduced && !paused;
  const moodRef = useRef(mood);
  moodRef.current = mood;
  const reset = useCallback(() => {
    values.forEach((value) => value.stop());
    x.set(0);
    y.set(0);
    tilt.set(0);
    sx.set(1);
    sy.set(1);
    blink.set(1);
    gazeX.jump(0);
    gazeY.jump(0);
    busyUntil.current = 0;
  }, [values, x, y, tilt, sx, sy, blink, gazeX, gazeY]);

  useEffect(() => {
    let inView = true;
    const update = () => setVisible(inView && !document.hidden);
    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        update();
      },
      { rootMargin: "60px" },
    );
    if (root.current) observer.observe(root.current);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, [root]);

  const perform = useCallback(
    (gesture: Gesture) => {
      if (!active || resting || moodRef.current === "failed") return;
      // Gestures have anticipation, an action, and a soft settle. They never move the cursor hotspot.
      const pace = HABITS[id].pace / Math.min(speed, 2);
      const duration =
        (gesture === "dance" ? 2.8 : gesture === "stretch" ? 1.7 : 0.85) * pace;
      busyUntil.current = performance.now() + duration * 1000 + 200;
      [x, y, tilt, sx, sy].forEach((value) => value.stop());
      const options = { duration, ease: "easeInOut" as const };
      const motion = {
        peek: {
          x: [0, -2, 3, 1, 0],
          y: [0, 0, -2, 0, 0],
          tilt: [0, -8, 5, 5, 0],
          sx: [1, 1, 1.03, 1, 1],
          sy: [1, 1, 0.97, 1, 1],
        },
        nod: {
          x: [0, 0, 0, 0, 0],
          y: [0, 2, -2, 1, 0],
          tilt: [0, 3, -2, 1, 0],
          sx: [1, 1.06, 0.97, 1.02, 1],
          sy: [1, 0.94, 1.04, 0.98, 1],
        },
        stretch: {
          x: [0, 0, 0, 0, 0],
          y: [0, 2, -4, -3, 0],
          tilt: [0, -3, 4, -2, 0],
          sx: [1, 1.07, 0.87, 0.9, 1],
          sy: [1, 0.94, 1.12, 1.1, 1],
        },
        bounce: {
          x: [0, 0, 0, 0, 0],
          y: [0, 3, -13, 2, 0],
          tilt: [0, -3, 5, -2, 0],
          sx: [1, 1.14, 0.9, 1.1, 1],
          sy: [1, 0.86, 1.1, 0.91, 1],
        },
        wiggle: {
          x: [0, -2, 2, -1, 0],
          y: [0, -1, -3, -1, 0],
          tilt: [0, -10, 10, -5, 0],
          sx: [1, 1.04, 0.96, 1.02, 1],
          sy: [1, 0.96, 1.04, 0.98, 1],
        },
        wave: {
          x: [0, 2, -2, 2, 0],
          y: [0, -7, -4, -7, 0],
          tilt: [0, -15, 13, -10, 0],
          sx: [1, 0.95, 1.04, 0.96, 1],
          sy: [1, 1.06, 0.96, 1.04, 1],
        },
        dance: {
          x: [0, -6, 6, -6, 6, -3, 0],
          y: [0, -9, -2, -11, -2, -7, 0],
          tilt: [0, -16, 16, -14, 14, -8, 0],
          sx: [1, 0.92, 1.1, 0.92, 1.1, 0.96, 1],
          sy: [1, 1.09, 0.9, 1.09, 0.9, 1.04, 1],
        },
        startle: {
          x: [0, -2, 2, -1, 0],
          y: [0, 2, -16, 1, 0],
          tilt: [0, 0, -6, 4, 0],
          sx: [1, 1.1, 0.83, 1.1, 1],
          sy: [1, 0.9, 1.16, 0.9, 1],
        },
        love: {
          x: [0, -1, 1, -1, 0],
          y: [0, 2, -8, -2, 0],
          tilt: [0, -8, 8, -4, 0],
          sx: [1, 1.14, 0.95, 1.03, 1],
          sy: [1, 0.86, 1.06, 0.97, 1],
        },
      }[gesture];
      animate(x, motion.x, options);
      animate(y, motion.y, options);
      animate(tilt, motion.tilt, options);
      animate(sx, motion.sx, options);
      animate(sy, motion.sy, options);
    },
    [active, resting, id, speed, x, y, tilt, sx, sy],
  );

  useEffect(() => {
    reset();
    if (!active || resting) return;
    const random = mulberry32(hash(`${seed}:${id}:life`));
    const dna = PERSONALITY[id];
    let blinkTimer: ReturnType<typeof setTimeout>,
      habitTimer: ReturnType<typeof setTimeout>;
    const scheduleBlink = () => {
      blinkTimer = setTimeout(
        () => {
          if (moodRef.current !== "failed") {
            const double = random() > 0.72;
            animate(blink, double ? [1, 0.06, 1, 1, 0.06, 1] : [1, 0.06, 1], {
              duration: double ? 0.45 : dna.blink[2] / 1000,
              ease: "easeInOut",
            });
          }
          scheduleBlink();
        },
        (1200 + random() * (dna.blink[1] - 1200)) / Math.min(speed, 2),
      );
    };
    const scheduleHabit = () => {
      habitTimer = setTimeout(
        () => {
          const quiet = !["failed", "worried", "focused"].includes(
            moodRef.current,
          );
          if (quiet && performance.now() > busyUntil.current) {
            const gestures = HABITS[id].gestures;
            perform(gestures[Math.floor(random() * gestures.length)]);
          }
          if (quiet && performance.now() > pointerUntil.current) {
            gazeX.set((random() - 0.5) * 5);
            gazeY.set((random() - 0.5) * 2.5);
          }
          scheduleHabit();
        },
        ((1800 + random() * 3000) * HABITS[id].pace) / Math.min(speed, 2),
      );
    };
    scheduleBlink();
    // At cursor scale the action rig supplies gestures; keep ambient JS work for portraits.
    if (trackPointer) scheduleHabit();
    return () => {
      clearTimeout(blinkTimer);
      clearTimeout(habitTimer);
      reset();
    };
  }, [
    active,
    resting,
    seed,
    id,
    speed,
    perform,
    reset,
    blink,
    gazeX,
    gazeY,
    trackPointer,
  ]);

  useEffect(() => {
    if (!active || resting || !trackPointer) return;
    return watchPointer((point) => {
      const box = root.current?.getBoundingClientRect();
      if (!box) return;
      const dx = point ? point.x - (box.x + box.width / 2) : 0;
      const dy = point ? point.y - (box.y + box.height / 2) : 0;
      const distance = Math.hypot(dx, dy);
      if (!point || distance > 600) {
        gazeX.set(0);
        gazeY.set(0);
        return;
      }
      pointerUntil.current = performance.now() + 2500;
      const scale = Math.min(3.5, distance / 35) / (distance || 1);
      gazeX.set(dx * scale);
      gazeY.set(dy * scale);
    });
  }, [active, resting, trackPointer, root, gazeX, gazeY]);

  useEffect(() => {
    if (mood === "failed") reset();
  }, [mood, reset]);

  const press = useCallback(
    (down: boolean) => {
      if (!active || resting) return;
      busyUntil.current = performance.now() + 1500;
      animate(sx, down ? 1.18 : 1, {
        type: "spring",
        stiffness: 450,
        damping: 18,
      });
      animate(sy, down ? 0.82 : 1, {
        type: "spring",
        stiffness: 450,
        damping: 18,
      });
    },
    [active, resting, sx, sy],
  );
  return { x, y, tilt, sx, sy, blink, gazeX, gazeY, active, perform, press };
}
