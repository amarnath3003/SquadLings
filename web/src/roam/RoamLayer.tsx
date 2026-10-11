import { memo, useEffect, useState } from "react";
import type { BotId, Mood } from "@swarm/shared/types";
import { CAST, castFor } from "@swarm/shared/cast";
import { BotCharacter } from "../characters/BotCharacter";
import { HABITS, type Gesture, type LifeCue } from "../characters/life";
import { hash, mulberry32 } from "../characters/personality";
import { S, phase, taps, useLive, type Phase, type ServerEvent } from "../live/store";
import { setLastSquad } from "./DotWave";
import { awayFrom, centerOf, clamp, easeInOutCubic, easeOutBack, easeOutExpo, lerp, rectOf, turnToward, type P, type Rect } from "./steer";
import "./roam.css";

// The squad you picked, alive on the home screen, and its one authored sequence:
//
//   home     each agent roams (steering: a slow wander at its own pace, soft separation, and it steers
//            around the title, the line under it and the bar so the text stays readable). Eyes follow
//            the pointer; hover → it looks at you and wiggles; click → the studio's boop. While you type
//            they gather round the bar, look at it and bounce a little per burst of keys. Changing the
//            squad size pops a newcomer out of the agents chip, or tucks a leaver away.
//   send     the phase leaves home → each character flies (FLIP on this fixed layer, exponential
//            ease-out) from where it was into its coloured dot in the thinking row, shrinking and
//            turning into the dot.
//   plan     plan.ready → each dot unfolds back into its character, a task note flies to it from Onyx's
//            pinned card, it nods, and flies on to its own tile. The studio's own spawn flight for that
//            agent (and its tile cursor) stays hidden until ours arrives, so there is one character on
//            one path. Agents left out of the plan doze off and fade.
//
// One rAF loop for everything, transforms and opacity only, no React state per frame (React only
// hears about membership, cues, moods and gaze). Reduced motion: still characters, no flights.

const SIZE = 96; // drawn large (crisp, and ≥64 keeps the life rig's pointer gaze and habits), then scaled down
const BODY = (SIZE * 60) / 64; // the body circle's diameter at SIZE (viewBox 64, r = 30)
const HAND = 0.45; // the scale while being handed a task (~43px)
const ORIGIN = SIZE / 2; // the body circle's centre inside the box

type Mode = "roam" | "leave" | "fly" | "handoff" | "settle";
type View = { key: string; id: BotId; mood: Mood; cue?: LifeCue; attention?: -1 | 1; resting: boolean; mode: Mode };
type Target = P & { s: number };
type Move = {
  t0: number;
  dur: number;
  from: Target & { tilt: number };
  to: () => Target | null;
  last?: Target;
  ease: (k: number) => number;
  arc: number;
  /** The colour disc over the face: opacity goes from → to between progress a and b. */
  cover?: { from: number; to: number; a: number; b: number };
  fade?: { from: number; to: number };
  onLand?: () => void;
};
type Body = {
  key: string;
  id: BotId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  s: number;
  tilt: number;
  heading: number;
  op: number;
  cover: number;
  speed: number;
  rest: number;
  hovered: boolean;
  physics: boolean;
  spot?: P;
  rand: () => number;
  lastCue: number;
  enter?: "pop" | "fade";
  enterDelay: number;
  move?: Move;
  hold?: { target: () => Target | null; until: number; ready: () => boolean; then: () => void };
  el?: HTMLDivElement | null;
  coverEl?: HTMLElement | null;
  popEl?: HTMLElement | null;
  written: string;
};
type Note = { el: HTMLElement; t0: number; dur: number; from: () => P | null; to: () => P | null; lastFrom?: P; onLand: () => void };

const homeMood = (id: BotId): Mood => {
  const m = castFor(id).signature as Mood;
  return m === "focused" ? "calm" : m; // "focused" silences the idle habits; roaming should feel loose
};

/** The squad size chosen in the composer: the lit dots on the agents chip, else the saved settings. */
function readSquad(): number {
  const dots = document.querySelectorAll("#agent-dots i");
  if (dots.length) return Array.from(dots).filter((d) => !d.classList.contains("off")).length;
  try {
    const n = Number(JSON.parse(localStorage.getItem("squadlings.settings") ?? "{}").bots);
    if (n >= 1 && n <= 5) return n;
  } catch {
    // storage off
  }
  return 5;
}

function rowDots(): Map<BotId, HTMLElement> {
  const out = new Map<BotId, HTMLElement>();
  document.querySelectorAll<HTMLElement>("#thinking-row [data-roam-dot]").forEach((el) => out.set(el.dataset.roamDot as BotId, el));
  return out;
}

