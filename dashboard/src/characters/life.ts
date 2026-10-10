import type { BotId } from "@swarm/shared/types";

export type Gesture =
  | "peek"
  | "nod"
  | "stretch"
  | "bounce"
  | "wiggle"
  | "wave"
  | "dance"
  | "startle"
  | "love";
export interface LifeCue {
  gesture: Gesture;
  serial: number;
}

// Small, different habits are more believable than five synchronized loops.
export const HABITS: Record<
  BotId,
  {
    gestures: Gesture[];
    pace: number;
    lines: string[];
    hello: string;
    dance: string;
    spark: string;
  }
> = {
  bot1: {
    gestures: ["peek", "nod", "peek", "stretch"],
    pace: 1.25,
    lines: ["Just double-checking.", "I saw that.", "Interesting…"],
    hello: "Do we know each other?",
    dance: "This is for research.",
    spark: "Source verified.",
  },
  bot2: {
    gestures: ["bounce", "peek", "wiggle", "bounce"],
    pace: 0.85,
    lines: ["Ooh, what’s that?", "Found something!", "One more idea…"],
    hello: "Hi! Want to explore?",
    dance: "Best discovery today!",
    spark: "Ooh! Catch!",
  },
  bot3: {
    gestures: ["stretch", "nod", "stretch", "peek"],
    pace: 1.65,
    lines: ["No rush.", "Just a little stretch.", "Taking it all in."],
    hello: "Oh. Hello there.",
    dance: "My kind of cardio.",
    spark: "Coming through. Slowly.",
  },
  bot4: {
    gestures: ["nod", "bounce", "peek", "wiggle"],
    pace: 0.7,
    lines: ["Ready when you are.", "Let’s do this.", "Already on it."],
    hello: "Hey. What’s the plan?",
    dance: "Maximum efficiency.",
    spark: "Delivered.",
  },
  bot5: {
    gestures: ["wiggle", "bounce", "stretch", "wave"],
    pace: 1,
    lines: ["You’re doing great.", "Happy to be here!", "Better together."],
    hello: "You’re here! Hi!",
    dance: "I love this part!",
    spark: "A little joy for you.",
  },
};

type PointerListener = (point?: { x: number; y: number }) => void;
const listeners = new Set<PointerListener>();
let frame = 0;
let pointer: { x: number; y: number } | undefined;
function flush() {
  frame = 0;
  listeners.forEach((listener) => listener(pointer));
}
function move(event: PointerEvent) {
  if (event.pointerType !== "mouse") return;
  pointer = { x: event.clientX, y: event.clientY };
  if (!frame) frame = requestAnimationFrame(flush);
}
function leave() {
  pointer = undefined;
  if (!frame) frame = requestAnimationFrame(flush);
}

// One pointer listener and one frame for the whole cast; never a React mousemove update.
export function watchPointer(listener: PointerListener) {
  if (!listeners.size) {
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    window.addEventListener("blur", leave);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
      window.removeEventListener("blur", leave);
      cancelAnimationFrame(frame);
      frame = 0;
      pointer = undefined;
    }
  };
}