function dotTarget(dot: HTMLElement): Target | null {
  if (!dot.isConnected) return null;
  const r = dot.getBoundingClientRect();
  if (!r.width) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, s: r.width / BODY };
}

/** Where an agent's character sits in its tile (the studio's cursor actor), at the studio's size. */
function tileTarget(id: BotId): Target | null {
  const svg = document.querySelector(`[data-actor="${id}"] .character-seat svg`);
  if (!svg) return null;
  const r = svg.getBoundingClientRect();
  if (!r.width) return null;
  return { x: r.left + r.width / 2, y: r.top + r.width / 2, s: r.width / SIZE };
}
function tileShown(id: BotId) {
  const el = document.querySelector<HTMLElement>(`[data-actor="${id}"]`);
  return Boolean(el && parseFloat(el.style.opacity || "1") > 0.9);
}
function onyxPoint(): P | null {
  return centerOf(document.querySelector(".master-card .master-character"));
}

class Roam {
  bodies = new Map<string, Body>();
  views: View[] = [];
  notes = new Set<Note>();
  layer: HTMLDivElement | null = null;
  reduced: boolean;
  private push: (v: View[]) => void;
  private raf = 0;
  private last = 0;
  private envAt = -Infinity;
  private seq = 0;
  private serial = 0;
  private prev: Phase | null = null;
  private armed = false;
  private waitUntil = 0;
  private listenUntil = 0;
  private lastKey = 0;
  private dirty = false;
  private holds = new Set<BotId>();
  private holdTimer: ReturnType<typeof setTimeout> | undefined;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private env = { bounds: { l: 0, t: 0, r: innerWidth, b: innerHeight } as Rect, obstacles: [] as Rect[], bar: null as Rect | null, chip: null as P | null };

  constructor(push: (v: View[]) => void, reduced: boolean) {
    this.push = push;
    this.reduced = reduced;
  }

  // ── React bridge ──

  private commit() {
    if (this.dirty) return;
    this.dirty = true;
    queueMicrotask(() => {
      this.dirty = false;
      this.push(this.views);
    });
  }
  private patch(key: string, p: Partial<View>) {
    this.views = this.views.map((v) => (v.key === key ? { ...v, ...p } : v));
    this.commit();
  }
  private view(key: string) {
    return this.views.find((v) => v.key === key);
  }
  register(key: string, el: HTMLDivElement | null) {
    const b = this.bodies.get(key);
    if (!b) return;
    b.el = el;
    if (!el) return;
    b.coverEl = el.querySelector<HTMLElement>(".roamer-cover");
    b.popEl = el.querySelector<HTMLElement>(".roamer-pop");
    b.written = "";
    this.write(b);
    if (b.enter && b.popEl) {
      const pop = b.enter === "pop" && !this.reduced;
      b.popEl.animate(
        pop ? [{ transform: "scale(0)", opacity: 0 }, { transform: "scale(1.12)", opacity: 1, offset: 0.6 }, { transform: "scale(1)", opacity: 1 }] : [{ opacity: 0 }, { opacity: 1 }],
        { duration: pop ? 480 : 520, delay: b.enterDelay, easing: pop ? "cubic-bezier(.2,.9,.3,1)" : "cubic-bezier(.16,1,.3,1)", fill: "backwards" },
      );
      if (pop) this.later(() => this.cue(b, "wave"), b.enterDelay + 380);
      b.enter = undefined;
    }
  }
  hover(key: string, on: boolean) {
    const b = this.bodies.get(key);
    const v = this.view(key);
    if (!b || !v || v.mode !== "roam") return;
    b.hovered = on;
    if (on) {
      this.cue(b, "wiggle", 1100);
      this.patch(key, { mood: "happy" });
    } else this.patch(key, { mood: this.listening() ? "curious" : homeMood(b.id) });
  }

  // ── Lifecycle ──

  start() {
    taps.add(this.onEvent);
    document.addEventListener("input", this.onInput, true);
    document.addEventListener("click", this.onClick, true);
    addEventListener("resize", this.onResize);
    this.wake();
  }
  stop() {
    taps.delete(this.onEvent);
    document.removeEventListener("input", this.onInput, true);
    document.removeEventListener("click", this.onClick, true);
    removeEventListener("resize", this.onResize);
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.timers.forEach(clearTimeout);
    this.notes.forEach((n) => n.el.remove());
    this.releaseAll();
  }
  setReduced(r: boolean) {
    if (r === this.reduced) return;
    this.reduced = r;
    // Simplest honest switch: put everyone back at rest where they are.
    for (const b of this.bodies.values()) (b.vx = 0), (b.vy = 0), (b.tilt = 0);
    this.wake();
  }
  wake = () => {
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  };
  private later(fn: () => void, ms: number) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }
  /** The squad picker and popovers change on clicks: look again shortly after. */
  private onClick = () => {
    this.later(() => ((this.envAt = -Infinity), this.wake()), 60);
  };
  /** Reduced motion: nobody walks, but nobody may sit on the text either. */
  private settleStill() {
    const R = this.radius();
    for (const b of this.bodies.values()) {
      if (this.view(b.key)?.mode !== "roam") continue;
      if (this.env.obstacles.some((o) => awayFrom(b.x, b.y, o).d < R + 6)) {
        const p = this.freeSpot(b.rand);
        (b.x = p.x), (b.y = p.y);
      }
      b.s = this.scaleHome();
      this.write(b);
    }
  }
  private onResize = () => {
    this.envAt = -Infinity;
    this.wake();
  };

  // ── The loop ──

  private tick = (now: number) => {
    this.raf = 0;
    const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;
    const p = phase();

    if (p === "home") {
      const entering = this.prev !== "home";
      if (entering) (this.waitUntil = 0), (this.envAt = -Infinity);
      if (now - this.envAt > 250) {
        this.envAt = now;
        this.refreshEnv();
        this.sync(entering);
        if (this.reduced) this.settleStill();
      }
      if (S.starting && !this.armed) {
        this.armed = true;
        this.listenUntil = now + 8000; // gather round the bar while the run starts
        this.setListening(true);
        let i = 0;
        for (const b of this.bodies.values()) this.cue(b, "bounce", 0, i++ * 60);
      } else if (!S.starting && this.armed) {
        this.armed = false; // the start failed or was cancelled: back to roaming
        this.listenUntil = 0;
      }
      if (this.listenUntil && now > this.listenUntil) (this.listenUntil = 0), this.setListening(false);
    } else if (this.prev === "home") {
      this.listenUntil = 0;
      if (this.armed && !this.reduced) this.waitUntil = now + 3000;
      else this.dismiss();
      this.armed = false;
    }
    if (this.waitUntil) {
      const dots = rowDots();
      if (dots.size) (this.waitUntil = 0), this.launch(dots, now);
      else if (now > this.waitUntil) (this.waitUntil = 0), this.dismiss();
    }
    this.prev = p;

    for (const b of this.bodies.values()) {
      if (b.move) this.stepMove(b, now);
      else if (b.hold) this.stepHold(b, now);
      else if (b.physics && !this.reduced) this.stepPhysics(b, dt, now);
      this.write(b);
    }
    for (const n of this.notes) this.stepNote(n, now);

    const animating = !this.reduced && (this.bodies.size > 0 || this.notes.size > 0 || this.waitUntil > 0);
    if (animating) this.raf = requestAnimationFrame(this.tick);
    else this.last = 0;
  };

  private write(b: Body) {
    if (!b.el) return;
    const t = `translate3d(${(b.x - ORIGIN).toFixed(1)}px,${(b.y - ORIGIN).toFixed(1)}px,0) rotate(${b.tilt.toFixed(2)}deg) scale(${b.s.toFixed(3)})`;
    const key = `${t}|${b.op.toFixed(2)}|${b.cover.toFixed(2)}`;
    if (key === b.written) return;
    b.written = key;
    b.el.style.transform = t;
    b.el.style.opacity = b.op.toFixed(2);
    if (b.coverEl) b.coverEl.style.opacity = b.cover.toFixed(2);
  }

  // ── Home: who's here, and where they may go ──

  private scaleHome() {
    return innerWidth < 640 ? 0.54 : 0.83; // ~52px on phones, ~80px elsewhere
  }
  private radius() {
    return (BODY * this.scaleHome()) / 2;
  }
  private refreshEnv() {
    const home = rectOf(document.getElementById("home"));
    const R = this.radius();
    this.env.bounds = home ? { l: home.l + 4, t: home.t + 4, r: home.r - 4, b: home.b - 4 } : { l: 60, t: 60, r: innerWidth, b: innerHeight };
    const obstacles: Rect[] = [];
    for (const sel of ["#home h1", "#home .sub", "#home-slot .pillbox", "#footnote", "#banner:not([hidden])"]) {
      const r = rectOf(document.querySelector(sel), 6);
      if (r) obstacles.push(r);
    }
    document.querySelectorAll("#home .pop").forEach((el) => {
      const r = rectOf(el, 8);
      if (r) obstacles.push(r);
    });
    const hint = document.getElementById("hint");
    if (hint?.textContent) {
      const r = rectOf(hint, 4);
      if (r) obstacles.push(r);
    }
    this.env.obstacles = obstacles;
    this.env.bar = rectOf(document.querySelector("#home-slot .pillbox"));
    this.env.chip = centerOf(document.getElementById("agents-chip"));
    void R;
  }

  /** Match the roaming cast to the chosen squad size. `entering`: we just came (back) home. */
  private sync(entering: boolean) {
    const n = readSquad();
    setLastSquad(n);
    const want = CAST.slice(0, n).map((c) => c.id as BotId);
    const here = [...this.bodies.values()];
    let added = 0;
    for (const id of want) {
      const b = here.find((x) => x.id === id && this.view(x.key)?.mode === "roam");
      if (b) continue;
      const leaving = here.find((x) => x.id === id && this.view(x.key)?.mode === "leave");
      if (leaving && leaving.popEl) {
        // Changed its mind: wake back up.
        leaving.popEl.getAnimations().forEach((a) => a.cancel());
        leaving.physics = true;
        this.patch(leaving.key, { mode: "roam", resting: false });
        continue;
      }
      if (here.some((x) => x.id === id && ["fly", "handoff", "settle"].includes(this.view(x.key)?.mode ?? ""))) continue;
      this.add(id, entering || !this.prev ? "fade" : "pop", added++ * (entering ? 110 : 160));
    }
    for (const b of here) if (!want.includes(b.id) && this.view(b.key)?.mode === "roam") this.leave(b);
  }

  private freeSpot(rand: () => number, near?: P | null): P {
    const { bounds: B, obstacles } = this.env;
    const R = this.radius();
    let best: P = { x: (B.l + B.r) / 2, y: B.t + R + 20 };
    let bestScore = -Infinity;
    for (let i = 0; i < 48; i++) {
      const p = { x: lerp(B.l + R + 14, B.r - R - 14, rand()), y: lerp(B.t + R + 14, B.b - R - 14, rand()) };
      let clear = Infinity;
      for (const o of obstacles) clear = Math.min(clear, awayFrom(p.x, p.y, o).d - R - 12);
      for (const b of this.bodies.values()) clear = Math.min(clear, Math.hypot(b.x - p.x, b.y - p.y) - R * 2 - 24);
      if (clear < 0) continue;
      const score = near ? -Math.hypot(near.x - p.x, near.y - p.y) : Math.min(clear, 140) + rand() * 40;
      if (score > bestScore) (bestScore = score), (best = p);
    }
    return best;
  }

  private body(id: BotId, at: P, s: number, rest: Partial<Body> = {}): Body {
    const key = `${id}-${++this.seq}`;
    const rand = mulberry32(hash(`${key}:roam`));
    const b: Body = {
      key, id, x: at.x, y: at.y, vx: 0, vy: 0, s, tilt: 0, heading: rand() * Math.PI * 2, op: 1, cover: 0,
      speed: 26 / HABITS[id].pace, rest: 0, hovered: false, physics: false, rand, lastCue: 0, enterDelay: 0, written: "", ...rest,
    };
    this.bodies.set(key, b);
    return b;
  }

  private add(id: BotId, how: "pop" | "fade", delay: number) {
    const rand = mulberry32(hash(`${id}:${this.seq}:spot`));
    const at = this.freeSpot(rand, how === "pop" ? this.env.chip : null);
    const b = this.body(id, at, this.scaleHome(), { physics: true, enter: how, enterDelay: delay });
    this.views = [...this.views, { key: b.key, id, mood: this.listening() ? "curious" : homeMood(id), resting: false, mode: "roam" }];
    this.commit();
    this.wake();
  }

  private remove(key: string) {
    const b = this.bodies.get(key);
    b?.popEl?.getAnimations().forEach((a) => a.cancel());
    this.bodies.delete(key);
    this.views = this.views.filter((v) => v.key !== key);
    this.commit();
  }

  private leave(b: Body) {
    this.patch(b.key, { mode: "leave", resting: true, attention: undefined });
    b.vx *= 0.3;
    b.vy *= 0.3;
    b.physics = false;
    const key = b.key;
    this.later(() => {
      const cur = this.bodies.get(key);
      if (!cur || this.view(key)?.mode !== "leave") return;
      const anim = cur.popEl?.animate([{ transform: "scale(1)", opacity: 1 }, { transform: "scale(.2) translateY(14px)", opacity: 0 }], {
        duration: this.reduced ? 160 : 380,
        easing: "cubic-bezier(.5,0,.75,0)",
        fill: "forwards",
      });
      if (anim) anim.onfinish = () => this.view(key)?.mode === "leave" && this.remove(key);
      else this.remove(key);
    }, this.reduced ? 0 : 650);
  }

  /** Off they go without a flight (a chat opened from the list, reduced motion, nowhere to land). */
  private dismiss() {
    for (const b of [...this.bodies.values()]) {
      if (this.view(b.key)?.mode !== "roam" && this.view(b.key)?.mode !== "leave") continue;
      b.physics = false;
      const key = b.key;
      const anim = b.popEl?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: "ease-out", fill: "forwards" });
      if (anim) anim.onfinish = () => this.remove(key);
      else this.remove(key);
    }
  }

  // ── Typing: they come and listen ──

  private listening() {
    return this.listenUntil > performance.now();
  }
  private onInput = (ev: Event) => {
    const t = ev.target as HTMLTextAreaElement | null;
    if (t?.id !== "input" || phase() !== "home") return;
    const now = performance.now();
    if (!t.value.trim()) {
      if (this.listenUntil) (this.listenUntil = 0), this.setListening(false);
      return;
    }
    const fresh = !this.listening();
    this.listenUntil = now + 2600;
    if (fresh) {
      this.envAt = -Infinity;
      this.refreshEnv();
      this.setListening(true);
      let i = 0;
      for (const b of this.bodies.values()) this.cue(b, "bounce", 0, i++ * 70);
    } else if (now - this.lastKey > 420) {
      // A new burst of keys: one or two of them bounce.
      const list = [...this.bodies.values()].filter((b) => this.view(b.key)?.mode === "roam");
      const pick = list.sort(() => Math.random() - 0.5).slice(0, list.length > 2 ? 2 : 1);
      pick.forEach((b, i) => this.cue(b, Math.random() > 0.35 ? "bounce" : "nod", 700, i * 90));
    }
    this.lastKey = now;
    this.wake();
  };

  private setListening(on: boolean) {
    const roam = [...this.bodies.values()].filter((b) => this.view(b.key)?.mode === "roam");
    const spots = on ? this.listenSpots(roam.length) : [];
    // Greedy nearest pairing (spots above the title cost a little more, so the bar wins when it can).
    const free = new Set(spots);
    const left = new Set(roam);
    while (left.size && free.size) {
      let best: [Body, P & { cost: number }] | null = null;
      let bestD = Infinity;
      for (const b of left)
        for (const s of free) {
          const d = Math.hypot(s.x - b.x, s.y - b.y) + s.cost;
          if (d < bestD) (bestD = d), (best = [b, s]);
        }
      if (!best) break;
      best[0].spot = best[1];
      left.delete(best[0]);
      free.delete(best[1]);
    }
    for (const b of left) b.spot = undefined;
    const bar = this.env.bar;
    for (const b of roam) {
      b.rest = 0;
      const look = on && bar && b.spot ? ((bar.l + bar.r) / 2 < b.spot.x ? -1 : 1) : undefined;
      this.patch(b.key, { attention: look as -1 | 1 | undefined, mood: on ? "curious" : b.hovered ? "happy" : homeMood(b.id) });
    }
  }

  /** Places to stand and listen: the bar's ends, a row under it, and (spare) a row over the title. */
  private listenSpots(n: number): (P & { cost: number })[] {
    const bar = this.env.bar;
    const B = this.env.bounds;
    if (!bar || !n) return [];
    const R = this.radius();
    const cy = (bar.t + bar.b) / 2;
    const spots: (P & { cost: number })[] = [];
    if (bar.l - B.l > R * 2 + 30) spots.push({ x: bar.l - R - 20, y: cy, cost: 0 });
    if (B.r - bar.r > R * 2 + 30) spots.push({ x: bar.r + R + 20, y: cy, cost: 0 });
    const row = (y: number, count: number, cost: number) => {
      for (let i = 0; i < count; i++) spots.push({ x: lerp(bar.l + R, bar.r - R, count === 1 ? 0.5 : i / (count - 1)), y: y + (i % 2 ? 8 : 0), cost });
    };
    const fit = Math.max(1, Math.min(n, Math.floor((bar.r - bar.l) / (R * 2 + 22))));
    row(Math.min(bar.b + R + 26, B.b - R - 4), fit, 0);
    const title = rectOf(document.querySelector("#home h1"));
    if (title && title.t - B.t > R * 2 + 20) row(title.t - R - 18, fit, 140);
    return spots;
  }

  private cue(b: Body, gesture: Gesture, throttle = 0, delay = 0) {
    const now = performance.now();
    if (throttle && now - b.lastCue < throttle) return;
    b.lastCue = now + delay;
    const go = () => this.bodies.has(b.key) && this.patch(b.key, { cue: { gesture, serial: ++this.serial } });
    if (delay) this.later(go, delay);
    else go();
  }

  // ── Steering ──

  private stepPhysics(b: Body, dt: number, now: number) {
    const { bounds: B, obstacles } = this.env;
    const R = this.radius();
    const listening = Boolean(b.spot) && this.listening();
    const maxV = this.armed ? 170 : listening ? 95 : b.speed;
    let ax = 0;
    let ay = 0;
    let dvx = 0;
    let dvy = 0;
    if (b.hovered) {
      // stand still and look at you
    } else if (listening && b.spot) {
      const dx = b.spot.x - b.x;
      const dy = b.spot.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      const v = maxV * Math.min(1, d / 110);
      dvx = (dx / d) * v;
      dvy = (dy / d) * v;
    } else if (now > b.rest) {
      b.heading += (b.rand() - 0.5) * 5 * dt;
      dvx = Math.cos(b.heading) * b.speed;
      dvy = Math.sin(b.heading) * b.speed;
      // Now and then they stop and take it in (the life rig fills the pause with habits).
      if (b.rand() < dt * 0.09) b.rest = now + 1400 + b.rand() * 2600;
    }
    const k = b.hovered ? 6 : 2.4;
    ax += (dvx - b.vx) * k;
    ay += (dvy - b.vy) * k;

    for (const o of this.bodies.values()) {
      if (o === b || !o.physics) continue;
      const dx = b.x - o.x;
      const dy = b.y - o.y;
      const d = Math.hypot(dx, dy);
      const range = R * 2 + 30;
      if (d > 0.01 && d < range) {
        const f = Math.pow(1 - d / range, 1.5) * 260;
        ax += (dx / d) * f;
        ay += (dy / d) * f;
      }
    }
    const band = R + 26;
    for (const o of obstacles) {
      const a = awayFrom(b.x, b.y, o);
      if (a.d < band) {
        const f = a.d === 0 ? 900 : Math.pow(1 - a.d / band, 2) * 620 + (a.d < R ? 260 : 0);
        ax += a.nx * f;
        ay += a.ny * f;
        if (listening && b.spot) {
          // Slide round the text toward the spot rather than pressing into it.
          let tx = -a.ny;
          let ty = a.nx;
          if (tx * (b.spot.x - b.x) + ty * (b.spot.y - b.y) < 0) (tx = -tx), (ty = -ty);
          ax += tx * Math.max(f, 160);
          ay += ty * Math.max(f, 160);
        }
        if (!listening) b.heading = turnToward(b.heading, Math.atan2(a.ny, a.nx), a.d < R ? 0.2 : 0.04);
      }
    }
    const m = R + 10;
    const cx = (B.l + B.r) / 2;
    const cy = (B.t + B.b) / 2;
    if (b.x < B.l + m || b.x > B.r - m || b.y < B.t + m || b.y > B.b - m) {
      ax += clamp(B.l + m - b.x, 0, 80) * 8 - clamp(b.x - (B.r - m), 0, 80) * 8;
      ay += clamp(B.t + m - b.y, 0, 80) * 8 - clamp(b.y - (B.b - m), 0, 80) * 8;
      b.heading = turnToward(b.heading, Math.atan2(cy - b.y, cx - b.x), 0.06);
    }

    b.vx += ax * dt;
    b.vy += ay * dt;
    const v = Math.hypot(b.vx, b.vy);
    const cap = maxV * 1.8;
    if (v > cap) (b.vx *= cap / v), (b.vy *= cap / v);
    b.x = clamp(b.x + b.vx * dt, B.l + R * 0.6, B.r - R * 0.6);
    b.y = clamp(b.y + b.vy * dt, B.t + R * 0.6, B.b - R * 0.6);
    // Lean into the walk, a touch.
    b.tilt += (clamp(b.vx * 0.11, -7, 7) - b.tilt) * Math.min(1, dt * 5);
    b.s += (this.scaleHome() - b.s) * Math.min(1, dt * 4);
  }

  private stepMove(b: Body, now: number) {
    const m = b.move!;
    const k = clamp((now - m.t0) / m.dur, 0, 1);
    const to = m.to() ?? m.last ?? { x: m.from.x, y: m.from.y, s: m.from.s };
    m.last = to;
    const e = m.ease(k);
    b.x = lerp(m.from.x, to.x, e);
    b.y = lerp(m.from.y, to.y, e) - m.arc * Math.sin(Math.PI * clamp(e, 0, 1));
    b.s = Math.max(0.01, lerp(m.from.s, to.s, e));
    b.tilt = lerp(m.from.tilt, 0, Math.min(1, e));
    if (m.cover) b.cover = lerp(m.cover.from, m.cover.to, clamp((k - m.cover.a) / (m.cover.b - m.cover.a), 0, 1));
    if (m.fade) b.op = lerp(m.fade.from, m.fade.to, k);
    if (k >= 1) {
      b.move = undefined;
      m.onLand?.();
    }
  }

  private stepHold(b: Body, now: number) {
    const h = b.hold!;
    const t = h.target();
    if (t) (b.x = t.x), (b.y = t.y), (b.s = t.s);
    if (h.ready() || now > h.until) {
      b.hold = undefined;
      h.then();
    }
  }

  private stepNote(n: Note, now: number) {
    const k = clamp((now - n.t0) / n.dur, 0, 1);
    const from = n.from() ?? n.lastFrom;
    const to = n.to();
    if (from) n.lastFrom = from;
    if (!from || !to) {
      if (k >= 1) (this.notes.delete(n), n.el.remove(), n.onLand());
      return;
    }
    if (k <= 0) return void (n.el.style.opacity = "0");
    const e = easeInOutCubic(k);
    const x = lerp(from.x, to.x, e);
    const y = lerp(from.y, to.y, e) - 46 * Math.sin(Math.PI * e);
    const s = k < 0.15 ? lerp(0.4, 1, k / 0.15) : lerp(1, 0.45, clamp((k - 0.75) / 0.25, 0, 1));
    n.el.style.opacity = k > 0.92 ? String((1 - k) / 0.08) : "1";
    n.el.style.transform = `translate3d(${(x - 8).toFixed(1)}px,${(y - 6).toFixed(1)}px,0) rotate(${lerp(-14, 6, e).toFixed(1)}deg) scale(${s.toFixed(3)})`;
    if (k >= 1) {
      this.notes.delete(n);
      n.el.remove();
      n.onLand();
    }
  }

  // ── Send: into the dots ──

  private launch(dots: Map<BotId, HTMLElement>, now: number) {
    const list = [...this.bodies.values()].filter((b) => ["roam", "leave"].includes(this.view(b.key)?.mode ?? "")).sort((a, b) => a.id.localeCompare(b.id));
    let i = 0;
    for (const b of list) {
      const dot = dots.get(b.id);
      if (!dot || this.view(b.key)?.mode === "leave") {
        this.leave(b);
        continue;
      }
      dot.style.visibility = "hidden";
      b.physics = false;
      b.hovered = false;
      this.patch(b.key, { mode: "fly", attention: undefined, mood: "calm" });
      const key = b.key;
      b.move = {
        t0: now + i++ * 70,
        dur: 760,
        from: { x: b.x, y: b.y, s: b.s, tilt: b.tilt },
        to: () => dotTarget(dot),
        ease: easeOutExpo,
        arc: 0,
        cover: { from: 0, to: 1, a: 0.12, b: 0.55 },
        onLand: () => {
          dot.style.visibility = "";
          dot.classList.remove("landed");
          void dot.offsetWidth;
          dot.classList.add("landed");
          this.remove(key);
        },
      };
    }
  }

  // ── Plan ready: out of the dots, a task each, off to the tiles ──

  private onEvent = (e: ServerEvent, replaying: boolean) => {
    if (replaying || e.type !== "plan.ready" || this.reduced) return;
    const dots = rowDots();
    if (!dots.size) return;
    const plan = new Set<BotId>((e.data?.assignments ?? []).map((a: { botId: BotId }) => a.botId));
    const fallbackOnyx = centerOf(document.querySelector("#thinking-row .thinking-onyx"));
    // Anyone still on the way into a dot lands now.
    for (const b of [...this.bodies.values()]) if (this.view(b.key)?.mode === "fly") this.remove(b.key);

    const now = performance.now();
    const ids = [...dots.keys()];
    const rowAt = dots.get(ids[0])!.getBoundingClientRect();
    const spread = Math.min(52, (Math.min(innerWidth, 430) - 70) / Math.max(1, ids.length));
    // Where they stand while Onyx hands out the tasks: just above the busy line, riding along as the
    // chat slides over to the side.
    const anchor = (): P => {
      const a = rectOf(document.getElementById("activity")) ?? rectOf(document.getElementById("chat-slot"));
      const chat = rectOf(document.getElementById("chat"));
      if (!a || !chat) return { x: rowAt.left + 50, y: rowAt.top };
      return { x: Math.max(chat.l + 16, a.l) + 54, y: a.t - 30 };
    };
    for (const id of plan) this.holds.add(id);
    this.applyHolds();
    clearTimeout(this.holdTimer);
    this.holdTimer = setTimeout(() => this.releaseAll(), 6000);

    let n = 0;
    ids.forEach((id, idx) => {
      const dot = dots.get(id)!;
      const start = dotTarget(dot);
      if (!start) return;
      const inPlan = plan.has(id);
      const b = this.body(id, start, start.s, { cover: 1 });
      this.views = [...this.views, { key: b.key, id, mood: "curious", resting: !inPlan, mode: inPlan ? "handoff" : "settle" }];
      const spot = () => {
        const a = anchor();
        return { x: a.x + idx * spread, y: a.y - (inPlan ? 14 : 0), s: inPlan ? HAND : 0.34 };
      };
      const key = b.key;
      b.move = {
        t0: now + idx * 55,
        dur: 440,
        from: { ...start, tilt: 0 },
        to: spot,
        ease: easeOutBack,
        arc: 0,
        cover: { from: 1, to: 0, a: 0.1, b: 0.6 },
        fade: inPlan ? undefined : { from: 1, to: 0.35 },
        onLand: () => {
          // Ride along with the chat until the next step takes over.
          const cur = this.bodies.get(key);
          if (cur) cur.hold = { target: spot, until: performance.now() + (inPlan ? 4000 : 250), ready: () => false, then: () => void (inPlan || this.fadeOut(key, 350, spot)) };
        },
      };
      if (!inPlan) return;
      const order = n++;
      // The task note: from Onyx's pinned card (it mounts as the layout changes) to the agent.
      const note = document.createElement("i");
      note.className = "roam-note";
      note.style.setProperty("--c", castFor(id).color);
      note.style.opacity = "0";
      this.layer?.appendChild(note);
      this.notes.add({
        el: note,
        t0: now + 260 + order * 130,
        dur: 560,
        from: () => onyxPoint() ?? fallbackOnyx,
        to: () => {
          const cur = this.bodies.get(key);
          return cur ? { x: cur.x, y: cur.y - 4 } : null;
        },
        onLand: () => {
          const cur = this.bodies.get(key);
          if (!cur) return;
          this.cue(cur, "nod");
          this.patch(key, { mood: "focused" });
          this.later(() => this.toTile(key), 200);
        },
      });
    });
    this.commit();
    this.wake();
  };

  private toTile(key: string) {
    const b = this.bodies.get(key);
    if (!b) return;
    const id = b.id;
    b.move = {
      t0: performance.now(),
      dur: 820,
      from: { x: b.x, y: b.y, s: b.s, tilt: 0 },
      to: () => tileTarget(id),
      ease: easeInOutCubic,
      arc: 70,
      onLand: () => {
        if (!tileTarget(id)) return void (this.release(id), this.fadeOut(key, 200));
        // Wait (riding along) until the studio has its own character there, then hand over.
        b.hold = {
          target: () => tileTarget(id),
          until: performance.now() + 1800,
          ready: () => tileShown(id),
          then: () => {
            this.release(id);
            this.fadeOut(key, 160, () => tileTarget(id));
          },
        };
      },
    };
    this.wake();
  }

  private fadeOut(key: string, ms: number, follow?: () => Target | null) {
    const b = this.bodies.get(key);
    if (!b) return;
    const still = { x: b.x, y: b.y, s: b.s };
    b.move = {
      t0: performance.now(),
      dur: ms,
      from: { x: b.x, y: b.y, s: b.s, tilt: b.tilt },
      to: () => follow?.() ?? still,
      ease: (k) => k,
      arc: 0,
      fade: { from: b.op, to: 0 },
      onLand: () => this.remove(key),
    };
    this.wake();
  }

  private applyHolds() {
    const root = document.documentElement;
    if (this.holds.size) root.dataset.roamHold = [...this.holds].join(" ");
    else delete root.dataset.roamHold;
  }
  private release(id: BotId) {
    this.holds.delete(id);
    this.applyHolds();
  }
  private releaseAll() {
    this.holds.clear();
    this.applyHolds();
  }
}

const Roamer = memo(function Roamer({ v, reduced, roam }: { v: View; reduced: boolean; roam: Roam }) {
  return (
    <div
      className={`roamer roamer-${v.mode}`}
      data-roamer={v.id}
      ref={(el) => roam.register(v.key, el)}
      onPointerEnter={(e) => e.pointerType === "mouse" && roam.hover(v.key, true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && roam.hover(v.key, false)}
    >
      <div className="roamer-pop">
        <BotCharacter id={v.id} mood={v.mood} size={SIZE} reduced={reduced} seed={`roam-${v.key}`} interactive={v.mode === "roam"} cue={v.cue} attention={v.attention} resting={v.resting} />
        <i className="roamer-cover" style={{ background: castFor(v.id).color }} />
      </div>
    </div>
  );
});

export function RoamLayer({ reduced }: { reduced: boolean }) {
  useLive();
  const [views, setViews] = useState<View[]>([]);
  const [roam] = useState(() => new Roam(setViews, reduced));
  if (import.meta.env.DEV) (window as unknown as { __roam: Roam }).__roam = roam;
  useEffect(() => {
    roam.start();
    return () => roam.stop();
  }, [roam]);
  useEffect(() => roam.setReduced(reduced), [roam, reduced]);
  useEffect(() => roam.wake()); // after any store change: the phase may have moved
  return (
    <div className="roam-layer" ref={(el) => void (roam.layer = el)}>
      {views.map((v) => (
        <Roamer key={v.key} v={v} reduced={reduced} roam={roam} />
      ))}
    </div>
  );
}
